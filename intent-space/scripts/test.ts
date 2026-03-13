/**
 * Intent Space test suite.
 *
 * Starts the server in-process, runs tests against it
 * using the client library, then shuts down.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IntentSpace } from '../src/space.ts';
import { IntentSpaceClient } from '../src/client.ts';
import { createIntent, createPromise } from '@differ/itp/src/protocol.ts';

const testDir = mkdtempSync(join(tmpdir(), 'intent-space-test-'));
const socketPath = join(testDir, 'test.sock');
const dbPath = join(testDir, 'test.db');
const tlsKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCd1+WcGuhbc8kk
IhFf5uGBn13GjxD9EObc0o23IWEaUlMximOC299PYX2H4X3dSBEX+VxaeAKWJtAu
h8QMFkxJePn9jkjez+e+CWqB6onjbrshTzvZ75RXNtbXGNDRkpRmd3hz0oCv093j
HzxU9FBOQ2V7Rc54w9a8ngPoRJkicXafbIxZ7qYqKWOvcs0j8HjkriQenrulU3fD
T5nGMyL8hs6KnReHkJnn6V2Zb7dW1QMjpVKjMzL+lFygTOkRC39MOiZOOopaauuF
hS3joo5kCBh+aaIM65MZDWhKwS31JrJxPZkUNhk6gi2qGD7fK+bCef1mVI3qZBh5
77bglqH9AgMBAAECggEADKY0nGH7pPiOcfrY8ZqLD9w5o6PrdJxaI/ArszVVlspq
KFoyx1Xfe3kQmkcT0xvnYsh1AjsD2gyaOmBe8akHzAuJ3Sv94v0+URhoFKk7C6Lg
FDdJUJnGhYa7iNlQQrtAcUW5vW5tKaoM6hqitxwtI1h7VXmupjbriooPPhnhO8VD
vHbWa01v0HNCQ5cjwJLgKVvS44kxDB6zXzfBgPJByOKD0B96vUmZe7meWU8Nydaz
ZgFQmKd5GbDMdXRvJIYD42Iab5jtlEvL01t9nls+W82scqB9817ackjPo7sA3M11
i1DW2cX14Oosg9SIOkkKLqISs0t4xM/zbb+t4ZzxcQKBgQDUHKusu2o22kLYLVX3
w0po/pQHyredEtYcd+upuky4F+KKChSaB9VQKGvJQz6kc47JzPQeOCHwyaibMVkX
x14A9V5fR/MUspP2mLwMcq6fuxEK2L2leIXNCyaLOqYJ603Tj0yGZq1Ej3fJhqlo
zoubAf4fuEZJDlCyGCRDCuJ7lwKBgQC+gK2gJgfj0G7k3LTx24x8GP2h6msWg68Z
frX8fZTJG2ohqxJkT1yXSGfWGFEX6eEq4E8BoRJXysNKlbVlnaefznmd/0qFlXH0
YZunfitFFGTPoYgVWRYizmBu4GdYsNN98Wxirz/tfAypQZpP+x4H6sfXLdo1P3oj
nkerJOuRiwKBgQC/1c5OQpIlWfDqotYFZtJ9cwFeqrC1lrues7anop6QQMnaHpPT
WxJJlMUnGXImOX0CdiKy0gGgTEH5WgBByUXzh/b6JZBrP7ciZ7Brca0NOZqIPM4I
QaCBeXw6n6hbgDy7Afcr9uDuCPNFiEzfRS5t2reC6J5opFHHQJ5LJCUBsQKBgQCH
SQCEQ53ExgeKlcYWH9EDbAfqjXvhMEEP/PEmTtRzgPl80W0tOULK2IuM+hXUwq25
8jOJN6a8G+1WMTzx3eTlUw8BCgQVG40ifJK6fpoh45q37MGkT3Ct5RuMgeZCkMiQ
nvtWlZfzge3H4SPB+tZXzv5+LDzTJbIKS2QgAQcdgwKBgQDI8CDDYxXN35KwW6mJ
KF3MSyy340neoSEjewIaT0UETlV24DyiFpptfua3gb0A8ZFdYLGwhAm7A58YN+/1
am7SCmp4oDw7E5PmLjDzJ3dQvzIkxTNs1FaBdaejzsEalxeVkdFGwzVO8gpVkuq7
0pbr6cphOC+eI9fY3j19GI5+dw==
-----END PRIVATE KEY-----`;
const tlsCertPem = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUHK0pKbF9j1yakIgOvtcf65TAvGwwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDMxMzIxMDkyMVoXDTI2MDMx
NDIxMDkyMVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAndflnBroW3PJJCIRX+bhgZ9dxo8Q/RDm3NKNtyFhGlJT
MYpjgtvfT2F9h+F93UgRF/lcWngClibQLofEDBZMSXj5/Y5I3s/nvglqgeqJ4267
IU872e+UVzbW1xjQ0ZKUZnd4c9KAr9Pd4x88VPRQTkNle0XOeMPWvJ4D6ESZInF2
n2yMWe6mKiljr3LNI/B45K4kHp67pVN3w0+ZxjMi/IbOip0Xh5CZ5+ldmW+3VtUD
I6VSozMy/pRcoEzpEQt/TDomTjqKWmrrhYUt46KOZAgYfmmiDOuTGQ1oSsEt9Say
cT2ZFDYZOoItqhg+3yvmwnn9ZlSN6mQYee+24Jah/QIDAQABo1MwUTAdBgNVHQ4E
FgQUI6iM2AdKbScvYD9j8h/S3rQA7V4wHwYDVR0jBBgwFoAUI6iM2AdKbScvYD9j
8h/S3rQA7V4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAnYze
bnIKAsH01Zb4jQpprnd+jgwkxKD3X4ogwmqRzb5BEGgqmH2oN5kxVpplDsvBjyJf
jfduiOui0eSRwwxcztKXxE46/NnTE+MmaJT6BMQhDDw9wbYZaN+fU7bm/C26W5+Y
TnbXzYLoqnZ2rtRTMiQ15dxUXaBuo8NFoQ130cnkrvTexEEtx8DJvpjYoR1NQ2TY
fQ6js/xxIvLNAQZD18JTSIx7nToTuWyGthziQLinQy5DamrV3OAW8Bt2z+P5ryrR
OvfhxQYPlg8cmq9j8lnk8cgXPgt91ykQms7d2zODDeH7q+0QbPp4gU6DM60sQjwx
HcOtAk9lo9p0dk1wGg==
-----END CERTIFICATE-----`;

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

// ============ Setup ============

const space = new IntentSpace({
  socketPath,
  dbPath,
  agentId: 'intent-space',
  tcpPort: 0,
  tlsPort: 0,
  tlsKeyPem,
  tlsCertPem,
});
await space.start();
console.log(`Server listening on ${socketPath}`);

// ============ Tests ============

// --- Test 1: connect receives service intents ---
test('Connect receives service intents');
{
  const received: unknown[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await client.connect();
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
  await client.connect();
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
  await client.connect();
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
  await client.connect();
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
  await client.connect();
  await new Promise((r) => setTimeout(r, 50));

  const messages = await client.scan('test-1');
  const ids = messages.map((i) => i.intentId ?? i.promiseId);
  assert(ids.includes('test-2'), `Sub-space should have test-2, got: ${ids.join(', ')}`);
  client.disconnect();
}

// --- Test 6: scan with cursor ---
test('Scan with since cursor (past end)');
{
  const client = new IntentSpaceClient(socketPath);
  await client.connect();
  await new Promise((r) => setTimeout(r, 50));

  const messages = await client.scan('root', 9999);
  assert(messages.length === 0, `Expected empty, got ${messages.length}`);
  client.disconnect();
}

// --- Test 7: idempotent post ---
test('Idempotent post (duplicate intentId)');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('intent', (msg: unknown) => received.push(msg));
  await client.connect();
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

// --- Test 8: second client sees echo ---
test('Second client sees echoed intent');
{
  const client1 = new IntentSpaceClient(socketPath);
  const client2 = new IntentSpaceClient(socketPath);
  const received2: any[] = [];

  await client1.connect();
  await client2.connect();
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

// --- Test 9: projected PROMISE is accepted ---
test('Projected PROMISE is accepted');
{
  const received: any[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('message', (msg: unknown) => received.push(msg));
  await client.connect();
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

// --- Test 10: reject INTENT without intentId ---
test('Reject INTENT without intentId');
{
  const errors: string[] = [];
  const client = new IntentSpaceClient(socketPath);
  client.on('error', (err: Error) => errors.push(err.message));
  await client.connect();
  await new Promise((r) => setTimeout(r, 50));

  (client as any).writeLine({
    type: 'INTENT', senderId: 'agent-1', timestamp: Date.now(), payload: { content: 'oops' },
  });
  await new Promise((r) => setTimeout(r, 100));

  assert(errors.some((e) => e.includes('intentId')), `Expected intentId error, got: ${errors.join(', ')}`);
  client.disconnect();
}

// --- Test 11: fractal depth ---
test('Fractal: three levels deep');
{
  const client = new IntentSpaceClient(socketPath);
  await client.connect();
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

// --- Test 12: TCP transport ---
test('TCP: connect, post, scan');
{
  const tcpPort = space.tcpPort!;
  const client = new IntentSpaceClient({ host: '127.0.0.1', port: tcpPort });
  const received: any[] = [];
  client.on('intent', (msg: unknown) => received.push(msg));
  await client.connect();
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

// --- Test 13: TCP and Unix clients see each other ---
test('TCP and Unix clients see each other');
{
  const tcpClient = new IntentSpaceClient({ host: '127.0.0.1', port: space.tcpPort! });
  const unixClient = new IntentSpaceClient(socketPath);
  const tcpReceived: any[] = [];
  const unixReceived: any[] = [];

  await tcpClient.connect();
  await unixClient.connect();
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

  const projected = createPromise('agent-2', 'cross-test-1', 'I will do local work');
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

// --- Test 14: TLS transport ---
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
  await client.connect();
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

  await tlsClient.connect();
  await unixClient.connect();
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

// ============ Teardown ============

await space.stop();
rmSync(testDir, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
console.log(`================================`);

if (fail > 0) process.exit(1);
