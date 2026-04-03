import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createIntent } from '@differ/itp/src/protocol.ts';
import { frameToServerMessage, itpMessageToFrame, serializeFramedMessage } from '../src/framing.ts';
import { HttpReferenceStation } from '../src/server.ts';
import { TERMS_OF_SERVICE, sha256b64url } from '../src/welcome-mat.ts';

const testDir = mkdtempSync(join(tmpdir(), 'http-reference-station-test-'));
const authSecret = 'intent-space-dev-secret';

let pass = 0;
let fail = 0;
let step = 0;

function test(name: string) {
  step++;
  process.stdout.write(`\n=== Test ${step}: ${name} ===\n`);
}

function ok() {
  pass++;
  console.log('  OK');
}

function bad(msg: string) {
  fail++;
  console.log(`  FAIL: ${msg}`);
}

function assert(cond: boolean, msg: string) {
  if (cond) ok();
  else bad(msg);
}

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

interface HttpIdentity {
  publicJwk: JsonWebKey;
  privateKeyPem: string;
  thumbprint: string;
}

function makeIdentity(): HttpIdentity {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const thumbprint = createHash('sha256').update(
    JSON.stringify({ e: publicJwk.e, kty: 'RSA', n: publicJwk.n }),
  ).digest('base64url');
  return { publicJwk, privateKeyPem, thumbprint };
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const headerPart = b64urlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem);
  return `${signingInput}.${b64urlEncode(signature)}`;
}

function makeAccessToken(identity: HttpIdentity, origin: string): string {
  return signJwt(
    { typ: 'wm+jwt', alg: 'RS256' },
    {
      aud: origin,
      cnf: { jkt: identity.thumbprint },
      tos_hash: sha256b64url(TERMS_OF_SERVICE),
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID(),
    },
    identity.privateKeyPem,
  );
}

function makeDpopProof(identity: HttpIdentity, method: string, url: string, stationToken?: string): string {
  return signJwt(
    { typ: 'dpop+jwt', alg: 'RS256', jwk: identity.publicJwk },
    {
      jti: randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      htm: method.toUpperCase(),
      htu: url,
      ...(stationToken ? { ath: createHash('sha256').update(stationToken).digest('base64url') } : {}),
    },
    identity.privateKeyPem,
  );
}

function signTerms(identity: HttpIdentity): string {
  return b64urlEncode(sign('RSA-SHA256', Buffer.from(TERMS_OF_SERVICE, 'utf8'), identity.privateKeyPem));
}

const station = new HttpReferenceStation({
  host: '127.0.0.1',
  port: 0,
  dataDir: testDir,
  authSecret,
});
await station.start();

async function postSignup(handle: string, identity: HttpIdentity): Promise<any> {
  const signupUrl = `${station.origin}/signup`;
  const response = await fetch(signupUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      dpop: makeDpopProof(identity, 'POST', signupUrl),
    },
    body: JSON.stringify({
      handle,
      access_token: makeAccessToken(identity, station.origin),
      tos_signature: signTerms(identity),
    }),
  });
  return await response.json();
}

// --- Test 1: discovery works ---
test('Discovery document is published');
{
  const response = await fetch(`${station.origin}/.well-known/welcome.md`);
  const text = await response.text();
  assert(response.status === 200 && text.includes('/itp') && text.includes('/signup'), 'Expected welcome document with core endpoints');
}

// --- Test 2: signup succeeds ---
test('Signup issues station materials');
const identity = makeIdentity();
const signup = await postSignup('agent-http', identity);
{
  assert(typeof signup.station_token === 'string', 'Expected station token');
  assert(signup.station_origin === station.origin, 'Expected station origin in signup response');
}

// --- Test 3: /itp accepts framed intent body ---
test('/itp accepts framed intent body');
{
  const itpUrl = `${station.origin}/itp`;
  const intent = createIntent(signup.principal_id, 'build http station');
  intent.intentId = 'http-test-intent';
  const response = await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(identity, 'POST', itpUrl, signup.station_token),
    },
    body: serializeFramedMessage(itpMessageToFrame(intent)),
  });
  const body = Buffer.from(await response.arrayBuffer());
  const parsed = frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body));
  assert(response.status === 200 && parsed.type === 'INTENT', 'Expected framed INTENT echo');
  assert(parsed.type === 'INTENT' && parsed.intentId === 'http-test-intent' && typeof parsed.seq === 'number', 'Expected persisted echo with seq');
}

// --- Test 4: /scan returns service intents and posted intent ---
test('/scan returns framed SCAN_RESULT');
let latestSeq = 0;
{
  const scanUrl = `${station.origin}/scan`;
  const request = serializeFramedMessage({
    verb: 'SCAN',
    headers: {
      space: 'root',
      since: '0',
    },
    body: Buffer.alloc(0),
  });
  const response = await fetch(scanUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(identity, 'POST', scanUrl, signup.station_token),
    },
    body: request,
  });
  const body = Buffer.from(await response.arrayBuffer());
  const parsed = frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body));
  assert(response.status === 200 && parsed.type === 'SCAN_RESULT', 'Expected SCAN_RESULT');
  if (parsed.type === 'SCAN_RESULT') {
    latestSeq = parsed.latestSeq;
    const ids = parsed.messages.map((message) => message.intentId ?? message.promiseId);
    assert(ids.includes('http-test-intent'), 'Expected posted intent in scan results');
    assert(ids.includes('http-reference-station:persist'), 'Expected service intent in scan results');
  }
}

// --- Test 5: /stream emits framed stored acts ---
test('/stream emits framed stored acts over SSE');
{
  const streamUrl = `${station.origin}/stream?space=root&since=${latestSeq}`;
  const response = await fetch(streamUrl, {
    method: 'GET',
    headers: {
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(identity, 'GET', streamUrl, signup.station_token),
    },
  });
  const reader = response.body?.getReader();
  assert(response.status === 200 && reader != null, 'Expected SSE stream response');

  const followup = createIntent(signup.principal_id, 'observe stream');
  followup.intentId = 'http-stream-intent';
  await fetch(`${station.origin}/itp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(identity, 'POST', `${station.origin}/itp`, signup.station_token),
    },
    body: serializeFramedMessage(itpMessageToFrame(followup)),
  });

  let text = '';
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const chunk = await reader!.read();
    text += Buffer.from(chunk.value ?? new Uint8Array()).toString('utf8');
    if (text.includes('http-stream-intent')) break;
    if (chunk.done) break;
  }
  assert(text.includes('INTENT') && text.includes('http-stream-intent'), 'Expected framed INTENT in SSE data payload');
  await reader!.cancel();
}

await station.stop();
rmSync(testDir, { recursive: true, force: true });

console.log(`\nPassed: ${pass}`);
console.log(`Failed: ${fail}`);

if (fail > 0) {
  process.exit(1);
}
