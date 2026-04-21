/**
 * Intent Space test suite.
 *
 * Starts the server in-process, runs tests against it
 * using the client library, then shuts down.
 */

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { connect as netConnect } from 'net';
import { IntentSpace } from '../src/space.ts';
import { IntentSpaceClient } from '../src/client.ts';
import {
  ITP_SIGNATURE_HEADER,
  ITP_SIGNATURE_VERSION,
  canonicalProofBytes,
  frameToClientMessage,
  parseFramedMessages,
  serializeFramedMessage,
} from '../src/framing.ts';
import { requestProofHash } from '../src/proof-input.ts';
import { createIntent, createPromise } from '@differ/itp/src/protocol.ts';

const testDir = mkdtempSync(join(tmpdir(), 'intent-space-test-'));
const socketPath = join(testDir, 'test.sock');
const dbPath = join(testDir, 'test.db');

function generateTlsFixture(dir: string): { tlsKeyPem: string; tlsCertPem: string } {
  const keyPath = join(dir, 'test-tls-key.pem');
  const certPath = join(dir, 'test-tls-cert.pem');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-nodes',
    '-subj',
    '/CN=127.0.0.1',
  ]);
  return {
    tlsKeyPem: readFileSync(keyPath, 'utf8'),
    tlsCertPem: readFileSync(certPath, 'utf8'),
  };
}

const { tlsKeyPem, tlsCertPem } = generateTlsFixture(testDir);
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

interface TestIdentity {
  stationToken: string;
  buildProof: (action: string, request: Record<string, unknown>) => string;
}

interface TestIdentityOptions {
  expOffsetSeconds?: number;
}

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function makeIdentity(senderId: string, options: TestIdentityOptions = {}): TestIdentity {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const thumbprint = createHash('sha256').update(
    JSON.stringify({ e: publicJwk.e, kty: 'RSA', n: publicJwk.n }),
  ).digest('base64url');
  const expOffsetSeconds = options.expOffsetSeconds ?? (60 * 60);
  const header = { typ: 'itp+jwt', alg: 'HS256' };
  const payload = {
    iss: 'intent-space-test',
    sub: senderId,
    principal_id: senderId,
    aud: space.stationAudience,
    cnf: { jkt: thumbprint },
    scope: 'intent-space:station',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
    jti: randomUUID(),
  };
  const headerPart = b64urlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', authSecret).update(signingInput).digest();
  const stationToken = `${signingInput}.${b64urlEncode(signature)}`;

  return {
    stationToken,
    buildProof: (action: string, request: Record<string, unknown>) => {
      const proofHeader = { typ: 'itp-pop+jwt', alg: 'RS256', jwk: publicJwk };
      const proofPayload = {
        jti: `proof-${randomUUID()}`,
        sub: senderId,
        aud: space.stationAudience,
        iat: Math.floor(Date.now() / 1000),
        ath: createHash('sha256').update(stationToken).digest('base64url'),
        action,
        req_hash: requestProofHash(request as Parameters<typeof requestProofHash>[0]),
      };
      const proofHeaderPart = b64urlEncode(Buffer.from(JSON.stringify(proofHeader), 'utf8'));
      const proofPayloadPart = b64urlEncode(Buffer.from(JSON.stringify(proofPayload), 'utf8'));
      const proofSigningInput = `${proofHeaderPart}.${proofPayloadPart}`;
      const proofSignature = sign('RSA-SHA256', Buffer.from(proofSigningInput, 'utf8'), privateKeyPem);
      return `${proofSigningInput}.${b64urlEncode(proofSignature)}`;
    },
  };
}

async function connectAuthenticated(client: IntentSpaceClient, senderId: string): Promise<TestIdentity> {
  const identity = makeIdentity(senderId);
  await client.connect();
  await client.authenticate(identity.stationToken, identity.buildProof);
  return identity;
}

function latestMonitoringEvent(eventType: string): any {
  const events = space.scanMonitoringEvents(0, 500);
  const matches = events.filter((event) => event.eventType === eventType);
  return matches.at(-1);
}

