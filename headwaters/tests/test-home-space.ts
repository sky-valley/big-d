import { mkdtempSync, rmSync } from 'fs';
import { connect as netConnect } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import { HEADWATERS_COMMONS_SPACE_ID, CREATE_HOME_SPACE_ACTION } from '../src/contract.ts';
import { enrollAgent } from '../src/agent-enrollment.ts';
import { createHeadwatersHttpServer } from '../src/server.ts';
import { HeadwatersService } from '../src/service.ts';

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

  const service = new HeadwatersService({
    dataDir,
    host,
    commonsPort,
    authSecret,
  });
  const server = createHeadwatersHttpServer({
    host,
    port: httpPort,
    rootDir,
    authSecret,
  });

  try {
    await service.start();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(httpPort, host, () => resolve());
    });

    test('agent can request a home space in commons and use the spawned space directly');
    {
      const enrollment = await enrollAgent(`http://${host}:${httpPort}`, 'agent-alpha');
      const commonsClient = new IntentSpaceClient({ host, port: commonsPort });
      await commonsClient.connect();
      await commonsClient.authenticate(enrollment.stationToken, enrollment.buildProof);

      const request = {
        type: 'INTENT' as const,
        intentId: `intent-${Date.now()}`,
        parentId: HEADWATERS_COMMONS_SPACE_ID,
        senderId: enrollment.senderId,
        timestamp: Date.now(),
        payload: {
          content: 'Please create my home space.',
          headwatersAction: CREATE_HOME_SPACE_ACTION,
        },
      };
      const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for steward reply')), 5000);
        commonsClient.on('message', (msg) => {
          if (msg.parentId === request.intentId && msg.senderId === 'headwaters-steward') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
        commonsClient.post(request);
      });

      const payload = reply.payload as Record<string, unknown>;
      assert(reply.type === 'INTENT', `expected steward INTENT reply, got ${reply.type} (${JSON.stringify(payload)})`);
      if (reply.type !== 'INTENT') {
        commonsClient.disconnect();
        return;
      }
      assert(payload.headwatersStatus === 'SPACE_CREATED', `expected SPACE_CREATED, got ${String(payload.headwatersStatus)}`);
      assert(typeof payload.stationEndpoint === 'string', 'expected stationEndpoint in steward reply');
      assert(typeof payload.stationAudience === 'string', 'expected stationAudience in steward reply');
      assert(typeof payload.stationToken === 'string', 'expected stationToken in steward reply');

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
      commonsClient.disconnect();
    }

    test('public setup doc exposes downloadable runtime files');
    {
      const setupDoc = await fetch(`http://${host}:${httpPort}/agent-setup.md`).then((response) => response.text());
      const runtime = await fetch(`http://${host}:${httpPort}/skill-pack/sdk/promise_runtime.py`).then((response) => response.text());
      const sdk = await fetch(`http://${host}:${httpPort}/skill-pack/sdk/intent_space_sdk.py`).then((response) => response.text());

      assert(setupDoc.includes('/skill-pack/sdk/promise_runtime.py'), 'expected setup doc to reference public runtime URL');
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
