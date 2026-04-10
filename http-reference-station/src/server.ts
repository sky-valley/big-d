import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import {
  FrameParseError,
  ITP_VERBS,
  frameToItpMessage,
  frameToScanRequest,
  parseSingleFramedMessage,
  serializeFramedMessage,
  serverMessageToFrame,
} from './framing.ts';
import { authenticateHttpRequest } from './http-auth.ts';
import { StationCredentialRegistry } from './credential-registry.ts';
import { StationPrincipalRegistry } from './principal-registry.ts';
import { buildServiceIntents } from './service-intents.ts';
import { DEFAULT_DB_DIR, IntentStore } from './store.ts';
import type { HttpRequestAuth, MessageEcho, ServerMessage, SignupResponse } from './types.ts';
import {
  TERMS_OF_SERVICE,
  agentCard,
  isSignupRequestBody,
  issueStationToken,
  llmsTxt,
  validateContinuation,
  validateSignup,
  welcomeMatMarkdown,
  type HttpReferenceProfile,
} from './welcome-mat.ts';

interface StreamSubscriber {
  id: string;
  viewerId: string;
  spaceId: string;
  response: ServerResponse<IncomingMessage>;
}

export interface HttpReferenceStationOptions {
  host?: string;
  port?: number;
  origin?: string;
  dbPath?: string;
  dataDir?: string;
  agentId?: string;
  authSecret?: string;
  stationAudience?: string;
}

function defaultPort(): number {
  return process.env.HTTP_REFERENCE_STATION_PORT ? Number.parseInt(process.env.HTTP_REFERENCE_STATION_PORT, 10) : 8787;
}

function defaultHost(): string {
  return process.env.HTTP_REFERENCE_STATION_HOST ?? '127.0.0.1';
}

function defaultAudience(): string {
  return process.env.HTTP_REFERENCE_STATION_AUDIENCE ?? 'intent-space://http-reference-station';
}

function originFromHostPort(host: string, port: number): string {
  const originHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${originHost}:${port}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, `${JSON.stringify(value, null, 2)}\n`, 'application/json; charset=utf-8');
}

function sendFramed(res: ServerResponse, status: number, message: ServerMessage): void {
  res.writeHead(status, { 'content-type': 'application/itp' });
  res.end(serializeFramedMessage(serverMessageToFrame(message)));
}

function encodeSseData(text: string): string {
  return text.split('\n').map((line) => `data: ${line}`).join('\n');
}

export class HttpReferenceStation {
  private server: Server | null = null;
  private store: IntentStore;
  private registry: StationPrincipalRegistry;
  private credentialRegistry: StationCredentialRegistry;
  private subscribers = new Set<StreamSubscriber>();
  private subscriberCount = 0;
  private _host: string;
  private _port: number;
  private _origin?: string;
  private _agentId: string;
  private _authSecret: string;
  private _stationAudience: string;
  private readonly profilePaths = {
    signupPath: '/signup',
    continuePath: '/continue',
    termsPath: '/tos',
    itpPath: '/itp',
    scanPath: '/scan',
    streamPath: '/stream',
  };

  constructor(options: HttpReferenceStationOptions = {}) {
    const dataDir = options.dataDir ?? DEFAULT_DB_DIR;
    mkdirSync(resolve(dataDir), { recursive: true });
    this._host = options.host ?? defaultHost();
    this._port = options.port ?? defaultPort();
    this._origin = options.origin;
    this._agentId = options.agentId ?? process.env.HTTP_REFERENCE_STATION_ID ?? 'http-reference-station';
    this._authSecret = options.authSecret ?? process.env.ITP_STATION_AUTH_SECRET ?? 'intent-space-dev-secret';
    this._stationAudience = options.stationAudience ?? defaultAudience();
    this.store = new IntentStore(options.dbPath);
    this.registry = new StationPrincipalRegistry(join(dataDir, 'principal-registry.json'), 'prn_http');
    this.credentialRegistry = new StationCredentialRegistry(join(dataDir, 'current-station-credentials.json'));
  }

  get host(): string { return this._host; }
  get port(): number { return this._port; }
  get origin(): string {
    if (!this._origin) {
      throw new Error('Station origin unavailable before start');
    }
    return this._origin;
  }
  get stationAudience(): string { return this._stationAudience; }
  get profile(): HttpReferenceProfile {
    return {
      origin: this.origin,
      audience: this._stationAudience,
      ...this.profilePaths,
    };
  }

