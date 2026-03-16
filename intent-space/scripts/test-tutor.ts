import { generateKeyPairSync, createHash, createSign } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IntentSpace } from '../src/space.ts';
import { IntentSpaceClient } from '../src/client.ts';
import { StationTutor } from '../src/tutor.ts';
import {
  REGISTRATION_INTENT_CONTENT,
  REGISTRATION_SPACE_ID,
  RITUAL_GREETING_CONTENT,
  TUTORIAL_SPACE_ID,
} from '../src/station-contract.ts';
import {
  createAccept,
  createAssess,
  createIntent,
} from '@differ/itp/src/protocol.ts';

const testDir = mkdtempSync(join(tmpdir(), 'intent-space-tutor-test-'));
const socketPath = join(testDir, 'test.sock');
const dbPath = join(testDir, 'test.db');

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

const space = new IntentSpace({ socketPath, dbPath, agentId: 'intent-space' });
await space.start();
const tutor = new StationTutor({ target: socketPath, agentId: 'differ-tutor' });
await tutor.start();

const visitor = new IntentSpaceClient(socketPath);
await visitor.connect();
await new Promise((r) => setTimeout(r, 100));

test('Tutorial greeting is rejected before registration');
{
  const bypassGreeting = createIntent('bypass-agent', RITUAL_GREETING_CONTENT);
  bypassGreeting.intentId = 'tutorial-bypass-1';
  bypassGreeting.parentId = TUTORIAL_SPACE_ID;
  visitor.post(bypassGreeting);

  await new Promise((r) => setTimeout(r, 150));
  const tutorialMessages = await visitor.scan(TUTORIAL_SPACE_ID);
  const decline = tutorialMessages.find(
    (msg) => msg.type === 'DECLINE' && msg.intentId === bypassGreeting.intentId,
  );
  assert(Boolean(decline), 'Tutor should reject tutorial entry before successful registration');
  assert(
    decline?.payload.reasonCode === 'REGISTRATION_REQUIRED',
    `expected REGISTRATION_REQUIRED, got ${String(decline?.payload.reasonCode)}`,
  );
}

test('Malformed registration is declined with guidance');
{
  const malformedRegistration = createIntent('bad-agent', REGISTRATION_INTENT_CONTENT);
  malformedRegistration.intentId = 'registration-bad-1';
  malformedRegistration.parentId = REGISTRATION_SPACE_ID;
  visitor.post(malformedRegistration);

  await new Promise((r) => setTimeout(r, 150));
  const registrationMessages = await visitor.scan(REGISTRATION_SPACE_ID);
  const decline = registrationMessages.find(
    (msg) => msg.type === 'DECLINE' && msg.intentId === malformedRegistration.intentId,
  );
  assert(Boolean(decline), 'Tutor should decline malformed registration payloads');
  assert(
    decline?.payload.reasonCode === 'INVALID_REGISTRATION_PAYLOAD',
    `expected INVALID_REGISTRATION_PAYLOAD, got ${String(decline?.payload.reasonCode)}`,
  );
}

