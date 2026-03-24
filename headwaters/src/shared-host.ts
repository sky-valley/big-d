import { createServer, type Server, type Socket } from 'net';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { IntentStore } from '../../intent-space/src/store.ts';
import type { AuthRequest, AuthenticatedITPMessage, MessageEcho, ScanRequest, ServerMessage, StoredMessage } from '../../intent-space/src/types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import { verifyAuthRequest, verifyPerMessageProof, type StationSessionAuth } from '../../intent-space/src/auth.ts';
import { buildServiceIntents } from '../../intent-space/src/service-intents.ts';
import { HEADWATERS_COMMONS_SPACE_ID, commonsStationAudience } from './contract.ts';
import type { ProvisionedSpace } from './provisioner.ts';

const MAX_LINE_LENGTH = 1024 * 1024;

interface HostedSpace {
  audience: string;
  agentId: string;
  store: IntentStore;
}

interface ClientConnection {
  socket: Socket;
  buffer: string;
  authenticated?: StationSessionAuth & { spaceId: string };
}

export interface SharedHeadwatersHostOptions {
  dataDir: string;
  host: string;
  port: number;
  authSecret: string;
}

export class SharedHeadwatersHost {
  private readonly dataDir: string;
  private readonly spacesDir: string;
  private readonly host: string;
  private readonly authSecret: string;
  private readonly spaces = new Map<string, HostedSpace>();
  private readonly spacesByAudience = new Map<string, HostedSpace>();
  private readonly clients = new Set<ClientConnection>();
  private server: Server | null = null;
  private _port: number;

  constructor(options: SharedHeadwatersHostOptions) {
    this.dataDir = options.dataDir;
    this.spacesDir = join(options.dataDir, 'spaces');
    this.host = options.host;
    this._port = options.port;
    this.authSecret = options.authSecret;
    mkdirSync(this.dataDir, { recursive: true });
    this.ensureCommons();
  }

  get port(): number {
    return this._port;
  }

