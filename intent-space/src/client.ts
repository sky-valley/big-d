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
import type { ServerMessage, StoredMessage, MessageEcho, ClientTarget, TlsClientTarget } from './types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';

export class IntentSpaceClient extends EventEmitter {
  private socket: Socket | TLSSocket | null = null;
  private buffer = '';
  private _latestSeq = 0;
  private target: ClientTarget;

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
        this.emit('error', err);
        reject(err);
      });
      this.socket.on('data', (chunk: Buffer) => this.handleData(chunk.toString()));
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
    this.writeLine(msg);
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
      this.writeLine({ type: 'SCAN', spaceId, since: since ?? 0 });
    });
  }

  // ============ NDJSON parsing ============

  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: ServerMessage = JSON.parse(line);
        this.handleMessage(msg);
      } catch {
        this.emit('error', new Error('Invalid JSON from server'));
      }
    }
  }

  private handleMessage(msg: ServerMessage): void {
    // Emit raw message for scan promise resolution
    this.emit('_message', msg);

    if (msg.type === 'ERROR') {
      this.emit('error', new Error(msg.message));
      return;
    }
    if (msg.type === 'SCAN_RESULT') {
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

  private writeLine(msg: unknown): void {
    if (!this.socket) throw new Error('Not connected');
    this.socket.write(JSON.stringify(msg) + '\n');
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