test('Registration challenge and ritual flow');
{
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const fingerprint = createHash('sha256').update(publicKeyPem).digest('base64');

  const registrationIntent = createIntent('visitor-agent', REGISTRATION_INTENT_CONTENT);
  registrationIntent.intentId = 'registration-test-1';
  registrationIntent.parentId = REGISTRATION_SPACE_ID;
  registrationIntent.payload.agentName = 'visitor-agent';
  registrationIntent.payload.publicKeyPem = publicKeyPem;
  registrationIntent.payload.fingerprint = fingerprint;
  registrationIntent.payload.capabilities = ['scan', 'post', 'enter', 'sign-challenge'];
  registrationIntent.payload.academyVersion = 'phase1';
  visitor.post(registrationIntent);

  await new Promise((r) => setTimeout(r, 150));
  const registrationMessages = await visitor.scan(registrationIntent.intentId!);
  const challenges = registrationMessages.filter(
    (msg) => msg.type === 'INTENT' && typeof msg.payload.challenge === 'string',
  );
  const challenge = challenges[0];
  assert(Boolean(challenge), 'Tutor should post a registration challenge');
  assert(challenges.length === 1, `expected exactly one challenge, got ${challenges.length}`);

  const sign = createSign('RSA-SHA256');
  sign.update(String(challenge?.payload.challenge));
  sign.end();
  const signatureBase64 = sign.sign(privateKeyPem).toString('base64');

  const badResponse = createIntent('visitor-agent', 'Signed challenge response');
  badResponse.intentId = 'registration-test-1-bad-response';
  badResponse.parentId = registrationIntent.intentId!;
  badResponse.payload.challenge = challenge?.payload.challenge;
  badResponse.payload.signatureBase64 = 'not-a-valid-signature';
  visitor.post(badResponse);

  await new Promise((r) => setTimeout(r, 150));
  const failedVerify = await visitor.scan(registrationIntent.intentId!);
  const badDecline = failedVerify.find(
    (msg) => msg.type === 'DECLINE' && msg.intentId === badResponse.intentId,
  );
  assert(Boolean(badDecline), 'Tutor should decline invalid challenge responses');
  assert(
    badDecline?.payload.reasonCode === 'SIGNATURE_VERIFICATION_FAILED',
    `expected SIGNATURE_VERIFICATION_FAILED, got ${String(badDecline?.payload.reasonCode)}`,
  );

  const signedResponse = createIntent('visitor-agent', 'Signed challenge response');
  signedResponse.intentId = 'registration-test-1-response';
  signedResponse.parentId = registrationIntent.intentId!;
  signedResponse.payload.challenge = challenge?.payload.challenge;
  signedResponse.payload.signatureBase64 = signatureBase64;
  visitor.post(signedResponse);

  await new Promise((r) => setTimeout(r, 150));
  const postVerify = await visitor.scan(registrationIntent.intentId!);
  const ack = postVerify.find(
    (msg) => msg.type === 'INTENT'
      && typeof msg.payload.ritualGreeting === 'string'
      && msg.payload.tutorialSpaceId === TUTORIAL_SPACE_ID,
  );
  assert(Boolean(ack), 'Tutor should acknowledge successful registration');

  const greeting = createIntent('visitor-agent', RITUAL_GREETING_CONTENT);
  greeting.intentId = 'tutorial-greeting-1';
  greeting.parentId = TUTORIAL_SPACE_ID;
  visitor.post(greeting);

  await new Promise((r) => setTimeout(r, 150));
  const tutorialRootMessages = await visitor.scan(TUTORIAL_SPACE_ID);
  const rootDecline = tutorialRootMessages.find(
    (msg) => msg.type === 'DECLINE' && msg.intentId === greeting.intentId,
  );
  assert(!rootDecline, 'Tutor should not decline the greeting itself for a verified participant');

  const tutorialSubspace = await visitor.scan(greeting.intentId!);
  const instruction = tutorialSubspace.find((msg) => msg.type === 'INTENT' && msg.senderId === 'differ-tutor');
  assert(Boolean(instruction), 'Tutor should post subspace instructions after greeting');

  const wrongIntent = createIntent('visitor-agent', 'bad tutorial ask');
  wrongIntent.intentId = 'tutorial-wrong-1';
  wrongIntent.parentId = greeting.intentId!;
  visitor.post(wrongIntent);

  await new Promise((r) => setTimeout(r, 150));
  const afterWrong = await visitor.scan(greeting.intentId!);
  const decline = afterWrong.find((msg) => msg.type === 'DECLINE');
  assert(Boolean(decline), 'Tutor should deliberately decline the first tutorial move');
  assert(
    decline?.payload.reasonCode === 'DOJO_DELIBERATE_CORRECTION',
    `expected DOJO_DELIBERATE_CORRECTION, got ${String(decline?.payload.reasonCode)}`,
  );

  const correctedIntent = createIntent('visitor-agent', 'clear tutorial ask');
  correctedIntent.intentId = 'tutorial-correct-1';
  correctedIntent.parentId = greeting.intentId!;
  visitor.post(correctedIntent);

  await new Promise((r) => setTimeout(r, 150));
  const afterRetry = await visitor.scan(greeting.intentId!);
  const promise = afterRetry.find((msg) => msg.type === 'PROMISE');
  assert(Boolean(promise?.promiseId), 'Tutor should promise after the corrected tutorial move');

  const badAccept = createAccept('visitor-agent', promise!.intentId!);
  badAccept.parentId = greeting.intentId!;
  visitor.post(badAccept);

  await new Promise((r) => setTimeout(r, 150));
  const afterBadAccept = await visitor.scan(greeting.intentId!);
  const badAcceptDecline = afterBadAccept.find(
    (msg) => msg.type === 'DECLINE' && msg.payload.reasonCode === 'MISSING_OR_WRONG_PROMISE_ID',
  );
  assert(Boolean(badAcceptDecline), 'Tutor should decline ACCEPT with a wrong promiseId');

  const accept = createAccept('visitor-agent', promise!.promiseId!);
  accept.parentId = greeting.intentId!;
  visitor.post(accept);

  await new Promise((r) => setTimeout(r, 150));
  const afterAccept = await visitor.scan(greeting.intentId!);
  const complete = afterAccept.find((msg) => msg.type === 'COMPLETE' && msg.promiseId === promise!.promiseId);
  assert(Boolean(complete), 'Tutor should complete after visitor ACCEPTs');

  const badAssess = createAssess('visitor-agent', promise!.intentId!, 'FULFILLED');
  badAssess.parentId = greeting.intentId!;
  visitor.post(badAssess);

  await new Promise((r) => setTimeout(r, 150));
  const afterBadAssess = await visitor.scan(greeting.intentId!);
  const badAssessDecline = afterBadAssess.find(
    (msg) => msg.type === 'DECLINE' && msg.payload.reasonCode === 'MISSING_OR_WRONG_PROMISE_ID',
  );
  assert(Boolean(badAssessDecline), 'Tutor should decline ASSESS with a wrong promiseId');

  const assess = createAssess('visitor-agent', promise!.promiseId!, 'FULFILLED');
  assess.parentId = greeting.intentId!;
  visitor.post(assess);

  await new Promise((r) => setTimeout(r, 150));
  const finalMessages = await visitor.scan(greeting.intentId!);
  const finalAck = finalMessages.find(
    (msg) => msg.type === 'INTENT' && msg.payload.content === 'Tutorial complete. You can now proceed beyond the ritual.',
  );
  assert(Boolean(finalAck), 'Tutor should acknowledge successful tutorial completion');
  assert(
    finalAck?.payload.dojoReward?.type === 'matrix-dojo-token',
    `expected matrix-dojo-token reward, got ${String(finalAck?.payload.dojoReward?.type)}`,
  );
  assert(
    typeof finalAck?.payload.dojoReward?.art === 'string'
      && finalAck.payload.dojoReward.art.includes('[:: dojo signal acquired ::]'),
    'Tutor should include the dojo reward ascii token',
  );
  assert(
    finalAck?.payload.dojoCertificate?.status === 'FULFILLED',
    `expected FULFILLED dojo certificate, got ${String(finalAck?.payload.dojoCertificate?.status)}`,
  );

  const stateCounts = tutor.getStateCounts();
  assert(stateCounts.registrations === 0, 'Registration session should be cleaned up after successful verification');
  assert(stateCounts.tutorials === 0, 'Tutorial session should be cleaned up after successful completion');
}

visitor.disconnect();
tutor.stop();
await space.stop();
rmSync(testDir, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
console.log(`================================`);

if (fail > 0) process.exit(1);
