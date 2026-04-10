import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createIntent } from '@differ/itp/src/protocol.ts';
import {
  FrameParseError,
  ITP_SIGNATURE_HEADER,
  ITP_SIGNATURE_VERSION,
  canonicalProofBytes,
  frameToItpMessage,
  frameToServerMessage,
  itpMessageToFrame,
  parseSingleFramedMessage,
  serializeFramedMessage,
} from '../src/framing.ts';
import { HttpReferenceStation } from '../src/server.ts';
import { TERMS_OF_SERVICE, sha256b64url } from '../src/welcome-mat.ts';

const testDir = mkdtempSync(join(tmpdir(), 'http-reference-station-test-'));
const dbPath = join(testDir, 'http-reference-station.db');
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

function signStationJwt(payload: Record<string, unknown>): string {
  const headerPart = b64urlEncode(Buffer.from(JSON.stringify({ typ: 'itp+jwt', alg: 'HS256' }), 'utf8'));
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', authSecret).update(signingInput).digest();
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
  dbPath,
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

async function postContinue(identity: HttpIdentity): Promise<any> {
  const continueUrl = `${station.origin}/continue`;
  const response = await fetch(continueUrl, {
    method: 'POST',
    headers: {
      dpop: makeDpopProof(identity, 'POST', continueUrl),
    },
  });
  return await response.json();
}

function expiredStationToken(stationToken: string): string {
  const [headerPart, payloadPart] = stationToken.split('.');
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<string, unknown>;
  return signStationJwt({
    ...payload,
    exp: Math.floor(Date.now() / 1000) - 60,
  });
}

async function postItp(signupResponse: any, identityValue: HttpIdentity, message: ReturnType<typeof createIntent>): Promise<any> {
  const itpUrl = `${station.origin}/itp`;
  const response = await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signupResponse.station_token}`,
      dpop: makeDpopProof(identityValue, 'POST', itpUrl, signupResponse.station_token),
    },
    body: serializeFramedMessage(itpMessageToFrame(message)),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    parsed: frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body)),
  };
}

async function scanSpace(signupResponse: any, identityValue: HttpIdentity, spaceId: string): Promise<any> {
  const scanUrl = `${station.origin}/scan`;
  const response = await fetch(scanUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signupResponse.station_token}`,
      dpop: makeDpopProof(identityValue, 'POST', scanUrl, signupResponse.station_token),
    },
    body: serializeFramedMessage({
      verb: 'SCAN',
      headers: {
        space: spaceId,
        since: '0',
      },
      body: Buffer.alloc(0),
    }),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    parsed: frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body)),
  };
}

// --- Canonical proof/hash envelope tests ---
test('Canonical proof bytes are order-invariant and strip proof');
{
  const body = Buffer.from('{}', 'utf8');
  const first = canonicalProofBytes({
    verb: 'INTENT',
    headers: {
      sender: 'agent-http',
      parent: 'root',
      intent: 'intent-http',
      timestamp: '1775701868218',
      proof: 'proof-to-strip',
      'payload-hint': 'application/json',
    },
    body,
  });
  const second = canonicalProofBytes({
    verb: 'INTENT',
    headers: {
      'payload-hint': 'application/json',
      timestamp: '1775701868218',
      proof: 'different-proof-to-strip',
      intent: 'intent-http',
      parent: 'root',
      sender: 'agent-http',
    },
    body,
  });
  const text = first.toString('utf8');
  assert(first.equals(second), 'Expected canonical bytes to ignore insertion order');
  assert(text.includes(`${ITP_SIGNATURE_HEADER}: ${ITP_SIGNATURE_VERSION}`), 'Expected canonical bytes to include signature version');
  assert(!text.includes('proof:'), 'Expected canonical bytes to strip proof');
  assert(text.split('\n').at(-3) === 'body-length: 2', 'Expected body-length to be the final header');
}