  async start(): Promise<void> {
    this.declareServiceIntents();
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    await new Promise<void>((resolvePromise, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this._port, this._host, () => resolvePromise());
    });
    const address = this.server.address();
    if (address && typeof address === 'object') {
      this._port = address.port;
    }
    this._origin = this._origin ?? originFromHostPort(this._host, this._port);
  }

  async stop(): Promise<void> {
    for (const subscriber of this.subscribers) {
      subscriber.response.end();
    }
    this.subscribers.clear();
    if (this.server) {
      await new Promise<void>((resolvePromise) => this.server!.close(() => resolvePromise()));
      this.server = null;
    }
    this.store.close();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.origin);
    try {
      if (req.method === 'GET' && url.pathname === '/.well-known/welcome.md') {
        send(res, 200, `${welcomeMatMarkdown(this.profile)}\n`, 'text/markdown; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, this.overviewHtml(), 'text/html; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/llms.txt') {
        send(res, 200, `${llmsTxt(this.profile)}\n`, 'text/plain; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        sendJson(res, 200, agentCard(this.profile));
        return;
      }
      if (req.method === 'GET' && url.pathname === this.profilePaths.termsPath) {
        send(res, 200, TERMS_OF_SERVICE, 'text/plain; charset=utf-8');
        return;
      }
      if (req.method === 'POST' && url.pathname === this.profilePaths.signupPath) {
        await this.handleSignup(req, res);
        return;
      }
      if (req.method === 'POST' && url.pathname === this.profilePaths.continuePath) {
        await this.handleContinue(req, res);
        return;
      }
      if (req.method === 'POST' && url.pathname === this.profilePaths.itpPath) {
        await this.handleItp(req, res, url);
        return;
      }
      if (req.method === 'POST' && url.pathname === this.profilePaths.scanPath) {
        await this.handleScan(req, res, url);
        return;
      }
      if (req.method === 'GET' && url.pathname === this.profilePaths.streamPath) {
        await this.handleStream(req, res, url);
        return;
      }
      send(res, 404, 'Not found\n');
    } catch (error) {
      send(res, 500, `${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  private overviewHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HTTP Reference Station</title>
  </head>
  <body>
    <h1>HTTP Reference Station</h1>
    <p>Pure intent-space over HTTP: Welcome Mat-compatible signup, framed ITP, and SSE observation.</p>
    <ul>
      <li><a href="/.well-known/welcome.md">welcome mat discovery</a></li>
      <li><a href="/tos">terms of service</a></li>
      <li><a href="/llms.txt">AI-readable overview</a></li>
      <li><a href="/.well-known/agent-card.json">agent card</a></li>
    </ul>
  </body>
</html>
`;
  }

  private async handleSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const dpopJwt = req.headers.dpop;
    if (typeof dpopJwt !== 'string' || dpopJwt.length === 0) {
      sendJson(res, 400, { error: 'missing_dpop' });
      return;
    }
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as unknown;
    if (!isSignupRequestBody(body)) {
      sendJson(res, 400, { error: 'invalid_signup_body' });
      return;
    }
    const signupBody = body;
    const validated = validateSignup({
      dpopJwt,
      accessTokenJwt: signupBody.access_token!,
      tosSignatureB64url: signupBody.tos_signature!,
      handle: signupBody.handle!,
      profile: this.profile,
    });
    const principal = this.registry.issue(validated.handle, validated.jwkThumbprint);
    const issued = issueStationToken(
      validated.handle,
      principal.principalId,
      validated.jwkThumbprint,
      this._authSecret,
      this.profile,
    );
    this.credentialRegistry.setCurrent(principal.principalId, this._stationAudience, issued.tokenId);
    sendJson(res, 200, issued.signup);
  }

  private async handleContinue(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const dpopJwt = req.headers.dpop;
    if (typeof dpopJwt !== 'string' || dpopJwt.length === 0) {
      sendJson(res, 400, { error: 'missing_dpop' });
      return;
    }
    try {
      const validated = validateContinuation({
        dpopJwt,
        profile: this.profile,
      });
      const principal = this.registry.getByJwkThumbprint(validated.jwkThumbprint);
      if (!principal) {
        sendJson(res, 404, { error: 'unknown_principal' });
        return;
      }
      const issued = issueStationToken(
        principal.handle,
        principal.principalId,
        validated.jwkThumbprint,
        this._authSecret,
        this.profile,
      );
      this.credentialRegistry.setCurrent(principal.principalId, this._stationAudience, issued.tokenId);
      sendJson(res, 200, issued.signup);
    } catch (error) {
      sendJson(res, 401, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async handleItp(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      const auth = authenticateHttpRequest(
        req,
        url.toString(),
        this._authSecret,
        this._stationAudience,
        (principalId, audience, tokenId) => this.credentialRegistry.isCurrent(principalId, audience, tokenId),
      );
      const frame = parseSingleFramedMessage(await readBody(req));
      if (!ITP_VERBS.has(frame.verb)) {
        sendFramed(res, 400, { type: 'ERROR', message: `${frame.verb} is not a live ITP act` });
        return;
      }
      const msg = frameToItpMessage(frame);
      if (msg.senderId !== auth.senderId) {
        sendFramed(res, 403, { type: 'ERROR', message: 'ITP sender does not match authenticated principal' });
        return;
      }
      if (!this.store.canAccessSpace(msg.parentId ?? 'root', auth.senderId)) {
        sendFramed(res, 403, { type: 'ERROR', message: `Access denied to space ${msg.parentId ?? 'root'}` });
        return;
      }
      const seq = this.store.post(msg);
      const echo: MessageEcho = { ...msg, seq };
      this.broadcast(echo);
      sendFramed(res, 200, echo);
    } catch (error) {
      this.sendHttpError(res, error);
    }
  }

  private async handleScan(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      const auth = authenticateHttpRequest(
        req,
        url.toString(),
        this._authSecret,
        this._stationAudience,
        (principalId, audience, tokenId) => this.credentialRegistry.isCurrent(principalId, audience, tokenId),
      );
      const frame = parseSingleFramedMessage(await readBody(req));
      const scan = frameToScanRequest(frame);
      const messages = this.store.scan(scan.spaceId, scan.since ?? 0, auth.senderId);
      sendFramed(res, 200, {
        type: 'SCAN_RESULT',
        spaceId: scan.spaceId,
        messages,
        latestSeq: this.store.latestSeq,
      });
    } catch (error) {
      this.sendHttpError(res, error);
    }
  }

  private async handleStream(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      const auth = authenticateHttpRequest(
        req,
        url.toString(),
        this._authSecret,
        this._stationAudience,
        (principalId, audience, tokenId) => this.credentialRegistry.isCurrent(principalId, audience, tokenId),
      );
      const spaceId = url.searchParams.get('space');
      const sinceRaw = url.searchParams.get('since') ?? '0';
      if (!spaceId) {
        send(res, 400, 'Missing space query param\n');
        return;
      }
      if (!/^-?\d+$/.test(sinceRaw)) {
        send(res, 400, 'Invalid since query param\n');
        return;
      }

      const since = Number.parseInt(sinceRaw, 10);
      const messages = this.store.scan(spaceId, since, auth.senderId);

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      for (const message of messages) {
        this.writeSseMessage(res, this.asEcho(message));
      }

      const subscriber: StreamSubscriber = {
        id: `sub-${++this.subscriberCount}`,
        viewerId: auth.senderId,
        spaceId,
        response: res,
      };
      this.subscribers.add(subscriber);
      req.on('close', () => {
        this.subscribers.delete(subscriber);
      });
    } catch (error) {
      send(res, 401, `${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  private sendHttpError(res: ServerResponse, error: unknown): void {
    if (error instanceof FrameParseError) {
      sendFramed(res, 400, { type: 'ERROR', message: error.message });
      return;
    }
    sendFramed(res, 401, { type: 'ERROR', message: error instanceof Error ? error.message : String(error) });
  }

  private writeSseMessage(res: ServerResponse, message: MessageEcho): void {
    const frameText = serializeFramedMessage(serverMessageToFrame(message)).toString('utf8');
    res.write(`id: ${message.seq}\n`);
    res.write(`${encodeSseData(frameText)}\n\n`);
  }

  private asEcho(message: {
    type: string;
    intentId?: string;
    promiseId?: string;
    parentId: string;
    senderId: string;
    payload: Record<string, unknown>;
    timestamp: number;
    seq: number;
  }): MessageEcho {
    return {
      type: message.type as ITPMessage['type'],
      intentId: message.intentId,
      promiseId: message.promiseId,
      parentId: message.parentId,
      senderId: message.senderId,
      payload: message.payload,
      timestamp: message.timestamp,
      seq: message.seq,
    };
  }

  private declareServiceIntents(): void {
    for (const msg of buildServiceIntents(this._agentId)) {
      if (!this.store.has(msg.intentId!)) {
        this.store.post(msg);
      }
    }
  }

  private broadcast(message: MessageEcho): void {
    for (const subscriber of this.subscribers) {
      if (subscriber.spaceId !== message.parentId) {
        continue;
      }
      if (!this.store.canAccessSpace(message.parentId ?? 'root', subscriber.viewerId)) {
        continue;
      }
      this.writeSseMessage(subscriber.response, message);
    }
  }
}