async function sendRawUnixFrames(frames: Buffer[]): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    const responses: string[] = [];
    const socket = netConnect(socketPath);
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = parseFramedMessages(buffer);
      buffer = parsed.remainder;
      for (const frame of parsed.messages) {
        responses.push(frame.body.toString('utf8'));
      }
    });

    socket.on('error', reject);
    socket.on('connect', () => {
      for (const frame of frames) {
        socket.write(frame);
      }
      setTimeout(() => {
        socket.end();
        resolve(responses);
      }, 120);
    });
  });
}

// ============ Setup ============

const space = new IntentSpace({
  socketPath,
  dbPath,
  agentId: 'intent-space',
  tcpPort: 0,
  tlsPort: 0,
  tlsKeyPem,
  tlsCertPem,
  authSecret,
});
await space.start();
console.log(`Server listening on ${socketPath}`);

// ============ Tests ============

// --- Test 0: canonical proof bytes are independent of header insertion order ---
test('Canonical proof bytes are order-invariant and strip proof');
{
  const body = Buffer.from('{}', 'utf8');
  const first = canonicalProofBytes({
    verb: 'INTENT',
    headers: {
      sender: 'agent-a',
      parent: 'root',
      intent: 'intent-a',
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
      proof: 'different-proof-to-strip',
      timestamp: '1775701868218',
      intent: 'intent-a',
      parent: 'root',
      sender: 'agent-a',
    },
    body,
  });
  const text = first.toString('utf8');
  assert(first.equals(second), 'Expected canonical bytes to ignore insertion order');
  assert(text.includes(`${ITP_SIGNATURE_HEADER}: ${ITP_SIGNATURE_VERSION}`), 'Expected canonical bytes to include signature version');
  assert(!text.includes('proof:'), 'Expected canonical bytes to strip proof');
  assert(text.split('\n').at(-3) === 'body-length: 2', 'Expected body-length to be the final header');
}

// --- Test 0b: signed frames require itp-sig marker ---
test('Signed frame without itp-sig is rejected');
{
  let parseMessage = '';
  try {
    parseFramedMessages(Buffer.from([
      'SCAN',
      'space: root',
      'since: 0',
      'proof: stale-proof',
      'body-length: 0',
      '',
      '',
    ].join('\n'), 'utf8'));
  } catch (error) {
    parseMessage = error instanceof Error ? error.message : String(error);
  }

  let serializeMessage = '';
  try {
    serializeFramedMessage({
      verb: 'SCAN',
      headers: {
        space: 'root',
        since: '0',
        proof: 'stale-proof',
      },
      body: Buffer.alloc(0),
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

// --- Test 0c: expired token claims are rejected on the wire ---
test('Expired station token claims are rejected');
{
  const client = new IntentSpaceClient(socketPath);
  const identity = makeIdentity('agent-expired', { expOffsetSeconds: -60 });
  let errorMessage = '';
  await client.connect();
  try {
    await client.authenticate(identity.stationToken, identity.buildProof);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    client.disconnect();
  }

  assert(errorMessage.includes('Station token expired'), `Expected expired token rejection, got "${errorMessage}"`);
}

// --- Test 1: connect receives service intents ---
test('Connect receives service intents');
{
  const received: unknown[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'service-intent-observer');
  // Give the server a moment to send service intents
  await new Promise((r) => setTimeout(r, 100));
  const hasServiceIntents = received.some(
    (m: any) => m.intentId === 'intent-space:persist',
  );
  assert(hasServiceIntents, 'Expected intent-space:persist in received messages');
  client.disconnect();
}

// --- Test 2: post intent gets echo with seq ---
test('Post intent gets echo with seq');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'agent-1');
  await new Promise((r) => setTimeout(r, 50)); // drain service intents

  received.length = 0;
  const msg = createIntent('agent-1', 'build auth');
  msg.intentId = 'test-1';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.intentId === 'test-1');
  assert(echo && typeof echo.seq === 'number' && echo.seq > 0, 'Expected echo with seq');
  client.disconnect();
}

// --- Test 3: post with parentId ---
test('Post intent with parentId');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'agent-2');
  await new Promise((r) => setTimeout(r, 50));

  received.length = 0;
  const msg = createIntent('agent-2', 'need OAuth2');
  msg.intentId = 'test-2';
  msg.parentId = 'test-1';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.intentId === 'test-2');
  assert(echo && echo.parentId === 'test-1', 'Expected parentId=test-1');
  client.disconnect();
}

