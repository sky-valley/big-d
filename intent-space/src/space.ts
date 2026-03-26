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
import { createHash } from 'crypto';
import { IntentStore, DEFAULT_DB_DIR } from './store.ts';
import { buildServiceIntents } from './service-intents.ts';
import type {
  AuthenticatedITPMessage,
  AuthRequest,
  ClientMessage,
  MessageEcho,
  MonitoringEvent,
  MonitoringEventInput,
  ScanRequest,
  ServerMessage,
} from './types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import { defaultStationAudience, verifyAuthRequest, verifyPerMessageProof, type StationSessionAuth } from './auth.ts';

const MAX_LINE_LENGTH = 1024 * 1024; // 1MB

interface ClientConnection {
  id: string;
  socket: Socket;
  buffer: string;
  introduced: boolean;
  authenticated?: StationSessionAuth;
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
  stationAudience?: string;
  authSecret?: string;
  authResult?: {
    tutorialSpaceId?: string;
    ritualGreeting?: string;
  };
  onStoredMessage?: (echo: MessageEcho, auth: StationSessionAuth | null) => void;
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
  private _authSecret: string;
  private _stationAudience: string;
  private _authResult: {
    tutorialSpaceId?: string;
    ritualGreeting?: string;
  };
  private _onStoredMessage?: (echo: MessageEcho, auth: StationSessionAuth | null) => void;
  private connectionCount = 0;
  private droppedMonitoringEvents = 0;
  private stopping = false;

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
    this._authSecret = opts.authSecret ?? process.env.INTENT_SPACE_AUTH_SECRET ?? 'intent-space-dev-secret';
    this._stationAudience = opts.stationAudience ?? defaultStationAudience();
    this._authResult = opts.authResult ?? {
      tutorialSpaceId: 'tutorial',
      ritualGreeting: 'academy tutorial greeting',
    };
    this._onStoredMessage = opts.onStoredMessage;
    this.store = new IntentStore(opts.dbPath);
  }

  get socketPath(): string { return this._socketPath; }
  get agentId(): string { return this._agentId; }
  get tcpPort(): number | undefined { return this._tcpPort; }
  get tlsPort(): number | undefined { return this._tlsPort; }
  get clientCount(): number { return this.clients.size; }
  get stationAudience(): string { return this._stationAudience; }
  get monitoringDroppedEvents(): number { return this.droppedMonitoringEvents; }

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
    this.stopping = true;
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
    const client: ClientConnection = {
      id: `conn-${++this.connectionCount}`,
      socket,
      buffer: '',
      introduced: false,
    };
    this.clients.add(client);
    this.recordMonitoring({
      stage: 'connection',
      outcome: 'accepted',
      eventType: 'connection_opened',
      connectionId: client.id,
      detail: {},
    });

    // Introduce ourselves: send service intents as ITP INTENT messages.
    // The space finishes speaking before accepting input (observe-before-act).
    this.sendServiceIntents(client);
    client.introduced = true;

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
        detail: {
          message: err instanceof Error ? err.message : String(err),
        },
      });
    });
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
      this.recordMonitoring({
        stage: 'parse',
        outcome: 'rejected',
        eventType: 'line_too_long',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
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
        const msg: ClientMessage = JSON.parse(line);
        this.recordMonitoring({
          stage: 'parse',
          outcome: 'accepted',
          eventType: 'json_parsed',
          connectionId: client.id,
          sessionId: this.sessionIdForClient(client),
          actorId: client.authenticated?.senderId,
          messageType: msg.type,
          detail: {},
        });
        this.handleMessage(client, msg);
      } catch {
        this.recordMonitoring({
          stage: 'parse',
          outcome: 'rejected',
          eventType: 'invalid_json',
          connectionId: client.id,
          sessionId: this.sessionIdForClient(client),
          actorId: client.authenticated?.senderId,
          detail: {
            responseType: 'ERROR',
          },
        });
        this.send(client, { type: 'ERROR', message: 'Invalid JSON' });
      }
    }
  }

  // ============ Message dispatch ============

  private handleMessage(client: ClientConnection, msg: ClientMessage): void {
    if (!client.introduced) {
      this.recordMonitoring({
        stage: 'dispatch',
        outcome: 'rejected',
        eventType: 'observe_before_act_rejected',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        messageType: msg.type,
        detail: {
          responseType: 'ERROR',
        },
      });
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
    if (msg.type === 'AUTH') {
      this.handleAuth(client, msg as AuthRequest);
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
    this.handlePost(client, msg as AuthenticatedITPMessage);
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
      client.authenticated = verifyAuthRequest(msg, this._authSecret, this._stationAudience);
      this.recordMonitoring({
        stage: 'auth',
        outcome: 'accepted',
        eventType: 'auth_succeeded',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        messageType: msg.type,
        detail: {
          responseType: 'AUTH_RESULT',
        },
      });
      this.send(client, {
        type: 'AUTH_RESULT',
        senderId: client.authenticated.senderId,
        principalId: client.authenticated.principalId,
        spaceId: client.authenticated.spaceId,
        tutorialSpaceId: this._authResult.tutorialSpaceId,
        ritualGreeting: this._authResult.ritualGreeting,
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

  private handlePost(client: ClientConnection, msg: AuthenticatedITPMessage): void {
    this.recordMonitoring({
      stage: 'post',
      outcome: 'attempt',
      eventType: 'post_requested',
      connectionId: client.id,
      sessionId: this.sessionIdForClient(client),
      actorId: client.authenticated?.senderId,
      spaceId: msg.parentId ?? 'root',
      messageType: msg.type,
      detail: {},
    });
    try {
      verifyPerMessageProof(client.authenticated!, msg.proof, msg, this._stationAudience);
      this.recordMonitoring({
        stage: 'post',
        outcome: 'accepted',
        eventType: 'post_proof_valid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
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
        actorId: client.authenticated?.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: `Proof validation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    if (!msg.intentId) {
      if (msg.type === 'INTENT') {
        this.recordMonitoring({
          stage: 'post',
          outcome: 'rejected',
          eventType: 'intent_id_missing',
          connectionId: client.id,
          sessionId: this.sessionIdForClient(client),
          actorId: client.authenticated?.senderId,
          spaceId: msg.parentId ?? 'root',
          messageType: msg.type,
          detail: {
            responseType: 'ERROR',
          },
        });
        this.send(client, { type: 'ERROR', message: 'INTENT must have an intentId' });
        return;
      }
    }
    if (!this.store.canAccessSpace(msg.parentId ?? 'root', client.authenticated!.senderId)) {
      this.recordMonitoring({
        stage: 'post',
        outcome: 'rejected',
        eventType: 'space_access_denied',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: `Access denied to space ${msg.parentId ?? 'root'}`,
      });
      return;
    }

    let seq: number;
    try {
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'attempt',
        eventType: 'message_persist_requested',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {},
      });
      const storedMessage: ITPMessage = {
        type: msg.type,
        promiseId: msg.promiseId,
        intentId: msg.intentId,
        parentId: msg.parentId,
        timestamp: msg.timestamp,
        senderId: msg.senderId,
        payload: msg.payload,
      };
      seq = this.store.post(storedMessage);
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'persisted',
        eventType: 'message_persisted',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          seq,
        },
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'persistence',
        outcome: 'failed',
        eventType: 'message_persist_failed',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated?.senderId,
        spaceId: msg.parentId ?? 'root',
        messageType: msg.type,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: `Failed to persist: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const echo: MessageEcho = { ...msg, seq };
    this.broadcast(echo);
    this._onStoredMessage?.(echo, client.authenticated ?? null);
  }

  private handleScan(client: ClientConnection, msg: ScanRequest): void {
    if (!client.authenticated) {
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'rejected',
        eventType: 'scan_requires_auth',
        connectionId: client.id,
        messageType: msg.type,
        spaceId: msg.spaceId,
        detail: {
          responseType: 'ERROR',
        },
      });
      this.send(client, { type: 'ERROR', message: 'Authenticate before station participation' });
      return;
    }
    this.recordMonitoring({
      stage: 'scan',
      outcome: 'attempt',
      eventType: 'scan_requested',
      connectionId: client.id,
      sessionId: this.sessionIdForClient(client),
      actorId: client.authenticated.senderId,
      messageType: msg.type,
      spaceId: msg.spaceId,
      detail: {
        since: msg.since ?? 0,
      },
    });
    try {
      verifyPerMessageProof(client.authenticated, msg.proof, msg, this._stationAudience);
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'accepted',
        eventType: 'scan_proof_valid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        messageType: msg.type,
        spaceId: msg.spaceId,
        detail: {},
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'rejected',
        eventType: 'scan_proof_invalid',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        messageType: msg.type,
        spaceId: msg.spaceId,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: `Proof validation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    try {
      const messages = this.store.scan(msg.spaceId, msg.since ?? 0, client.authenticated.senderId);
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'accepted',
        eventType: 'scan_succeeded',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        messageType: msg.type,
        spaceId: msg.spaceId,
        detail: {
          latestSeq: this.store.latestSeq,
          messageCount: messages.length,
          responseType: 'SCAN_RESULT',
        },
      });
      this.send(client, {
        type: 'SCAN_RESULT',
        spaceId: msg.spaceId,
        messages,
        latestSeq: this.store.latestSeq,
      });
    } catch (err) {
      this.recordMonitoring({
        stage: 'scan',
        outcome: 'failed',
        eventType: 'scan_failed',
        connectionId: client.id,
        sessionId: this.sessionIdForClient(client),
        actorId: client.authenticated.senderId,
        messageType: msg.type,
        spaceId: msg.spaceId,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          responseType: 'ERROR',
        },
      });
      this.send(client, {
        type: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
      if (!this.canClientSeeMessage(client, msg)) {
        continue;
      }
      try {
        client.socket.write(line);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  publish(msg: ITPMessage): MessageEcho {
    this.recordMonitoring({
      stage: 'persistence',
      outcome: 'attempt',
      eventType: 'service_publish_requested',
      actorId: msg.senderId,
      spaceId: msg.parentId ?? 'root',
      messageType: msg.type,
      detail: {},
    });
    const seq = this.store.post(msg);
    this.recordMonitoring({
      stage: 'persistence',
      outcome: 'persisted',
      eventType: 'service_message_persisted',
      actorId: msg.senderId,
      spaceId: msg.parentId ?? 'root',
      messageType: msg.type,
      detail: {
        seq,
      },
    });
    const echo: MessageEcho = { ...msg, seq };
    this.broadcast(echo);
    this._onStoredMessage?.(echo, null);
    return echo;
  }

  scanMonitoringEvents(sinceId: number = 0, limit: number = 100): MonitoringEvent[] {
    return this.store.scanMonitoringEvents(sinceId, limit);
  }

  // ============ Service intents ============

  private declareServiceIntents(): void {
    for (const msg of buildServiceIntents(this._agentId)) {
      if (!this.store.has(msg.intentId!)) {
        this.store.post(msg);
      }
    }
  }

  private canClientSeeMessage(client: ClientConnection, msg: ServerMessage): boolean {
    if (!('parentId' in msg) || typeof msg.parentId !== 'string') {
      return true;
    }
    return this.store.canAccessSpace(msg.parentId, client.authenticated?.senderId);
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

  private recordMonitoring(event: MonitoringEventInput): void {
    if (this.stopping) return;
    try {
      this.store.appendMonitoringEvent(event);
    } catch (err) {
      this.droppedMonitoringEvents += 1;
      console.error(
        '[intent-space monitoring degraded]',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private sessionIdForClient(client: ClientConnection): string | undefined {
    if (!client.authenticated?.stationToken) return undefined;
    return createHash('sha256').update(client.authenticated.stationToken).digest('base64url');
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
