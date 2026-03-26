import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IntentSpace } from '../../intent-space/src/space.ts';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import { StationTutor } from '../src/tutor.ts';
import { RITUAL_GREETING_CONTENT, TUTORIAL_SPACE_ID } from '../src/station-contract.ts';
import { createAccept, createAssess, createIntent } from '../../itp/src/protocol.ts';
import { createAcademyServer } from '../src/server.ts';
import { enrollAgent } from '../src/agent-enrollment.ts';

const testDir = mkdtempSync(join(tmpdir(), 'intent-space-tutor-test-'));
const socketPath = join(testDir, 'test.sock');
const dbPath = join(testDir, 'test.db');
const academyPort = 18081;
const stationPort = 4101;
const academyOrigin = `http://127.0.0.1:${academyPort}`;

process.env.ACADEMY_ORIGIN = academyOrigin;
process.env.ACADEMY_STATION_ENDPOINT = `tcp://127.0.0.1:${stationPort}`;
process.env.ACADEMY_STATION_AUDIENCE = 'intent-space://academy-test/station';
process.env.INTENT_SPACE_AUTH_SECRET = 'test-station-secret';

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

async function waitForSpaceMatch(
  client: IntentSpaceClient,
  spaceId: string,
  predicate: (message: MessageEcho) => boolean,
  timeoutMs = 3000,
): Promise<MessageEcho | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await client.scan(spaceId);
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

async function createVisitor(handle: string): Promise<IntentSpaceClient> {
  const enrollment = await enrollAgent(academyOrigin, handle);
  const client = new IntentSpaceClient({ host: '127.0.0.1', port: stationPort });
  await client.connect();
  await client.authenticate(enrollment.stationToken, enrollment.buildProof);
  (client as IntentSpaceClient & { principalId?: string }).principalId = enrollment.senderId;
  await new Promise((r) => setTimeout(r, 100));
  return client;
}