// --- Test 4: scan root space (containment) ---
test('Scan root space — containment');
{
  const client = new IntentSpaceClient(socketPath);
  await connectAuthenticated(client, 'scanner-root');
  await new Promise((r) => setTimeout(r, 50));

  const messages = await client.scan('root');
  const ids = messages.map((i) => i.intentId);
  assert(
    ids.includes('test-1') && !ids.includes('test-2'),
    `Root should have test-1 but not test-2, got: ${ids.join(', ')}`,
  );
  client.disconnect();
}

// --- Test 5: scan sub-space ---
test('Scan sub-space');
{
  const client = new IntentSpaceClient(socketPath);
  await connectAuthenticated(client, 'scanner-subspace');
  await new Promise((r) => setTimeout(r, 50));

  const messages = await client.scan('test-1');
  const ids = messages.map((i) => i.intentId ?? i.promiseId);
  assert(ids.includes('test-2'), `Sub-space should have test-2, got: ${ids.join(', ')}`);
  client.disconnect();
}

// --- Test 6: malformed ACCEPT without promise header is rejected ---
test('Malformed ACCEPT without promise header is rejected');
{
  const identity = makeIdentity('agent-bad-accept');
  const authFrame = serializeFramedMessage({
    verb: 'AUTH',
    headers: {
      'station-token': identity.stationToken,
      [ITP_SIGNATURE_HEADER]: ITP_SIGNATURE_VERSION,
      proof: identity.buildProof('AUTH', { type: 'AUTH', stationToken: identity.stationToken }),
    },
    body: Buffer.alloc(0),
  });
  const acceptTimestamp = Date.now();
  const badAccept = serializeFramedMessage({
    verb: 'ACCEPT',
    headers: {
      sender: 'agent-bad-accept',
      parent: 'root',
      timestamp: String(acceptTimestamp),
      [ITP_SIGNATURE_HEADER]: ITP_SIGNATURE_VERSION,
      proof: identity.buildProof('ACCEPT', {
        type: 'ACCEPT',
        parentId: 'root',
        senderId: 'agent-bad-accept',
        timestamp: acceptTimestamp,
        payload: {},
      }),
      'payload-hint': 'application/json',
    },
    body: Buffer.from('{}', 'utf8'),
  });
  const responses = await sendRawUnixFrames([authFrame, badAccept]);
  const sawMalformedReject = responses.some((text) => text.includes('Missing promise header on ACCEPT'));
  assert(sawMalformedReject, `Expected malformed ACCEPT rejection, got: ${responses.join(' | ')}`);
}

// --- Test 7: framing rejects promise-id alias on ACCEPT ---
test('Framing rejects ACCEPT with promise-id instead of promise');
{
  let message = '';
  try {
    frameToClientMessage({
      verb: 'ACCEPT',
      headers: {
        sender: 'agent-accept-alias',
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

// --- Test 8: scan with cursor ---
test('Scan with since cursor (past end)');
{
  const client = new IntentSpaceClient(socketPath);
  await connectAuthenticated(client, 'scanner-cursor');
  await new Promise((r) => setTimeout(r, 50));

  const messages = await client.scan('root', 9999);
  assert(messages.length === 0, `Expected empty, got ${messages.length}`);
  client.disconnect();
}

// --- Test 9: idempotent post ---
test('Idempotent post (duplicate intentId)');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'agent-1');
  await new Promise((r) => setTimeout(r, 50));

  received.length = 0;
  const msg = createIntent('agent-1', 'build auth');
  msg.intentId = 'test-1'; // same as before
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.intentId === 'test-1');
  assert(echo && typeof echo.seq === 'number', 'Duplicate should echo with original seq');
  client.disconnect();
}

// --- Test 10: second client sees echo ---
test('Second client sees echoed intent');
{
  const client1 = new IntentSpaceClient(socketPath);
  const client2 = new IntentSpaceClient(socketPath);
  const received2: any[] = [];

  await connectAuthenticated(client1, 'agent-1');
  await connectAuthenticated(client2, 'agent-2');
  client2.on('intent', (msg: unknown) => received2.push(msg));
  await new Promise((r) => setTimeout(r, 50));

  received2.length = 0;
  const msg = createIntent('agent-1', 'design landing page');
  msg.intentId = 'test-3';
  client1.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received2.find((m) => m.intentId === 'test-3');
  assert(echo && echo.seq > 0, 'Client 2 should see echoed intent from client 1');
  client1.disconnect();
  client2.disconnect();
}

// --- Test 11: projected PROMISE is accepted ---
test('Projected PROMISE is accepted');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('message', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'agent-1');
  await new Promise((r) => setTimeout(r, 50));

  received.length = 0;
  const msg = createPromise('agent-1', 'test-1', 'I will build auth');
  msg.promiseId = 'p-1';
  msg.parentId = 'test-1';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.type === 'PROMISE' && m.promiseId === 'p-1');
  assert(echo && echo.parentId === 'test-1' && typeof echo.seq === 'number', 'Expected projected PROMISE echo with seq');
  client.disconnect();
}

