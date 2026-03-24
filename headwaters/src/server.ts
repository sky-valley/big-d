import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, normalize, resolve } from 'path';
import {
  TERMS_OF_SERVICE,
  headwatersOrigin,
  isSignupRequestBody,
  signupPath,
  termsPath,
  welcomeWellKnownPath,
} from './contract.ts';
import { HeadwatersEnrollmentRegistry } from './enrollment-registry.ts';
import { issueCommonsStationToken, validateSignup, welcomeMatMarkdown } from './welcome-mat.ts';

const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export interface HeadwatersHttpServerOptions {
  host: string;
  port: number;
  rootDir: string;
  dataDir: string;
  authSecret: string;
}

function send(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, `${JSON.stringify(value, null, 2)}\n`, 'application/json; charset=utf-8');
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safePath(rootDir: string, urlPath: string): string | null {
  const pathname = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(rootDir, `.${pathname}`);
  if (!candidate.startsWith(resolve(rootDir))) {
    return null;
  }
  return candidate;
}

function serveStatic(rootDir: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', headwatersOrigin());
  const filePath = safePath(rootDir, url.pathname);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    send(res, 404, 'Not found\n');
    return;
  }
  const ext = extname(filePath);
  send(res, 200, readFileSync(filePath, 'utf8'), MIME_TYPES[ext] ?? 'application/octet-stream');
}

export function createHeadwatersHttpServer(options: HeadwatersHttpServerOptions) {
  const registry = new HeadwatersEnrollmentRegistry(resolve(options.dataDir, 'enrollment-registry.json'));
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', headwatersOrigin());
    try {
      if (req.method === 'GET' && url.pathname === welcomeWellKnownPath()) {
        send(res, 200, `${welcomeMatMarkdown()}\n`, 'text/markdown; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === termsPath()) {
        send(res, 200, TERMS_OF_SERVICE, 'text/plain; charset=utf-8');
        return;
      }
      if (req.method === 'POST' && url.pathname === signupPath()) {
        const dpopJwt = req.headers.dpop;
        if (typeof dpopJwt !== 'string' || dpopJwt.length === 0) {
          sendJson(res, 400, { error: 'missing_dpop' });
          return;
        }
        const body = await readJsonBody(req);
        if (!isSignupRequestBody(body)) {
          sendJson(res, 400, { error: 'invalid_signup_body' });
          return;
        }
        const validated = validateSignup({
          dpopJwt,
          accessTokenJwt: body.access_token!,
          tosSignatureB64url: body.tos_signature!,
          handle: body.handle!,
        });
        registry.remember(validated.handle, validated.jwkThumbprint);
        const signup = issueCommonsStationToken(validated.handle, validated.jwkThumbprint, options.authSecret);
        sendJson(res, 200, signup);
        return;
      }
      serveStatic(options.rootDir, req, res);
    } catch (error) {
      sendJson(res, 400, {
        error: 'request_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function startHeadwatersHttpServer(options: HeadwatersHttpServerOptions): Promise<void> {
  const server = createHeadwatersHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => resolve());
  });
}
