import { mkdtempSync, rmSync } from 'fs';
import type { ChildProcess } from 'child_process';
import { connect as netConnect } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import { HEADWATERS_COMMONS_SPACE_ID, HEADWATERS_STEWARD_ID } from '../src/contract.ts';
import { enrollAgent } from '../src/agent-enrollment.ts';
import { createHeadwatersHttpServer } from '../src/server.ts';
import { HeadwatersService } from '../src/service.ts';
import { spawnHeadwatersStewardProcess } from '../src/steward-process.ts';

let pass = 0;
let fail = 0;
let step = 0;

function test(name: string) {
  step += 1;
  process.stdout.write(`\n=== Test ${step}: ${name} ===\n`);
}

function assert(cond: boolean, msg: string) {
  if (cond) {
    pass += 1;
    console.log('  OK');
  } else {
    fail += 1;
    console.log(`  FAIL: ${msg}`);
  }
}

async function sendRawFrame(host: string, port: number, frame: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, host);
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout waiting for raw response'));
    }, 5000);

    socket.on('connect', () => {
      socket.write(JSON.stringify(frame) + '\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.type === 'ERROR') {
          clearTimeout(timer);
          socket.destroy();
          resolve(msg);
          return;
        }
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForMessage(
  client: IntentSpaceClient,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('timeout waiting for message'));
    }, timeoutMs);
    const onMessage = (message: Record<string, unknown>) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(message);
    };
    client.on('message', onMessage);
  });
}

