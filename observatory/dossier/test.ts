/**
 * Test harness for the dossier dashboard.
 *
 * Starts the http-reference-station, signs up an agent, seeds sample intent
 * threads, then serves the dashboard HTML on the same origin so there are no
 * CORS issues.
 *
 * Usage:
 *   cd observatory/dossier
 *   npx tsx test.ts
 *
 * Then open the URL printed to the console.
 */

import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { readFileSync } from 'fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { join, resolve } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import {
  serializeFramedMessage,
  itpMessageToFrame,
} from '../../http-reference-station/src/framing.ts';
import { HttpReferenceStation } from '../../http-reference-station/src/server.ts';
import { TERMS_OF_SERVICE, sha256b64url } from '../../http-reference-station/src/welcome-mat.ts';
import { createIntent } from '../../itp/src/protocol.ts';

const testDir = mkdtempSync(join(tmpdir(), 'dossier-test-'));

// ── Identity helpers ─────────────────────────────────────────────────────────

interface Identity {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  privateKeyPem: string;
  thumbprint: string;
}

function makeIdentity(): Identity {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const privateJwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;
  const thumbprint = createHash('sha256').update(
    JSON.stringify({ e: publicJwk.e, kty: 'RSA', n: publicJwk.n }),
  ).digest('base64url');
  return { publicJwk, privateJwk, privateKeyPem, thumbprint };
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, pem: string): string {
  const h = b64url(Buffer.from(JSON.stringify(header), 'utf8'));
  const p = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const input = `${h}.${p}`;
  const sig = sign('RSA-SHA256', Buffer.from(input, 'utf8'), pem);
  return `${input}.${b64url(sig)}`;
}

function makeAccessToken(id: Identity, origin: string): string {
  return signJwt(
    { typ: 'wm+jwt', alg: 'RS256' },
    { aud: origin, cnf: { jkt: id.thumbprint }, tos_hash: sha256b64url(TERMS_OF_SERVICE), iat: Math.floor(Date.now() / 1000), jti: randomUUID() },
    id.privateKeyPem,
  );
}

function makeDpopProof(id: Identity, method: string, url: string, token?: string): string {
  return signJwt(
    { typ: 'dpop+jwt', alg: 'RS256', jwk: id.publicJwk },
    {
      jti: randomUUID(), iat: Math.floor(Date.now() / 1000), htm: method.toUpperCase(), htu: url,
      ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}),
    },
    id.privateKeyPem,
  );
}

function signTerms(id: Identity): string {
  return b64url(sign('RSA-SHA256', Buffer.from(TERMS_OF_SERVICE, 'utf8'), id.privateKeyPem));
}

// ── Station setup ────────────────────────────────────────────────────────────

// Start a CORS-aware reverse proxy first (to get its port), then start the
// station configured with the proxy's origin so DPoP htu validation passes.

const corsProxy = createServer(() => {}); // handler replaced after station boots
await new Promise<void>((r) => corsProxy.listen(0, '127.0.0.1', r));
const corsAddr = corsProxy.address();
const corsPort = typeof corsAddr === 'object' && corsAddr ? corsAddr.port : 0;
const stationOrigin = `http://127.0.0.1:${corsPort}`;

const station = new HttpReferenceStation({
  host: '127.0.0.1',
  port: 0,
  dataDir: testDir,
  dbPath: join(testDir, 'station.db'),
  authSecret: 'dossier-test-secret',
  origin: stationOrigin, // station uses the proxy origin for URL construction + DPoP htu
});
await station.start();

const rawStationOrigin = `http://127.0.0.1:${(station as any)._port}`;

// Now wire up the CORS proxy handler
corsProxy.removeAllListeners('request');
corsProxy.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  const corsHeaders: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, dpop, content-type',
    'access-control-expose-headers': 'content-type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const targetUrl = `${rawStationOrigin}${req.url}`;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const upstream = await fetch(targetUrl, {
    method: req.method ?? 'GET',
    headers: Object.fromEntries(
      Object.entries(req.headers)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, v as string]),
    ),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
  });
  const responseHeaders: Record<string, string> = { ...corsHeaders };
  for (const [k, v] of upstream.headers.entries()) responseHeaders[k] = v;
  res.writeHead(upstream.status, responseHeaders);
  res.end(Buffer.from(await upstream.arrayBuffer()));
});