// --- Test 12: reject INTENT without intentId ---
test('Reject INTENT without intentId');
{
  const errors: string[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('error', (err: Error) => errors.push(err.message));
  const identity = await connectAuthenticated(client, 'agent-1');
  await new Promise((r) => setTimeout(r, 50));

  const broken = {
    type: 'INTENT',
    senderId: 'agent-1',
    parentId: 'root',
    timestamp: Date.now(),
    payload: { content: 'oops' },
  };
  (client as any).writeMessage({
    ...broken,
    proof: identity.buildProof('INTENT', broken),
  });
  await new Promise((r) => setTimeout(r, 100));

  assert(
    errors.some((e) => e.includes('Missing intent header on INTENT')),
    `Expected missing intent header error, got: ${errors.join(', ')}`,
  );
  client.disconnect();
}

// --- Test 13: fractal depth ---
test('Fractal: three levels deep');
{
  const client = new IntentSpaceClient(socketPath);
  await connectAuthenticated(client, 'agent-3');
  await new Promise((r) => setTimeout(r, 50));

  // Post level 2: child of test-2
  const msg = createIntent('agent-3', 'which provider?');
  msg.intentId = 'test-4';
  msg.parentId = 'test-2';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  // Scan level 2
  const level2 = await client.scan('test-2');
  assert(
    level2.some((i) => i.intentId === 'test-4'),
    'Level 2 sub-space should contain test-4',
  );

  // Verify root doesn't leak
  const root = await client.scan('root');
  assert(
    !root.some((i) => i.intentId === 'test-4'),
    'Root should NOT contain test-4',
  );
  client.disconnect();
}

// --- Test 14: TCP transport ---
test('TCP: connect, post, scan');
{
  const tcpPort = space.tcpPort!;
  const client = new IntentSpaceClient({ host: '127.0.0.1', port: tcpPort });
  const received: any[] = [];
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'tcp-agent');
  await new Promise((r) => setTimeout(r, 100));

  // Should receive service intents on connect
  const hasServiceIntents = received.some(
    (m: any) => m.intentId === 'intent-space:persist',
  );
  assert(hasServiceIntents, 'TCP client should receive service intents');

  // Post an intent via TCP
  received.length = 0;
  const msg = createIntent('tcp-agent', 'remote work');
  msg.intentId = 'tcp-test-1';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.intentId === 'tcp-test-1');
  assert(echo && typeof echo.seq === 'number' && echo.seq > 0, 'TCP post should echo with seq');

  // Scan via TCP
  const intents = await client.scan('root');
  assert(
    intents.some((i) => i.intentId === 'tcp-test-1'),
    'TCP scan should find the posted intent',
  );
  client.disconnect();
}