test('Continue reissues the current station credential for the same principal');
{
  const identity = makeIdentity();
  const firstSignup = await postSignup('agent-http-continuity', identity);
  const secondSignup = await postContinue(identity);

  assert(
    firstSignup.principal_id === secondSignup.principal_id,
    `Expected continue to preserve principal_id, got ${firstSignup.principal_id} vs ${secondSignup.principal_id}`,
  );
  assert(
    firstSignup.station_token !== secondSignup.station_token,
    'Expected continue to reissue a fresh station token',
  );
  assert(
    secondSignup.continue_endpoint === `${station.origin}/continue`,
    `Expected continue endpoint in response, got ${secondSignup.continue_endpoint}`,
  );

  const staleAfterContinue = await scanSpace(firstSignup, identity, 'root');
  assert(
    staleAfterContinue.status === 401 && staleAfterContinue.parsed.message.includes('no longer current'),
    `Expected superseded credential to be rejected after continue, got ${staleAfterContinue.status} ${JSON.stringify(staleAfterContinue.parsed)}`,
  );

  const currentAfterContinue = await scanSpace(secondSignup, identity, 'root');
  assert(currentAfterContinue.status === 200, 'Expected continued credential to succeed on live scan');
}

test('Signed frame without itp-sig is rejected');
{
  let parseMessage = '';
  try {
    parseSingleFramedMessage(Buffer.from([
      'INTENT',
      'sender: agent-http',
      'parent: root',
      'intent: intent-http',
      'timestamp: 1775701868218',
      'proof: stale-proof',
      'body-length: 2',
      '',
      '{}',
    ].join('\n'), 'utf8'));
  } catch (error) {
    parseMessage = error instanceof Error ? error.message : String(error);
  }

  let serializeMessage = '';
  try {
    serializeFramedMessage({
      verb: 'INTENT',
      headers: {
        sender: 'agent-http',
        parent: 'root',
        intent: 'intent-http',
        timestamp: '1775701868218',
        proof: 'stale-proof',
      },
      body: Buffer.from('{}', 'utf8'),
    });
  } catch (error) {
    serializeMessage = error instanceof Error ? error.message : String(error);
  }

  assert(
    parseMessage.includes('Signed frame requires itp-sig: v1')
      && serializeMessage.includes('Signed frame requires itp-sig: v1'),
    `Expected signed-frame marker rejection, got parse="${parseMessage}" serialize="${serializeMessage}"`,
  );
}

// --- Test 1: discovery works ---
test('Discovery document is published');
{
  const response = await fetch(`${station.origin}/.well-known/welcome.md`);
  const text = await response.text();
  assert(response.status === 200 && text.includes('/itp') && text.includes('/signup') && text.includes('/continue'), 'Expected welcome document with core endpoints');
}

// --- Test 2: signup succeeds ---
test('Signup issues station materials');
const identity = makeIdentity();
const signup = await postSignup('agent-http', identity);
{
  assert(typeof signup.station_token === 'string', 'Expected station token');
  assert(signup.station_origin === station.origin, 'Expected station origin in signup response');
  assert(signup.continue_endpoint === `${station.origin}/continue`, 'Expected continue endpoint in signup response');
}

