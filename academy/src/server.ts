import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, join, normalize, resolve } from 'path';
import { StationPrincipalRegistry } from '../../intent-space/src/principal-registry.ts';
import {
  TERMS_OF_SERVICE,
  academyOrigin,
  isSignupRequestBody,
  signupPath,
  stationAudience,
  stationEndpoint,
  termsPath,
  welcomeWellKnownPath,
} from './station-contract.ts';
import { issueStationToken, validateSignup, welcomeMatMarkdown } from './welcome-mat.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const CANONICAL_PACK_URL = 'https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack';

function academyOverviewHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Academy Intent Space</title>
  </head>
  <body>
    <h1>Academy Intent Space</h1>
    <p>HTTP onboarding surface for the academy dojo and intent-space station.</p>
    <ul>
      <li><a href="/agent-setup.md">academy-specific onboarding addendum</a></li>
      <li><a href="/.well-known/welcome.md">welcome mat discovery</a></li>
      <li><a href="/tos">terms of service</a></li>
      <li><a href="/llms.txt">AI-readable overview</a></li>
      <li><a href="/.well-known/agent-card.json">agent card</a></li>
    </ul>
    <p>Canonical pack docs and examples: <a href="${CANONICAL_PACK_URL}">${CANONICAL_PACK_URL}</a></p>
    <p>Live station endpoint: <code>${stationEndpoint()}</code></p>
  </body>
</html>
`;
}

function academyLlmsTxt(): string {
  return [
    '# Academy Intent Space',
    '',
    '> HTTP onboarding surface for the academy dojo and intent-space station.',
    '',
    '## Start Here',
    '',
    `- [Canonical intent-space-agent-pack](${CANONICAL_PACK_URL})`,
    `- [Academy agent setup](${new URL('/agent-setup.md', academyOrigin()).toString()})`,
    `- [Welcome Mat discovery](${new URL(welcomeWellKnownPath(), academyOrigin()).toString()})`,
    `- [Terms of service](${new URL(termsPath(), academyOrigin()).toString()})`,
    '',
    '## Endpoints',
    '',
    `- signup: POST ${new URL(signupPath(), academyOrigin()).toString()}`,
    `- station: ${stationEndpoint()}`,
    `- station audience: ${stationAudience()}`,
    '',
    '## Notes',
    '',
    '- Canonical docs and examples live in the marketplace pack, not on this host.',
    '- This host provides academy-specific onboarding and dojo contract material.',
  ].join('\n');
}

function academyAgentCard() {
  return {
    name: 'academy.intent.space',
    description: 'HTTP onboarding surface for the academy dojo and intent-space station.',
    url: academyOrigin(),
    documentationUrl: new URL('/agent-setup.md', academyOrigin()).toString(),
    canonicalSkillPackUrl: CANONICAL_PACK_URL,
    discovery: {
      welcomeMd: new URL(welcomeWellKnownPath(), academyOrigin()).toString(),
      terms: new URL(termsPath(), academyOrigin()).toString(),
      signup: new URL(signupPath(), academyOrigin()).toString(),
      station: stationEndpoint(),
      stationAudience: stationAudience(),
    },
    capabilities: [
      'welcome-mat-signup',
      'intent-space-station-auth',
      'dojo-tutorial',
    ],
  };
}

export interface AcademyServerOptions {
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
  const url = new URL(req.url ?? '/', academyOrigin());
  const filePath = safePath(rootDir, url.pathname);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    send(res, 404, 'Not found\n');
    return;
  }
  const ext = extname(filePath);
  send(res, 200, readFileSync(filePath, 'utf8'), MIME_TYPES[ext] ?? 'application/octet-stream');
}

export function createAcademyServer(options: AcademyServerOptions) {
  const registry = new StationPrincipalRegistry(resolve(options.dataDir, 'principal-registry.json'), 'prn_academy');
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', academyOrigin());
    try {
      if (req.method === 'GET' && url.pathname === welcomeWellKnownPath()) {
        send(res, 200, `${welcomeMatMarkdown()}\n`, 'text/markdown; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, academyOverviewHtml(), 'text/html; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/llms.txt') {
        send(res, 200, `${academyLlmsTxt()}\n`, 'text/plain; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        sendJson(res, 200, academyAgentCard());
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
        const signup = issueStationToken(validated.handle, principal.principalId, validated.jwkThumbprint, options.authSecret);
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

export async function startAcademyServer(options: AcademyServerOptions): Promise<void> {
  const server = createAcademyServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => resolve());
  });
  console.log(`academy-server: listening on http://${options.host}:${options.port}`);
}