// --- Test 15: TCP and Unix clients see each other ---
test('TCP and Unix clients see each other');
{
  const tcpClient = new IntentSpaceClient({ host: '127.0.0.1', port: space.tcpPort! });
  const unixClient = new IntentSpaceClient(socketPath);
  const tcpReceived: any[] = [];
  const unixReceived: any[] = [];

  await connectAuthenticated(tcpClient, 'tcp-agent');
  await connectAuthenticated(unixClient, 'unix-agent');
  tcpClient.on('intent', (msg: unknown) => tcpReceived.push(msg));
  unixClient.on('intent', (msg: unknown) => unixReceived.push(msg));
  await new Promise((r) => setTimeout(r, 50));

  tcpReceived.length = 0;
  unixReceived.length = 0;

  // Post from Unix, see on TCP
  const msg1 = createIntent('unix-agent', 'local work');
  msg1.intentId = 'cross-test-1';
  unixClient.post(msg1);
  await new Promise((r) => setTimeout(r, 100));

  assert(
    tcpReceived.some((m) => m.intentId === 'cross-test-1'),
    'TCP client should see intent posted from Unix client',
  );

  // Post from TCP, see on Unix
  tcpReceived.length = 0;
  unixReceived.length = 0;
  const msg2 = createIntent('tcp-agent', 'remote work 2');
  msg2.intentId = 'cross-test-2';
  tcpClient.post(msg2);
  await new Promise((r) => setTimeout(r, 100));

  assert(
    unixReceived.some((m) => m.intentId === 'cross-test-2'),
    'Unix client should see intent posted from TCP client',
  );

  const projected = createPromise('tcp-agent', 'cross-test-1', 'I will do local work');
  projected.promiseId = 'cross-test-3';
  projected.parentId = 'cross-test-1';
  tcpClient.post(projected);
  await new Promise((r) => setTimeout(r, 100));

  const subspace = await unixClient.scan('cross-test-1');
  assert(
    subspace.some((m) => m.type === 'PROMISE' && m.promiseId === 'cross-test-3'),
    'Sub-space scan should contain projected promise event',
  );

  tcpClient.disconnect();
  unixClient.disconnect();
}

// --- Test 16: TLS transport ---
test('TLS: connect, post, scan');
{
  const client = new IntentSpaceClient({
    host: '127.0.0.1',
    port: space.tlsPort!,
    tls: true,
    ca: tlsCertPem,
    rejectUnauthorized: false,
  });
  const received: any[] = [];
  client.on('intent', (msg: unknown) => received.push(msg));
  await connectAuthenticated(client, 'tls-agent');
  await new Promise((r) => setTimeout(r, 100));

  const hasServiceIntents = received.some((m: any) => m.intentId === 'intent-space:persist');
  assert(hasServiceIntents, 'TLS client should receive service intents');

  received.length = 0;
  const msg = createIntent('tls-agent', 'secure remote work');
  msg.intentId = 'tls-test-1';
  client.post(msg);
  await new Promise((r) => setTimeout(r, 100));

  const echo = received.find((m) => m.intentId === 'tls-test-1');
  assert(echo && typeof echo.seq === 'number' && echo.seq > 0, 'TLS post should echo with seq');

  const messages = await client.scan('root');
  assert(messages.some((i) => i.intentId === 'tls-test-1'), 'TLS scan should find the posted intent');
  client.disconnect();
}

// --- Test 15: TLS and Unix clients see each other ---
test('TLS and Unix clients see each other');
{
  const tlsClient = new IntentSpaceClient({
    host: '127.0.0.1',
    port: space.tlsPort!,
    tls: true,
    ca: tlsCertPem,
    rejectUnauthorized: false,
  });
  const unixClient = new IntentSpaceClient(socketPath);
  const unixReceived: any[] = [];
  const tlsReceived: any[] = [];

  await connectAuthenticated(tlsClient, 'tls-agent');
  await connectAuthenticated(unixClient, 'unix-agent');
  tlsClient.on('intent', (msg: unknown) => tlsReceived.push(msg));
  unixClient.on('intent', (msg: unknown) => unixReceived.push(msg));
  await new Promise((r) => setTimeout(r, 50));

  tlsReceived.length = 0;
  unixReceived.length = 0;

  const msg1 = createIntent('unix-agent', 'unix to tls');
  msg1.intentId = 'tls-cross-1';
  unixClient.post(msg1);
  await new Promise((r) => setTimeout(r, 100));

  assert(
    tlsReceived.some((m) => m.intentId === 'tls-cross-1'),
    'TLS client should see intent posted from Unix client',
  );

  tlsReceived.length = 0;
  unixReceived.length = 0;
  const msg2 = createIntent('tls-agent', 'tls to unix');
  msg2.intentId = 'tls-cross-2';
  tlsClient.post(msg2);
  await new Promise((r) => setTimeout(r, 100));

  assert(
    unixReceived.some((m) => m.intentId === 'tls-cross-2'),
    'Unix client should see intent posted from TLS client',
  );

  tlsClient.disconnect();
  unixClient.disconnect();
}

