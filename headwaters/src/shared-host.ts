import { createServer, type Server, type Socket } from 'net';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { IntentStore } from '../../intent-space/src/store.ts';
import type {
  AuthRequest,
  AuthenticatedITPMessage,
  MessageEcho,
  MonitoringEventInput,
  ScanRequest,
  ServerMessage,
} from '../../intent-space/src/types.ts';
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
  id: string;
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
  private connectionCount = 0;

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
    const client: ClientConnection = {
      id: `conn-${++this.connectionCount}`,
      socket,
      buffer: '',
    };
    this.clients.add(client);
    this.recordMonitoring({
      stage: 'connection',
      outcome: 'accepted',
      eventType: 'connection_opened',
      connectionId: client.id,
      detail: {},
    });
    socket.on('data', (chunk: Buffer) => this.handleData(client, chunk.toString()));
    socket.on('close', () => {
      this.clients.delete(client);
      this.recordMonitoring({
        stage: 'connection',
        outcome: 'accepted',
        eventType: 'connection_closed',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: client.authenticated?.spaceId,
        detail: {},
      });
    });
    socket.on('error', (err) => {
      this.clients.delete(client);
      this.recordMonitoring({
        stage: 'connection',
        outcome: 'failed',
        eventType: 'connection_error',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: client.authenticated?.spaceId,
        detail: {
          message: err instanceof Error ? err.message : String(err),
        },
      });
    });
  }

  private handleData(client: ClientConnection, chunk: string): void {
    client.buffer += chunk;
    if (client.buffer.length > MAX_LINE_LENGTH) {
      this.recordMonitoring({
        stage: 'parse',
        outcome: 'rejected',
        eventType: 'line_too_long',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: client.authenticated?.spaceId,
        detail: {
          size: client.buffer.length,
          max: MAX_LINE_LENGTH,
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: `Line exceeds ${MAX_LINE_LENGTH} bytes` });
      client.buffer = '';
      return;
    }
    const lines = client.buffer.split('\n');
    client.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as AuthRequest | ScanRequest | AuthenticatedITPMessage;
        this.recordMonitoring({
          stage: 'parse',
          outcome: 'accepted',
          eventType: 'json_parsed',
          connectionId: client.id,
          sessionId: this.sessionIdForClient(client),
          actorId: client.authenticated?.senderId,
          spaceId: client.authenticated?.spaceId,
          messageType: message.type,
          detail: {},
        });
        this.handleMessage(client, message);
      } catch {
        this.recordMonitoring({
          stage: 'parse',
          outcome: 'rejected',
          eventType: 'invalid_json',
          connectionId: client.id,
          sessionId: this.sessionIdForClient(client),
          actorId: client.authenticated?.senderId,
          spaceId: client.authenticated?.spaceId,
          detail: {
            responseType: 'ERROR',
          },
        });
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
      this.recordMonitoring({
        stage: 'dispatch',
        outcome: 'rejected',
        eventType: 'unauthenticated_participation_rejected',
        connectionId: client.id,
        messageType: msg.type,
        detail: {
          responseType: 'ERROR',
        },
      });
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
    this.recordMonitoring({
      stage: 'auth',
      outcome: 'attempt',
      eventType: 'auth_requested',
      connectionId: client.id,
      messageType: msg.type,
      detail: {},
    });
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
      this.recordMonitoring({
        stage: 'auth',
        outcome: 'accepted',
        eventType: 'auth_succeeded',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        spaceId,
        messageType: msg.type,
        detail: {
          responseType: 'AUTH_RESULT',
        },
      });
      this.send(client, {
        type: 'AUTH_RESULT',
        senderId: auth.senderId,
        spaceId,
        tutorialSpaceId: spaceId === HEADWATERS_COMMONS_SPACE_ID ? HEADWATERS_COMMONS_SPACE_ID : undefined,
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'auth',
        outcome: 'rejected',
        eventType: 'auth_failed',
        connectionId: client.id,
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private handleScan(client: ClientConnection, msg: ScanRequest): void {
    const session = client.authenticated!;
    const hosted = this.spaces.get(session.spaceId)!;
    this.recordMonitoring({
      stage: 'scan',
      outcome: 'attempt',
      eventType: 'scan_requested',
      connectionId: client.id,
      sessionId: this.sessionIdForClient(client),
      actorId: session.senderId,
      spaceId: msg.spaceId,
      messageType: msg.type,
      detail: {
        since: msg.since ?? 0,
      },
    });
    try {
      verifyPerMessageProof(session, msg.proof, msg, session.audience);
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'accepted',
        eventType: 'scan_proof_valid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.spaceId,
        messageType: msg.type,
        detail: {},
      });
      const messages = hosted.store.scan(msg.spaceId, msg.since ?? 0, session.senderId);
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'accepted',
        eventType: 'scan_succeeded',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.spaceId,
        messageType: msg.type,
        detail: {
          latestSeq: hosted.store.latestSeq,
          messageCount: messages.length,
          responseType: 'SCAN_RESULT',
        },
      });
      this.send(client, {
        type: 'SCAN_RESULT',
        spaceId: msg.spaceId,
        messages,
        latestSeq: hosted.store.latestSeq,
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'scan',
        outcome: err instanceof Error && err.message.includes('Access denied') ? 'failed' : 'rejected',
        eventType: err instanceof Error && err.message.includes('Proof validation')
          ? 'scan_proof_invalid'
          : 'scan_failed',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.spaceId,
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: err instanceof Error ? err.message : String(err) });
    }
  }

  private handlePost(client: ClientConnection, msg: AuthenticatedITPMessage): void {
    const session = client.authenticated!;
    const hosted = this.spaces.get(session.spaceId)!;
    this.recordMonitoring({
      stage: 'post',
      outcome: 'attempt',
      eventType: 'post_requested',
      connectionId: client.id,
      sessionId: this.sessionIdForClient(client),
      actorId: session.senderId,
      spaceId: msg.parentId ?? 'root',
      messageType: msg.type,
      detail: {},
    });
    try {
      verifyPerMessageProof(session, msg.proof, msg, session.audience);
      this.recordMonitoring({
        stage: 'post',
        outcome: 'accepted',
        eventType: 'post_proof_valid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {},
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'post',
        outcome: 'rejected',
        eventType: 'post_proof_invalid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: `Proof validation failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    if (msg.type === 'INTENT' && !msg.intentId) {
      this.recordMonitoring({
        stage: 'post',
        outcome: 'rejected',
        eventType: 'intent_id_missing',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: 'INTENT must have an intentId' });
      return;
    }
    if (!hosted.store.canAccessSpace(msg.parentId ?? 'root', session.senderId)) {
      this.recordMonitoring({
        stage: 'post',
        outcome: 'rejected',
        eventType: 'space_access_denied',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          responseType: 'ERROR',
        },
      });
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
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'attempt',
        eventType: 'message_persist_requested',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {},
      });
      const seq = hosted.store.post(storedMessage);
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'persisted',
        eventType: 'message_persisted',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          seq,
        },
      });
      const echo: MessageEcho = { ...msg, seq };
      this.broadcastWithinSpace(session.spaceId, echo);
    } catch (err) {
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'failed',
        eventType: 'message_persist_failed',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: session.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: `Failed to persist: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private recordMonitoring(event: MonitoringEventInput): void {
    const store = this.monitoringStoreForEvent(event.spaceId);
    try {
      store.appendMonitoringEvent(event);
    } catch {
      // Observability must not break normal participation.
    }
  }

  private monitoringStoreForEvent(spaceId?: string): IntentStore {
    const resolvedSpaceId = spaceId ?? HEADWATERS_COMMONS_SPACE_ID;
    let hosted = this.spaces.get(resolvedSpaceId);
    if (!hosted && resolvedSpaceId !== HEADWATERS_COMMONS_SPACE_ID) {
      this.tryLoadProvisionedSpace(resolvedSpaceId);
      hosted = this.spaces.get(resolvedSpaceId);
    }
    return hosted?.store ?? this.spaces.get(HEADWATERS_COMMONS_SPACE_ID)!.store;
  }

  private sessionIdForClient(client: ClientConnection): string | undefined {
    const senderId = client.authenticated?.senderId;
    const spaceId = client.authenticated?.spaceId;
    if (!senderId || !spaceId) return undefined;
    return `${senderId}@${spaceId}`;
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