  get endpoint(): string {
    return `tcp://${this.host}:${this._port}`;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));
      this.server.on('error', reject);
      this.server.listen(this._port, this.host, () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    for (const hosted of this.spaces.values()) {
      hosted.store.close();
    }
    this.spaces.clear();
    this.spacesByAudience.clear();
  }

  ensureProvisionedSpace(record: ProvisionedSpace): void {
    if (this.spaces.has(record.spaceId)) return;
    const store = new IntentStore(join(this.dataDir, 'spaces', record.spaceId, 'intent-space.db'));
    this.registerSpace({
      spaceId: record.spaceId,
      audience: record.audience,
      agentId: `headwaters-space:${record.spaceId}`,
      store,
    });
  }

  loadProvisionedSpaces(records: ProvisionedSpace[]): void {
    for (const record of records) {
      this.ensureProvisionedSpace(record);
    }
  }

  private ensureCommons(): void {
    const store = new IntentStore(join(this.dataDir, 'commons', 'intent-space.db'));
    const commons = {
      spaceId: HEADWATERS_COMMONS_SPACE_ID,
      audience: commonsStationAudience(),
      agentId: 'headwaters-commons',
      store,
    };
    for (const msg of buildServiceIntents(commons.agentId)) {
      if (!store.has(msg.intentId!)) {
        store.post(msg);
      }
    }
    this.registerSpace(commons);
  }

  private registerSpace(input: { spaceId: string; audience: string; agentId: string; store: IntentStore }): void {
    const hosted: HostedSpace = {
      audience: input.audience,
      agentId: input.agentId,
      store: input.store,
    };
    this.spaces.set(input.spaceId, hosted);
    this.spacesByAudience.set(input.audience, hosted);
  }

  private tryLoadProvisionedSpace(spaceId: string): void {
    const path = join(this.spacesDir, spaceId, 'space.json');
    if (!existsSync(path)) return;
    try {
      const record = JSON.parse(readFileSync(path, 'utf8')) as ProvisionedSpace;
      if (record.spaceId === spaceId && typeof record.audience === 'string') {
        this.ensureProvisionedSpace(record);
      }
    } catch {
      // ignore malformed persisted records
    }
  }

  private handleConnection(socket: Socket): void {
    const client: ClientConnection = { socket, buffer: '' };
    this.clients.add(client);
    socket.on('data', (chunk: Buffer) => this.handleData(client, chunk.toString()));
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
  }

  private handleData(client: ClientConnection, chunk: string): void {
    client.buffer += chunk;
    if (client.buffer.length > MAX_LINE_LENGTH) {
      this.send(client, { type: 'ERROR', message: `Line exceeds ${MAX_LINE_LENGTH} bytes` });
      client.buffer = '';
      return;
    }
    const lines = client.buffer.split('\n');
    client.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.handleMessage(client, JSON.parse(line) as AuthRequest | ScanRequest | AuthenticatedITPMessage);
      } catch {
        this.send(client, { type: 'ERROR', message: 'Invalid JSON' });
      }
    }
  }

  private handleMessage(client: ClientConnection, msg: AuthRequest | ScanRequest | AuthenticatedITPMessage): void {
    if (msg.type === 'AUTH') {
      this.handleAuth(client, msg);
      return;
    }
    if (!client.authenticated) {
      this.send(client, { type: 'ERROR', message: 'Authenticate before station participation' });
      return;
    }
    if (msg.type === 'SCAN') {
      this.handleScan(client, msg);
      return;
    }
    this.handlePost(client, msg);
  }

  private handleAuth(client: ClientConnection, msg: AuthRequest): void {
    try {
      const auth = verifyAuthRequest(msg, this.authSecret);
      const spaceId = auth.spaceId ?? HEADWATERS_COMMONS_SPACE_ID;
      let hosted = this.spaces.get(spaceId);
      if (!hosted) {
        this.tryLoadProvisionedSpace(spaceId);
        hosted = this.spaces.get(spaceId);
      }
      if (!hosted) {
        throw new Error(`Unknown hosted space ${spaceId}`);
      }
      if (auth.audience !== hosted.audience) {
        throw new Error('Station token aud mismatch for hosted space');
      }
      client.authenticated = { ...auth, spaceId };
      this.send(client, {
        type: 'AUTH_RESULT',
        senderId: auth.senderId,
        spaceId,
        tutorialSpaceId: spaceId === HEADWATERS_COMMONS_SPACE_ID ? HEADWATERS_COMMONS_SPACE_ID : undefined,
      });
    } catch (err) {
      this.send(client, {
        type: 'ERROR',
        message: `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private handleScan(client: ClientConnection, msg: ScanRequest): void {
    const session = client.authenticated!;
    const hosted = this.spaces.get(session.spaceId)!;
    try {
      verifyPerMessageProof(session, msg.proof, msg, session.audience);
      const messages = hosted.store.scan(msg.spaceId, msg.since ?? 0, session.senderId);
      this.send(client, {
        type: 'SCAN_RESULT',
        spaceId: msg.spaceId,
        messages,
        latestSeq: hosted.store.latestSeq,
      });
    } catch (err) {
      this.send(client, { type: 'ERROR', message: err instanceof Error ? err.message : String(err) });
    }
  }

  private handlePost(client: ClientConnection, msg: AuthenticatedITPMessage): void {
    const session = client.authenticated!;
    const hosted = this.spaces.get(session.spaceId)!;
    try {
      verifyPerMessageProof(session, msg.proof, msg, session.audience);
    } catch (err) {
      this.send(client, { type: 'ERROR', message: `Proof validation failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    if (!hosted.store.canAccessSpace(msg.parentId ?? 'root', session.senderId)) {
      this.send(client, { type: 'ERROR', message: `Access denied to space ${msg.parentId ?? 'root'}` });
      return;
    }
    const storedMessage: ITPMessage = {
      type: msg.type,
      promiseId: msg.promiseId,
      intentId: msg.intentId,
      parentId: msg.parentId,
      timestamp: msg.timestamp,
      senderId: msg.senderId,
      payload: msg.payload,
    };
    try {
      const seq = hosted.store.post(storedMessage);
      const echo: MessageEcho = { ...msg, seq };
      this.broadcastWithinSpace(session.spaceId, echo);
    } catch (err) {
      this.send(client, { type: 'ERROR', message: `Failed to persist: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private broadcastWithinSpace(boundSpaceId: string, msg: ServerMessage): void {
    const hosted = this.spaces.get(boundSpaceId)!;
    const line = JSON.stringify(msg) + '\n';
    for (const client of this.clients) {
      if (client.authenticated?.spaceId !== boundSpaceId) continue;
      if ('parentId' in msg && typeof msg.parentId === 'string' && !hosted.store.canAccessSpace(msg.parentId, client.authenticated.senderId)) {
        continue;
      }
      try {
        client.socket.write(line);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private send(client: ClientConnection, msg: ServerMessage): void {
    try {
      client.socket.write(JSON.stringify(msg) + '\n');
    } catch {
      this.clients.delete(client);
    }
  }
}
