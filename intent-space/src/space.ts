/**
 * IntentSpace — NDJSON server over Unix socket and/or TCP.
 *
 * Two message families:
 *   - Stored ITP messages: persisted, echoed to all connected clients
 *   - SCAN: private read, returns messages scoped by parentId
 *
 * The space is an ITP participant. It introduces itself on connect
 * by sending its service intents as ITP INTENT messages.
 *
 * Observe-before-act: the space must finish its introduction before
 * accepting client messages. Messages received before introduction
 * completes are rejected — the space has autonomy to finish speaking
 * before being spoken to.
 */

import { createServer, connect as netConnect, type Socket, type Server } from 'net';
import { createServer as createTlsServer, type Server as TlsServer, type TlsOptions } from 'tls';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { IntentStore, DEFAULT_DB_DIR } from './store.ts';
import { buildServiceIntents } from './service-intents.ts';
import type { ClientMessage, ServerMessage, ScanRequest, MessageEcho } from './types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';

const MAX_LINE_LENGTH = 1024 * 1024; // 1MB

interface ClientConnection {
  socket: Socket;
  buffer: string;
  introduced: boolean;
}

export interface IntentSpaceOptions {
  socketPath?: string;
  dbPath?: string;
  agentId?: string;
  tcpPort?: number;
  tcpHost?: string;
  tlsPort?: number;
  tlsHost?: string;
  tlsKeyPath?: string;
  tlsCertPath?: string;
  tlsCaPath?: string;
  tlsKeyPem?: string;
  tlsCertPem?: string;
  tlsCaPem?: string;
}

export class IntentSpace {
  private server: Server | null = null;
  private tcpServer: Server | null = null;
  private tlsServer: TlsServer | null = null;
  private store: IntentStore;
  private clients = new Set<ClientConnection>();
  private _socketPath: string;
  private _agentId: string;
  private _tcpPort?: number;
  private _tcpHost: string;
  private _tlsPort?: number;
  private _tlsHost: string;
  private _tlsOptions?: TlsOptions;

  constructor(opts: IntentSpaceOptions = {}) {
    this._agentId = opts.agentId ?? process.env.DIFFER_INTENT_SPACE_ID ?? 'intent-space';
    this._socketPath = opts.socketPath ?? join(
      process.env.DIFFER_INTENT_SPACE_DIR ?? DEFAULT_DB_DIR,
      'intent-space.sock',
    );
    this._tcpPort = opts.tcpPort ?? (process.env.INTENT_SPACE_PORT ? parseInt(process.env.INTENT_SPACE_PORT, 10) : undefined);
    this._tcpHost = opts.tcpHost ?? process.env.INTENT_SPACE_HOST ?? '0.0.0.0';
    this._tlsPort = opts.tlsPort ?? (process.env.INTENT_SPACE_TLS_PORT ? parseInt(process.env.INTENT_SPACE_TLS_PORT, 10) : undefined);
    this._tlsHost = opts.tlsHost ?? process.env.INTENT_SPACE_TLS_HOST ?? '0.0.0.0';
    this._tlsOptions = loadTlsOptions(opts);
    this.store = new IntentStore(opts.dbPath);
  }

  get socketPath(): string { return this._socketPath; }
  get agentId(): string { return this._agentId; }
  get tcpPort(): number | undefined { return this._tcpPort; }
  get tlsPort(): number | undefined { return this._tlsPort; }
  get clientCount(): number { return this.clients.size; }

