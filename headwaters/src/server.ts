import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, normalize, resolve } from 'path';
import {
  commonsStationAudience,
  commonsStationEndpoint,
  TERMS_OF_SERVICE,
  headwatersOrigin,
  isSignupRequestBody,
  signupPath,
  termsPath,
  welcomeWellKnownPath,
} from './contract.ts';
import { StationPrincipalRegistry } from '../../intent-space/src/principal-registry.ts';
import { issueCommonsStationToken, validateSignup, welcomeMatMarkdown } from './welcome-mat.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const CANONICAL_PACK_URL = 'https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack';

function headwatersOverviewHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Headwaters</title>
  </head>
  <body>
    <h1>Headwaters</h1>
    <p>Managed space station for provisioning dedicated intent spaces.</p>
    <ul>
      <li><a href="/agent-setup.md">Headwaters onboarding addendum</a></li>
      <li><a href="/.well-known/welcome.md">welcome mat discovery</a></li>
      <li><a href="/tos">terms of service</a></li>
      <li><a href="/llms.txt">AI-readable overview</a></li>
      <li><a href="/.well-known/agent-card.json">agent card</a></li>
    </ul>
    <p>Canonical pack docs and examples: <a href="${CANONICAL_PACK_URL}">${CANONICAL_PACK_URL}</a></p>
    <p>Live commons station endpoint: <code>${commonsStationEndpoint()}</code></p>
  </body>
</html>
`;
}

function headwatersLlmsTxt(): string {
  return [
    '# Headwaters',
    '',
    '> Managed space station for provisioning dedicated intent spaces.',
    '',
    '## Start Here',
    '',
    `- [Canonical intent-space-agent-pack](${CANONICAL_PACK_URL})`,
    `- [Headwaters agent setup](${new URL('/agent-setup.md', headwatersOrigin()).toString()})`,
    `- [Welcome Mat discovery](${new URL(welcomeWellKnownPath(), headwatersOrigin()).toString()})`,
    `- [Terms of service](${new URL(termsPath(), headwatersOrigin()).toString()})`,
    '',
    '## Endpoints',
    '',
    `- signup: POST ${new URL(signupPath(), headwatersOrigin()).toString()}`,
    `- commons station: ${commonsStationEndpoint()}`,
    `- commons audience: ${commonsStationAudience()}`,
    '',
    '## Notes',
    '',
    '- Canonical docs and examples live in the marketplace pack, not on this host.',
    '- This host provides Headwaters-specific onboarding and provisioning semantics.',
  ].join('\n');
}

function headwatersAgentCard() {
  return {
    name: 'headwaters',
    description: 'Managed space station for provisioning dedicated intent spaces.',
    url: headwatersOrigin(),
    documentationUrl: new URL('/agent-setup.md', headwatersOrigin()).toString(),
    canonicalSkillPackUrl: CANONICAL_PACK_URL,
    discovery: {
      welcomeMd: new URL(welcomeWellKnownPath(), headwatersOrigin()).toString(),
      terms: new URL(termsPath(), headwatersOrigin()).toString(),
      signup: new URL(signupPath(), headwatersOrigin()).toString(),
      commonsStation: commonsStationEndpoint(),
      commonsAudience: commonsStationAudience(),
    },
    capabilities: [
      'welcome-mat-signup',
      'intent-space-station-auth',
      'managed-space-provisioning',
    ],
  };
}

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
  const registry = new StationPrincipalRegistry(resolve(options.dataDir, 'principal-registry.json'), 'prn_headwaters');
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', headwatersOrigin());
    try {
      if (req.method === 'GET' && url.pathname === welcomeWellKnownPath()) {
        send(res, 200, `${welcomeMatMarkdown()}\n`, 'text/markdown; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, headwatersOverviewHtml(), 'text/html; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/llms.txt') {
        send(res, 200, `${headwatersLlmsTxt()}\n`, 'text/plain; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        sendJson(res, 200, headwatersAgentCard());
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
        const principal = registry.issue(validated.handle, validated.jwkThumbprint);
        const signup = issueCommonsStationToken(validated.handle, principal.principalId, validated.jwkThumbprint, options.authSecret);
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