// --- Test 16: monitoring records persisted message path ---
test('Monitoring records successful persisted message path');
{
  const event = latestMonitoringEvent('message_persisted');
  assert(
    event
      && event.stage === 'persistence'
      && event.messageType === 'INTENT'
      && typeof event.detail.seq === 'number',
    `Expected message_persisted event, got: ${JSON.stringify(event)}`,
  );
}

// --- Test 17: monitoring records invalid frame ---
test('Monitoring records invalid frame');
{
  const responses = await sendRawUnixFrames([Buffer.from('bogus\n\n', 'utf8')]);
  const invalidFrameEvent = latestMonitoringEvent('invalid_frame');
  assert(
    responses.some((line) => line.includes('Invalid frame')),
    `Expected Invalid frame response, got: ${responses.join(' | ')}`,
  );
  assert(
    invalidFrameEvent
      && invalidFrameEvent.stage === 'parse'
      && invalidFrameEvent.outcome === 'rejected',
    `Expected invalid_frame monitoring event, got: ${JSON.stringify(invalidFrameEvent)}`,
  );
}

// --- Test 18: monitoring records auth failure ---
test('Monitoring records auth failure');
{
  const authFrame = serializeFramedMessage({
    verb: 'AUTH',
    headers: {
      'station-token': 'not-a-jwt',
      [ITP_SIGNATURE_HEADER]: ITP_SIGNATURE_VERSION,
      proof: 'also-not-a-jwt',
    },
    body: Buffer.alloc(0),
  });
  const authResponses = await sendRawUnixFrames([authFrame]);
  const authFailedEvent = latestMonitoringEvent('auth_failed');
  assert(
    authResponses.some((line) => line.includes('Authentication failed')),
    `Expected auth failure response, got: ${authResponses.join(' | ')}`,
  );
  assert(
    authFailedEvent
      && authFailedEvent.stage === 'auth'
      && authFailedEvent.outcome === 'rejected',
    `Expected auth_failed monitoring event, got: ${JSON.stringify(authFailedEvent)}`,
  );
}

// --- Test 19: monitoring records denied private-space scan ---
test('Monitoring records shared private-space peer access and outsider denial');
{
  const owner = new IntentSpaceClient(socketPath);
  const peer = new IntentSpaceClient(socketPath);
  const outsider = new IntentSpaceClient(socketPath);
  await connectAuthenticated(owner, 'private-owner');
  await connectAuthenticated(peer, 'private-peer');
  await connectAuthenticated(outsider, 'private-outsider');
  await new Promise((r) => setTimeout(r, 50));

  const privateIntent = createIntent('private-owner', 'private workspace');
  privateIntent.intentId = 'private-space-1';
  privateIntent.payload = {
    content: 'private workspace',
    spacePolicy: {
      visibility: 'private',
      participants: ['private-owner', 'private-peer'],
    },
  };
  owner.post(privateIntent);
  await new Promise((r) => setTimeout(r, 100));

  const privateFollowup = createIntent('private-owner', 'private followup');
  privateFollowup.intentId = 'private-space-1-followup';
  privateFollowup.parentId = 'private-space-1';
  privateFollowup.payload = {
    content: 'visible only to named participants',
  };
  owner.post(privateFollowup);
  await new Promise((r) => setTimeout(r, 100));

  const peerMessages = await peer.scan('private-space-1');
  let denied = false;
  try {
    await outsider.scan('private-space-1');
  } catch (err) {
    denied = err instanceof Error && err.message.includes('Access denied');
  }

  const scanFailedEvent = latestMonitoringEvent('scan_failed');
  assert(
    peerMessages.some((message: any) => message.intentId === 'private-space-1-followup'),
    'Expected named peer to access a follow-up act in the shared private space',
  );
  assert(denied, 'Expected outsider scan to be denied');
  assert(
    scanFailedEvent
      && scanFailedEvent.stage === 'scan'
      && scanFailedEvent.spaceId === 'private-space-1',
    `Expected scan_failed monitoring event, got: ${JSON.stringify(scanFailedEvent)}`,
  );

  owner.disconnect();
  peer.disconnect();
  outsider.disconnect();
}

// ============ Teardown ============

await space.stop();
rmSync(testDir, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
console.log(`================================`);

if (fail > 0) process.exit(1);