  async start(): Promise<void> {
    await this.cleanStaleSocket();
    this.declareServiceIntents();

    // Unix socket — local agents
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));
      this.server.on('error', reject);
      this.server.listen(this._socketPath, () => resolve());
    });

    // TCP — remote agents (optional)
    if (this._tcpPort != null) {
      await new Promise<void>((resolve, reject) => {
        this.tcpServer = createServer((socket) => this.handleConnection(socket));
        this.tcpServer.on('error', reject);
        this.tcpServer.listen(this._tcpPort!, this._tcpHost, () => {
          // Update port if ephemeral (port 0)
          const addr = this.tcpServer!.address();
          if (addr && typeof addr === 'object') {
            this._tcpPort = addr.port;
          }
          resolve();
        });
      });
    }

    if (this._tlsPort != null) {
      if (!this._tlsOptions?.key || !this._tlsOptions?.cert) {
        throw new Error('TLS listener requires certificate and key material');
      }

      await new Promise<void>((resolve, reject) => {
        this.tlsServer = createTlsServer(this._tlsOptions!, (socket) => this.handleConnection(socket));
        this.tlsServer.on('error', reject);
        this.tlsServer.listen(this._tlsPort!, this._tlsHost, () => {
          const addr = this.tlsServer!.address();
          if (addr && typeof addr === 'object') {
            this._tlsPort = addr.port;
          }
          resolve();
        });
      });
    }
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();

    if (this.tcpServer) {
      await new Promise<void>((resolve) => this.tcpServer!.close(() => resolve()));
      this.tcpServer = null;
    }

    if (this.tlsServer) {
      await new Promise<void>((resolve) => this.tlsServer!.close(() => resolve()));
      this.tlsServer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }

    this.store.close();

    if (existsSync(this._socketPath)) {
      unlinkSync(this._socketPath);
    }
  }

  // ============ Connection ============

  private handleConnection(socket: Socket): void {
    const client: ClientConnection = { socket, buffer: '', introduced: false };
    this.clients.add(client);

    // Introduce ourselves: send service intents as ITP INTENT messages.
    // The space finishes speaking before accepting input (observe-before-act).
    this.sendServiceIntents(client);
    client.introduced = true;

    socket.on('data', (chunk: Buffer) => this.handleData(client, chunk.toString()));
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
  }

  private sendServiceIntents(client: ClientConnection): void {
    const serviceIntents = this.store.scan('root', 0).filter(
      (i) => i.type === 'INTENT' && i.senderId === this._agentId,
    );
    for (const intent of serviceIntents) {
      // Send as ITP INTENT with seq — same format as echoed intents
      const msg: MessageEcho = {
        type: 'INTENT',
        intentId: intent.intentId!,
        parentId: intent.parentId,
        senderId: intent.senderId,
        timestamp: intent.timestamp,
        payload: intent.payload,
        seq: intent.seq,
      };
      this.send(client, msg);
    }
  }

  // ============ NDJSON parsing ============

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
        const msg: ClientMessage = JSON.parse(line);
        this.handleMessage(client, msg);
      } catch {
        this.send(client, { type: 'ERROR', message: 'Invalid JSON' });
      }
    }
  }

  // ============ Message dispatch ============

  private handleMessage(client: ClientConnection, msg: ClientMessage): void {
    if (!client.introduced) {
      this.send(client, {
        type: 'ERROR',
        message: 'Space is still introducing itself — observe before acting',
      });
      return;
    }

    if (msg.type === 'SCAN') {
      this.handleScan(client, msg as ScanRequest);
      return;
    }
    this.handlePost(client, msg as ITPMessage);
  }

  private handlePost(client: ClientConnection, msg: ITPMessage): void {
    if (!msg.intentId) {
      if (msg.type === 'INTENT') {
        this.send(client, { type: 'ERROR', message: 'INTENT must have an intentId' });
        return;
      }
    }

    let seq: number;
    try {
      seq = this.store.post(msg);
    } catch (err) {
      this.send(client, {
        type: 'ERROR',
        message: `Failed to persist: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // Echo to ALL connected clients (including sender) with seq
    const echo: MessageEcho = { ...msg, seq };
    this.broadcast(echo);
  }

  private handleScan(client: ClientConnection, msg: ScanRequest): void {
    const messages = this.store.scan(msg.spaceId, msg.since ?? 0);
    this.send(client, {
      type: 'SCAN_RESULT',
      spaceId: msg.spaceId,
      messages,
      latestSeq: this.store.latestSeq,
    });
  }

  // ============ Send / Broadcast ============

  private send(client: ClientConnection, msg: ServerMessage): void {
    try {
      client.socket.write(JSON.stringify(msg) + '\n');
    } catch {
      this.clients.delete(client);
    }
  }

  private broadcast(msg: ServerMessage): void {
    const line = JSON.stringify(msg) + '\n';
    for (const client of this.clients) {
      try {
        client.socket.write(line);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  // ============ Service intents ============

  private declareServiceIntents(): void {
    for (const msg of buildServiceIntents(this._agentId)) {
      if (!this.store.has(msg.intentId!)) {
        this.store.post(msg);
      }
    }
  }

  // ============ Stale socket ============

  private async cleanStaleSocket(): Promise<void> {
    if (!existsSync(this._socketPath)) return;

    const isAlive = await new Promise<boolean>((resolve) => {
      const probe = netConnect(this._socketPath);
      probe.on('connect', () => { probe.destroy(); resolve(true); });
      probe.on('error', () => resolve(false));
      setTimeout(() => { probe.destroy(); resolve(false); }, 2000);
    });

    if (isAlive) {
      throw new Error(`Another intent space is already listening on ${this._socketPath}`);
    }

    unlinkSync(this._socketPath);
  }
}

function loadTlsOptions(opts: IntentSpaceOptions): TlsOptions | undefined {
  const key = opts.tlsKeyPem
    ?? (opts.tlsKeyPath ? readFileSync(opts.tlsKeyPath, 'utf8') : undefined)
    ?? (process.env.INTENT_SPACE_TLS_KEY ? readFileSync(process.env.INTENT_SPACE_TLS_KEY, 'utf8') : undefined);
  const cert = opts.tlsCertPem
    ?? (opts.tlsCertPath ? readFileSync(opts.tlsCertPath, 'utf8') : undefined)
    ?? (process.env.INTENT_SPACE_TLS_CERT ? readFileSync(process.env.INTENT_SPACE_TLS_CERT, 'utf8') : undefined);
  const ca = opts.tlsCaPem
    ?? (opts.tlsCaPath ? readFileSync(opts.tlsCaPath, 'utf8') : undefined)
    ?? (process.env.INTENT_SPACE_TLS_CA ? readFileSync(process.env.INTENT_SPACE_TLS_CA, 'utf8') : undefined);

  if (!key && !cert && !ca) return undefined;

  return {
    key,
    cert,
    ca,
  };
}