async function main(): Promise<void> {
  const host = '127.0.0.1';
  const httpPort = 18090;
  const commonsPort = 14010;
  const authSecret = 'headwaters-test-secret';
  const rootDir = process.cwd();
  const dataDir = mkdtempSync(join(tmpdir(), 'headwaters-test-'));

  process.env.HEADWATERS_ORIGIN = `http://${host}:${httpPort}`;
  process.env.HEADWATERS_COMMONS_ENDPOINT = `tcp://${host}:${commonsPort}`;
  process.env.HEADWATERS_COMMONS_AUDIENCE = 'intent-space://headwaters/test-commons';

  process.env.HEADWATERS_MAX_SPACES = '1';

  let service = new HeadwatersService({
    dataDir,
    host,
    commonsPort,
    authSecret,
  });
  const server = createHeadwatersHttpServer({
    host,
    port: httpPort,
    rootDir,
    dataDir,
    authSecret,
  });
  let steward: ChildProcess | null = null;

  try {
    await service.start();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(httpPort, host, () => resolve());
    });
    steward = spawnHeadwatersStewardProcess({
      cwd: process.cwd(),
      host,
      commonsPort,
      dataDir,
      authSecret,
      stdio: 'pipe',
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    test('agent can provision a home space through PROMISE, ACCEPT, COMPLETE, and ASSESS');
    {
      const enrollment = await enrollAgent(`http://${host}:${httpPort}`, 'agent-alpha');
      const otherEnrollment = await enrollAgent(`http://${host}:${httpPort}`, 'agent-beta');
      const commonsClient = new IntentSpaceClient({ host, port: commonsPort });
      const otherClient = new IntentSpaceClient({ host, port: commonsPort });
      await commonsClient.connect();
      await commonsClient.authenticate(enrollment.stationToken, enrollment.buildProof);
      await otherClient.connect();
      await otherClient.authenticate(otherEnrollment.stationToken, otherEnrollment.buildProof);

      const request = {
        type: 'INTENT' as const,
        intentId: `intent-${Date.now()}`,
        parentId: HEADWATERS_COMMONS_SPACE_ID,
        senderId: enrollment.senderId,
        timestamp: Date.now(),
        payload: {
          content: 'Please create my home space.',
          requestedSpace: { kind: 'home' },
          spacePolicy: {
            visibility: 'private',
            participants: [enrollment.senderId, HEADWATERS_STEWARD_ID],
          },
        },
      };
      commonsClient.post(request);
      const promise = await waitForMessage(
        commonsClient,
        (msg) => msg.type === 'PROMISE' && msg.parentId === request.intentId && msg.senderId === HEADWATERS_STEWARD_ID,
      );
      assert(promise.type === 'PROMISE', `expected steward PROMISE, got ${String(promise.type)}`);
      assert(typeof promise.promiseId === 'string', 'expected promiseId on steward promise');

      let denied = false;
      try {
        await otherClient.scan(request.intentId, 0);
      } catch (error) {
        denied = error instanceof Error && error.message.includes(`Access denied to space ${request.intentId}`);
      }
      assert(denied, 'expected other participant to be denied from private request subspace');

      commonsClient.post({
        type: 'ACCEPT',
        promiseId: promise.promiseId as string,
        parentId: request.intentId,
        senderId: enrollment.senderId,
        timestamp: Date.now(),
        payload: {},
      });

      const reply = await waitForMessage(
        commonsClient,
        (msg) => (msg.type === 'COMPLETE' || msg.type === 'DECLINE') && msg.parentId === request.intentId && msg.senderId === HEADWATERS_STEWARD_ID,
      );
      const payload = reply.payload as Record<string, unknown>;
      assert(reply.type === 'COMPLETE', `expected steward COMPLETE, got ${reply.type} (${JSON.stringify(payload)})`);
      if (reply.type !== 'COMPLETE') {
        commonsClient.disconnect();
        otherClient.disconnect();
        return;
      }
      assert(payload.headwatersStatus === 'SPACE_CREATED', `expected SPACE_CREATED, got ${String(payload.headwatersStatus)}`);
      assert(typeof payload.stationEndpoint === 'string', 'expected stationEndpoint in steward reply');
      assert(typeof payload.stationAudience === 'string', 'expected stationAudience in steward reply');
      assert(typeof payload.stationToken === 'string', 'expected stationToken in steward reply');
      assert(
        payload.stationEndpoint === `tcp://${host}:${commonsPort}`,
        `expected shared station endpoint, got ${String(payload.stationEndpoint)}`,
      );

      commonsClient.post({
        type: 'ASSESS',
        promiseId: promise.promiseId as string,
        parentId: request.intentId,
        senderId: enrollment.senderId,
        timestamp: Date.now(),
        payload: { assessment: 'FULFILLED' },
      });

      const homeUrl = new URL(String(payload.stationEndpoint));
      const homeClient = new IntentSpaceClient({ host: homeUrl.hostname, port: Number(homeUrl.port) });
      await homeClient.connect();
      await homeClient.authenticate(
        String(payload.stationToken),
        (action, request) => enrollment.buildProofFor(
          String(payload.stationToken),
          String(payload.stationAudience),
          action,
          request,
        ),
      );

      const homeIntent = {
        type: 'INTENT' as const,
        intentId: `intent-home-${Date.now()}`,
        parentId: 'root',
        senderId: enrollment.senderId,
        timestamp: Date.now(),
        payload: {
          content: 'hello from my home space',
        },
      };
      homeClient.post(homeIntent);
      const messages = await homeClient.scan('root', 0);
      assert(messages.some((message) => message.intentId === homeIntent.intentId), 'expected posted intent in home space scan');

      homeClient.disconnect();

      steward?.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 200));
      await service.stop();

      service = new HeadwatersService({
        dataDir,
        host,
        commonsPort,
        authSecret,
      });
      await service.start();
      steward = spawnHeadwatersStewardProcess({
        cwd: process.cwd(),
        host,
        commonsPort,
        dataDir,
        authSecret,
        stdio: 'pipe',
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const recoveredHomeClient = new IntentSpaceClient({ host, port: commonsPort });
      await recoveredHomeClient.connect();
      await recoveredHomeClient.authenticate(
        String(payload.stationToken),
        (action, request) => enrollment.buildProofFor(
          String(payload.stationToken),
          String(payload.stationAudience),
          action,
          request,
        ),
      );
      const recoveredMessages = await recoveredHomeClient.scan('root', 0);
      assert(
        recoveredMessages.some((message) => message.intentId === homeIntent.intentId),
        'expected home space messages to survive service restart',
      );
      recoveredHomeClient.disconnect();

      const postRestartOtherClient = new IntentSpaceClient({ host, port: commonsPort });
      await postRestartOtherClient.connect();
      await postRestartOtherClient.authenticate(otherEnrollment.stationToken, otherEnrollment.buildProof);

      const secondRequest = {
        type: 'INTENT' as const,
        intentId: `intent-${Date.now()}-beta`,
        parentId: HEADWATERS_COMMONS_SPACE_ID,
        senderId: otherEnrollment.senderId,
        timestamp: Date.now(),
        payload: {
          content: 'Please create my home space too.',
          requestedSpace: { kind: 'home' },
          spacePolicy: {
            visibility: 'private',
            participants: [otherEnrollment.senderId, HEADWATERS_STEWARD_ID],
          },
        },
      };
      postRestartOtherClient.post(secondRequest);
      const secondPromise = await waitForMessage(
        postRestartOtherClient,
        (msg) => msg.type === 'PROMISE' && msg.parentId === secondRequest.intentId && msg.senderId === HEADWATERS_STEWARD_ID,
      );
      postRestartOtherClient.post({
        type: 'ACCEPT',
        promiseId: secondPromise.promiseId as string,
        parentId: secondRequest.intentId,
        senderId: otherEnrollment.senderId,
        timestamp: Date.now(),
        payload: {},
      });
      const secondReply = await waitForMessage(
        postRestartOtherClient,
        (msg) => (msg.type === 'COMPLETE' || msg.type === 'DECLINE') && msg.parentId === secondRequest.intentId && msg.senderId === HEADWATERS_STEWARD_ID,
      );
      assert(secondReply.type === 'DECLINE', `expected DECLINE when capacity reached, got ${String(secondReply.type)}`);
      postRestartOtherClient.disconnect();

      commonsClient.disconnect();
      otherClient.disconnect();
    }

    test('public discovery docs expose canonical pack and downloadable runtime files');
    {
      const rootHtml = await fetch(`http://${host}:${httpPort}/`).then((response) => response.text());
      const llmsTxt = await fetch(`http://${host}:${httpPort}/llms.txt`).then((response) => response.text());
      const agentCard = await fetch(`http://${host}:${httpPort}/.well-known/agent-card.json`).then((response) => response.json() as Promise<Record<string, unknown>>);
      const setupDoc = await fetch(`http://${host}:${httpPort}/agent-setup.md`).then((response) => response.text());
      const runtime = await fetch(`http://${host}:${httpPort}/skill-pack/sdk/promise_runtime.py`).then((response) => response.text());
      const sdk = await fetch(`http://${host}:${httpPort}/skill-pack/sdk/intent_space_sdk.py`).then((response) => response.text());

      assert(rootHtml.includes('claude-code-marketplace/tree/main/plugins/intent-space-agent-pack'), 'expected root overview to point to canonical pack');
      assert(llmsTxt.includes('/.well-known/welcome.md'), 'expected llms.txt to include welcome discovery');
      assert(llmsTxt.includes('intent-space://headwaters/test-commons'), 'expected llms.txt to include commons audience');
      assert(agentCard.canonicalSkillPackUrl === 'https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack', `unexpected canonical pack url ${String(agentCard.canonicalSkillPackUrl)}`);
      assert(setupDoc.includes('/skill-pack/sdk/promise_runtime.py'), 'expected setup doc to reference public runtime URL');
      assert(setupDoc.includes('YOUR_HEADWATERS_HOST:YOUR_HEADWATERS_PORT'), 'expected setup doc to use an explicit placeholder base URL');
      assert(!setupDoc.includes('/skill-pack/references/headwaters-agent.py'), 'expected setup doc not to depend on a public reference agent');
      assert(runtime.includes('class PromiseRuntimeSession'), 'expected public runtime file to be served');
      assert(sdk.includes('class StationClient'), 'expected public SDK file to be served');
    }

    test('malformed AUTH returns a protocol-grade field error');
    {
      const error = await sendRawFrame(host, commonsPort, {
        type: 'AUTH',
        proof: 'not-a-jwt',
      });
      assert(
        error.message === 'Authentication failed: AUTH.stationToken must be a string JWT',
        `expected missing stationToken error, got ${String(error.message)}`,
      );
    }
  } finally {
    if (steward) {
      steward.kill('SIGTERM');
    }
    await service.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(`\n================================`);
  console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
  console.log(`================================`);
  if (fail > 0) process.exit(1);
}

void main();
