/**
 * IntentSpaceClient — connects to the intent space.
 *
 * Pull-based: the client controls when it scans.
 * The space echoes new intents to all connected clients,
 * so clients also receive intents pushed between scans.
 *
 * No auto-reconnect — caller's responsibility.
 */

import { connect as netConnect, isIP, type Socket } from 'net';
import { connect as tlsConnect, type TLSSocket, type ConnectionOptions as TlsConnectionOptions } from 'tls';
import { EventEmitter } from 'events';
import type {
  ServerMessage,
  StoredMessage,
  MessageEcho,
  ClientTarget,
  TlsClientTarget,
  AuthRequest,
  AuthenticatedITPMessage,
  ScanRequest,
  AuthResult,
} from './types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import {
  FrameParseError,
  clientMessageToFrame,
  frameToServerMessage,
  parseFramedMessages,
  serializeFramedMessage,
} from './framing.ts';

type ProofFactory = (action: string, requestWithoutProof: Record<string, unknown>) => string;

interface AuthContext {
  stationToken: string;
  proofFactory: ProofFactory;
}

export class IntentSpaceClient extends EventEmitter {
  private socket: Socket | TLSSocket | null = null;
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private _latestSeq = 0;
  private target: ClientTarget;
  private authContext: AuthContext | null = null;

  constructor(target: ClientTarget) {
    super();
    this.target = target;
  }

  get latestSeq(): number { return this._latestSeq; }

  /** Connect to the intent space. Resolves when connected. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = typeof this.target === 'string'
        ? netConnect(this.target)
        : this.target.tls
          ? this.connectTls(this.target)
          : netConnect(this.target.port, this.target.host);

      this.socket.on('connect', () => resolve());
      this.socket.on('error', (err) => {
        this.emitProblem(err);
        reject(err);
      });
      this.socket.on('data', (chunk: Buffer) => this.handleData(chunk));
      this.socket.on('close', () => {
        this.socket = null;
        this.emit('disconnect');
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /** Post an ITP message. */
  post(msg: ITPMessage): void {
    const request: AuthenticatedITPMessage = { ...msg };
    if (this.authContext) {
      request.proof = this.authContext.proofFactory(request.type, stripUndefined({
        type: request.type,
        promiseId: request.promiseId,
        intentId: request.intentId,
        parentId: request.parentId,
        timestamp: request.timestamp,
        senderId: request.senderId,
        payload: request.payload,
      }));
    }
    this.writeMessage(request);
  }

  /** Scan a space. Returns stored messages with parentId = spaceId and seq > since. */
  scan(spaceId: string, since?: number): Promise<StoredMessage[]> {
    return new Promise((resolve, reject) => {
      const handler = (msg: ServerMessage) => {
        if (msg.type === 'SCAN_RESULT' && msg.spaceId === spaceId) {
          cleanup();
          if (msg.latestSeq > this._latestSeq) {
            this._latestSeq = msg.latestSeq;
          }
          resolve(msg.messages);
        } else if (msg.type === 'ERROR') {
          cleanup();
          reject(new Error(msg.message));
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Scan timed out'));
      }, 5000);

      const cleanup = () => {
        this.off('_message', handler);
        clearTimeout(timer);
      };

      this.on('_message', handler);
      const request: ScanRequest = { type: 'SCAN', spaceId, since: since ?? 0 };
      if (this.authContext) {
        request.proof = this.authContext.proofFactory('SCAN', stripUndefined({
          type: 'SCAN',
          spaceId,
          since: since ?? 0,
        }));
      }
      this.writeMessage(request);
    });
  }

  authenticate(stationToken: string, proofFactory: ProofFactory): Promise<AuthResult> {
    return new Promise((resolve, reject) => {
      const requestShape = { type: 'AUTH' };
      const request: AuthRequest = {
        type: 'AUTH',
        stationToken,
        proof: proofFactory('AUTH', requestShape),
      };

      const handler = (msg: ServerMessage) => {
        if (msg.type === 'AUTH_RESULT') {
          cleanup();
          this.authContext = { stationToken, proofFactory };
          resolve(msg);
        } else if (msg.type === 'ERROR') {
          cleanup();
          reject(new Error(msg.message));
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Authentication timed out'));
      }, 5000);

      const cleanup = () => {
        this.off('_message', handler);
        clearTimeout(timer);
      };

      this.on('_message', handler);
      this.writeMessage(request);
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      const parsed = parseFramedMessages(this.buffer);
      this.buffer = parsed.remainder;
      for (const frame of parsed.messages) {
        this.handleMessage(frameToServerMessage(frame));
      }
    } catch (error) {
      const message = error instanceof FrameParseError ? error.message : 'Invalid frame from server';
      this.emitProblem(new Error(message));
      this.buffer = Buffer.alloc(0);
    }
  }

  private handleMessage(msg: ServerMessage): void {
    this.emit('_message', msg);

    if (msg.type === 'ERROR') {
      this.emitProblem(new Error(msg.message));
      return;
    }
    if (msg.type === 'SCAN_RESULT') {
      return;
    }
    if (msg.type === 'AUTH_RESULT') {
      this.emit('auth', msg);
      return;
    }

    const echo = msg as MessageEcho;
    if (echo.seq > this._latestSeq) {
      this._latestSeq = echo.seq;
    }
    this.emit('message', echo);
    if (msg.type === 'INTENT') {
      this.emit('intent', echo);
    }
  }

  private writeMessage(msg: AuthRequest | AuthenticatedITPMessage | ScanRequest): void {
    if (!this.socket) throw new Error('Not connected');
    this.socket.write(serializeFramedMessage(clientMessageToFrame(msg)));
  }

  private emitProblem(err: Error): void {
    this.emit('client-warning', err);
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
  }

  private connectTls(target: TlsClientTarget): TLSSocket {
    const opts: TlsConnectionOptions = {
      host: target.host,
      port: target.port,
      ca: target.ca,
      cert: target.cert,
      key: target.key,
      rejectUnauthorized: target.rejectUnauthorized ?? true,
    };
    const servername = target.servername ?? (isIP(target.host) ? undefined : target.host);
    if (servername && !isIP(servername)) {
      opts.servername = servername;
    }
    return tlsConnect(opts);
  }
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