console.log(`Station running at ${rawStationOrigin} (CORS proxy at ${stationOrigin})`);

// ── Signup ───────────────────────────────────────────────────────────────────

const alice = makeIdentity();
const signupUrl = `${stationOrigin}/signup`;
const signupRes = await fetch(signupUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', dpop: makeDpopProof(alice, 'POST', signupUrl) },
  body: JSON.stringify({
    handle: 'alice-agent',
    access_token: makeAccessToken(alice, stationOrigin),
    tos_signature: signTerms(alice),
  }),
});
const signup = await signupRes.json() as { station_token: string; principal_id: string; scan_endpoint: string };
const spaceId = 'root'; // http-reference-station uses 'root' as its top-level space
console.log(`Signed up as ${signup.principal_id} in space ${spaceId}`);

// ── Seed data ────────────────────────────────────────────────────────────────

async function postIntent(content: string): Promise<string> {
  const intentId = `intent-${randomUUID().slice(0, 8)}`;
  const msg = {
    type: 'INTENT' as const,
    senderId: signup.principal_id,
    parentId: spaceId,
    intentId,
    payload: { content },
  };
  const itpUrl = `${stationOrigin}/itp`;
  await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(alice, 'POST', itpUrl, signup.station_token),
    },
    body: serializeFramedMessage(itpMessageToFrame(msg)),
  });
  return intentId;
}

async function postResponse(parentId: string, intentId: string, type: string, content: string): Promise<void> {
  const msg: Record<string, unknown> = {
    type,
    senderId: signup.principal_id,
    parentId,
    intentId: type === 'INTENT' || type === 'DECLINE' ? intentId : undefined,
    promiseId: type !== 'INTENT' && type !== 'DECLINE' ? `promise-${randomUUID().slice(0, 8)}` : undefined,
    payload: { content },
  };
  const itpUrl = `${stationOrigin}/itp`;
  await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(alice, 'POST', itpUrl, signup.station_token),
    },
    body: serializeFramedMessage(itpMessageToFrame(msg as any)),
  });
}

// Seed three intent threads with promise lifecycle events
const intent1 = await postIntent('Provision a home space for bob-agent');
await postResponse(intent1, intent1, 'PROMISE', 'I will provision one home space for bob-agent');
await postResponse(intent1, intent1, 'ACCEPT', 'Accepted');
await postResponse(intent1, intent1, 'COMPLETE', 'Space provisioned');

const intent2 = await postIntent('Request shared workspace for design review');
await postResponse(intent2, intent2, 'PROMISE', 'I will create the shared workspace');

const intent3 = await postIntent('Investigate logging coverage gaps');

console.log(`Seeded 3 intent threads (${intent1}, ${intent2}, ${intent3})`);

// ── Static server for the dashboard HTML ─────────────────────────────────────

const dashboardHtml = readFileSync(resolve(import.meta.dirname!, 'index.html'), 'utf8');

const dashboardServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(dashboardHtml);
    return;
  }
  res.writeHead(404);
  res.end('Not found\n');
});

await new Promise<void>((r) => dashboardServer.listen(0, '127.0.0.1', r));
const dashAddr = dashboardServer.address();
const dashPort = typeof dashAddr === 'object' && dashAddr ? dashAddr.port : 0;
const dashOrigin = `http://127.0.0.1:${dashPort}`;

console.log(`
=== Dossier test ready ===

Dashboard:  ${dashOrigin}

Connect with these values:

  Station origin:  ${stationOrigin}
  Space ID:        ${spaceId}
  Scan URL:        ${stationOrigin}/scan
  Station token:   ${signup.station_token}

Private key JWK (paste into the dashboard):
${JSON.stringify(alice.privateJwk)}

Press Ctrl+C to stop.
`);