// --- Test 3: expired station token is rejected ---
test('/itp rejects expired station tokens');
{
  const itpUrl = `${station.origin}/itp`;
  const intent = createIntent(signup.principal_id, 'expired token should fail');
  intent.intentId = 'http-test-expired';
  const staleToken = expiredStationToken(signup.station_token);
  const response = await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${staleToken}`,
      dpop: makeDpopProof(identity, 'POST', itpUrl, staleToken),
    },
    body: serializeFramedMessage(itpMessageToFrame(intent)),
  });
  const body = Buffer.from(await response.arrayBuffer());
  const parsed = frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body));
  assert(response.status === 401 && parsed.type === 'ERROR', 'Expected expired station token to be rejected');
  assert(parsed.type === 'ERROR' && parsed.message.includes('expired'), `Expected expired token error, got ${parsed.type === 'ERROR' ? parsed.message : 'unexpected response'}`);
}

// --- Test 4: /itp accepts framed intent body ---
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

// --- Test 5: malformed ACCEPT without promise header is rejected ---
test('/itp rejects ACCEPT missing promise header');
{
  const itpUrl = `${station.origin}/itp`;
  const malformedAccept = serializeFramedMessage({
    verb: 'ACCEPT',
    headers: {
      sender: signup.principal_id,
      parent: 'root',
      timestamp: String(Date.now()),
      'payload-hint': 'application/json',
    },
    body: Buffer.from('{}', 'utf8'),
  });
  const response = await fetch(itpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/itp',
      authorization: `DPoP ${signup.station_token}`,
      dpop: makeDpopProof(identity, 'POST', itpUrl, signup.station_token),
    },
    body: malformedAccept,
  });
  const body = Buffer.from(await response.arrayBuffer());
  const parsed = frameToServerMessage((await import('../src/framing.ts')).parseSingleFramedMessage(body));
  assert(
    response.status === 400 && parsed.type === 'ERROR',
    'Expected malformed ACCEPT to be rejected with framed ERROR',
  );
}

// --- Test 6: alternate promise-id header does not satisfy required promise header ---
test('framing rejects ACCEPT with promise-id instead of promise');
{
  let message = '';
  try {
    frameToItpMessage({
      verb: 'ACCEPT',
      headers: {
        sender: 'agent-http',
        parent: 'root',
        'promise-id': 'promise-123',
        timestamp: String(Date.now()),
        'body-length': '2',
      },
      body: Buffer.from('{}', 'utf8'),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes('Missing promise header on ACCEPT'),
    `Expected missing promise header error, got: ${message}`,
  );
}

// --- Test 7: shared private spaces admit named peers and deny outsiders ---
test('private shared space admits named peers and denies outsiders');
{
  const peerIdentity = makeIdentity();
  const outsiderIdentity = makeIdentity();
  const peerSignup = await postSignup('peer-http', peerIdentity);
  const outsiderSignup = await postSignup('outsider-http', outsiderIdentity);

  const sharedIntent = createIntent(signup.principal_id, 'create shared room');
  sharedIntent.intentId = 'http-private-shared-1';
  sharedIntent.payload = {
    content: 'shared private room',
    spacePolicy: {
      visibility: 'private',
      participants: [signup.principal_id, peerSignup.principal_id],
    },
  };

  const posted = await postItp(signup, identity, sharedIntent);
  assert(posted.status === 200 && posted.parsed.type === 'INTENT', 'Expected shared private intent to post successfully');
  if (posted.parsed.type === 'INTENT') {
    assert(
      posted.parsed.senderId === signup.principal_id,
      `Expected shared private post sender to match requester principal, got ${posted.parsed.senderId} vs ${signup.principal_id}`,
    );
  }
  const storedPolicy = (station as any).store.getSpacePolicy('http-private-shared-1');
  assert(
    Array.isArray(storedPolicy?.participants) && storedPolicy.participants.includes(signup.principal_id) && storedPolicy.participants.includes(peerSignup.principal_id),
    `Expected shared private policy to be stored for requester=${signup.principal_id} peer=${peerSignup.principal_id}, got ${JSON.stringify(storedPolicy)}`,
  );

  const sharedFollowup = createIntent(signup.principal_id, 'shared followup');
  sharedFollowup.intentId = 'http-private-shared-1-followup';
  sharedFollowup.parentId = 'http-private-shared-1';
  sharedFollowup.payload = {
    content: 'visible only to named participants',
  };
  const followupPosted = await postItp(signup, identity, sharedFollowup);
  assert(
    followupPosted.status === 200 && followupPosted.parsed.type === 'INTENT',
    `Expected follow-up act inside private shared space, got status=${followupPosted.status} parsed=${JSON.stringify(followupPosted.parsed)}`,
  );

  const peerScan = await scanSpace(peerSignup, peerIdentity, 'http-private-shared-1');
  assert(
    peerScan.status === 200 && peerScan.parsed.type === 'SCAN_RESULT',
    `Expected named peer to scan shared private space, got status=${peerScan.status} parsed=${JSON.stringify(peerScan.parsed)}`,
  );
  if (peerScan.parsed.type === 'SCAN_RESULT') {
    assert(
      peerScan.parsed.messages.some((message) => message.intentId === 'http-private-shared-1-followup'),
      'Expected peer scan to include a follow-up act inside the shared private space',
    );
  }

  const outsiderScan = await scanSpace(outsiderSignup, outsiderIdentity, 'http-private-shared-1');
  assert(outsiderScan.status === 401 && outsiderScan.parsed.type === 'ERROR', 'Expected outsider scan to be rejected');
  if (outsiderScan.parsed.type === 'ERROR') {
    assert(
      outsiderScan.parsed.message.includes('Access denied to space http-private-shared-1'),
      `Expected outsider denial message, got: ${outsiderScan.parsed.message}`,
    );
  }
}

// --- Test 8: /stream emits framed stored acts ---
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