async function main(): Promise<void> {
  const academyServer = createAcademyServer({
    host: '127.0.0.1',
    port: academyPort,
    rootDir: process.cwd(),
    dataDir: testDir,
    authSecret: process.env.INTENT_SPACE_AUTH_SECRET!,
  });
  await new Promise<void>((resolve) => academyServer.listen(academyPort, '127.0.0.1', () => resolve()));

  const space = new IntentSpace({ socketPath, dbPath, agentId: 'intent-space', tcpPort: stationPort, tcpHost: '127.0.0.1' });
  await space.start();
  const tutor = new StationTutor({
    target: { host: '127.0.0.1', port: stationPort, tls: false },
    academyUrl: academyOrigin,
    agentId: 'differ-tutor',
  });
  await tutor.start();

  test('academy discovery surfaces expose canonical pack and live endpoints');
  {
    const rootHtml = await fetch(`${academyOrigin}/`).then((response) => response.text());
    const llmsTxt = await fetch(`${academyOrigin}/llms.txt`).then((response) => response.text());
    const agentCard = await fetch(`${academyOrigin}/.well-known/agent-card.json`).then((response) => response.json() as Promise<Record<string, unknown>>);

    assert(rootHtml.includes('claude-code-marketplace/tree/main/plugins/intent-space-agent-pack'), 'expected root overview to point to canonical pack');
    assert(llmsTxt.includes('/.well-known/welcome.md'), 'expected llms.txt to include welcome discovery');
    assert(llmsTxt.includes('tcp://127.0.0.1:4101'), 'expected llms.txt to include live station endpoint');
    assert(agentCard.canonicalSkillPackUrl === 'https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack', `unexpected canonical pack url ${String(agentCard.canonicalSkillPackUrl)}`);
  }

  const visitor = await createVisitor('visitor-agent');

  test('Invalid tutorial greeting is declined with guidance');
  {
    const visitorId = (visitor as IntentSpaceClient & { principalId?: string }).principalId ?? 'visitor-agent';
    const bypassGreeting = createIntent(visitorId, 'wrong greeting');
    bypassGreeting.intentId = 'tutorial-bypass-1';
    bypassGreeting.parentId = TUTORIAL_SPACE_ID;
    visitor.post(bypassGreeting);

    const decline = await waitForSpaceMatch(
      visitor,
      TUTORIAL_SPACE_ID,
      (msg) => msg.type === 'DECLINE' && msg.intentId === bypassGreeting.intentId,
    );
    assert(Boolean(decline), 'Tutor should reject an invalid tutorial greeting');
    assert(
      decline?.payload.reasonCode === 'INVALID_TUTORIAL_GREETING',
      `expected INVALID_TUTORIAL_GREETING, got ${String(decline?.payload.reasonCode)}`,
    );
  }

  test('Authenticated tutorial ritual flow works end to end');
  {
    const visitorId = (visitor as IntentSpaceClient & { principalId?: string }).principalId ?? 'visitor-agent';
    const greeting = createIntent(visitorId, RITUAL_GREETING_CONTENT);
    greeting.intentId = 'tutorial-greeting-1';
    greeting.parentId = TUTORIAL_SPACE_ID;
    visitor.post(greeting);

    const instruction = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'INTENT' && msg.senderId !== visitorId,
    );
    assert(Boolean(instruction), 'Tutor should post subspace instructions after greeting');

    const wrongIntent = createIntent(visitorId, 'bad tutorial ask');
    wrongIntent.intentId = 'tutorial-wrong-1';
    wrongIntent.parentId = greeting.intentId!;
    visitor.post(wrongIntent);

    const decline = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'DECLINE',
    );
    assert(Boolean(decline), 'Tutor should deliberately decline the first tutorial move');
    assert(
      decline?.payload.reasonCode === 'DOJO_DELIBERATE_CORRECTION',
      `expected DOJO_DELIBERATE_CORRECTION, got ${String(decline?.payload.reasonCode)}`,
    );

    const correctedIntent = createIntent(visitorId, 'clear tutorial ask');
    correctedIntent.intentId = 'tutorial-correct-1';
    correctedIntent.parentId = greeting.intentId!;
    visitor.post(correctedIntent);

    const promise = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'PROMISE',
    );
    assert(Boolean(promise?.promiseId), 'Tutor should promise after the corrected tutorial move');
    if (!promise?.promiseId) {
      throw new Error('Tutor did not issue a promise');
    }

    const badAccept = createAccept(visitorId, promise!.intentId!);
    badAccept.parentId = greeting.intentId!;
    visitor.post(badAccept);

    const badAcceptDecline = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'DECLINE' && msg.payload.reasonCode === 'MISSING_OR_WRONG_PROMISE_ID',
    );
    assert(Boolean(badAcceptDecline), 'Tutor should decline ACCEPT with a wrong promiseId');

    const accept = createAccept(visitorId, promise!.promiseId!);
    accept.parentId = greeting.intentId!;
    visitor.post(accept);

    const complete = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'COMPLETE' && msg.promiseId === promise!.promiseId,
    );
    assert(Boolean(complete), 'Tutor should complete after visitor ACCEPTs');

    const badAssess = createAssess(visitorId, promise!.intentId!, 'FULFILLED');
    badAssess.parentId = greeting.intentId!;
    visitor.post(badAssess);

    const badAssessDecline = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'DECLINE' && msg.payload.reasonCode === 'MISSING_OR_WRONG_PROMISE_ID',
    );
    assert(Boolean(badAssessDecline), 'Tutor should decline ASSESS with a wrong promiseId');

    const assess = createAssess(visitorId, promise!.promiseId!, 'FULFILLED');
    assess.parentId = greeting.intentId!;
    visitor.post(assess);

    const finalAck = await waitForSpaceMatch(
      visitor,
      greeting.intentId!,
      (msg) => msg.type === 'INTENT' && msg.payload.content === 'Tutorial complete. You can now proceed beyond the ritual.',
    );
    assert(Boolean(finalAck), 'Tutor should acknowledge successful tutorial completion');
    assert(
      finalAck?.payload.dojoReward?.type === 'matrix-dojo-token',
      `expected matrix-dojo-token reward, got ${String(finalAck?.payload.dojoReward?.type)}`,
    );

    const stateCounts = tutor.getStateCounts();
    assert(stateCounts.tutorials === 0, 'Tutorial session should be cleaned up after successful completion');
  }

  visitor.disconnect();
  tutor.stop();
  await space.stop();
  await new Promise<void>((resolve) => academyServer.close(() => resolve()));
  rmSync(testDir, { recursive: true, force: true });

  console.log(`\n================================`);
  console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
  console.log(`================================`);
  if (fail > 0) process.exit(1);
}

main();
