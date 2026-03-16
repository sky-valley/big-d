import { createHash, createSign, generateKeyPairSync, randomUUID } from 'crypto';
import {
  createAccept,
  createAssess,
  createIntent,
} from '../../itp/src/protocol.ts';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import type { ClientTarget, StoredMessage, TlsClientTarget } from '../../intent-space/src/types.ts';
import {
  REGISTRATION_INTENT_CONTENT,
  REGISTRATION_SPACE_ID,
  RITUAL_GREETING_CONTENT,
  TUTORIAL_SPACE_ID,
} from '../src/station-contract.ts';

interface Options {
  target: ClientTarget;
  agentId: string;
  agentName: string;
}

function parseArgs(argv: string[]): Options {
  const opts = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts.set(key, 'true');
      continue;
    }
    opts.set(key, next);
    i += 1;
  }

  const agentId = opts.get('agent-id') ?? `dojo-agent-${randomUUID().slice(0, 8)}`;
  const agentName = opts.get('agent-name') ?? agentId;

  const socketPath = opts.get('socket');
  if (socketPath) {
    return { target: socketPath, agentId, agentName };
  }

  const host = opts.get('host') ?? '127.0.0.1';
  const port = Number(opts.get('port') ?? '4000');
  if (Number.isNaN(port)) throw new Error('Invalid --port value');

  if (opts.get('tls') === 'true') {
    const target: TlsClientTarget = {
      tls: true,
      host,
      port,
      rejectUnauthorized: opts.get('reject-unauthorized') !== 'false',
    };
    return { target, agentId, agentName };
  }

  return { target: { host, port }, agentId, agentName };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMessage(
  client: IntentSpaceClient,
  spaceId: string,
  predicate: (msg: StoredMessage) => boolean,
  description: string,
  timeoutMs = 10_000,
): Promise<StoredMessage> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const messages = await client.scan(spaceId);
    const found = messages.find(predicate);
    if (found) return found;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${description} in space ${spaceId}`);
}

function logStep(step: string, detail?: string): void {
  console.log(`dojo-agent: ${step}${detail ? ` ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const client = new IntentSpaceClient(options.target);

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const fingerprint = createHash('sha256').update(publicKeyPem).digest('base64');

  try {
    await client.connect();
    logStep('connected', `(agent=${options.agentId})`);

    const registrationIntent = createIntent(options.agentId, REGISTRATION_INTENT_CONTENT);
    registrationIntent.intentId = `registration-${randomUUID()}`;
    registrationIntent.parentId = REGISTRATION_SPACE_ID;
    registrationIntent.payload.agentName = options.agentName;
    registrationIntent.payload.publicKeyPem = publicKeyPem;
    registrationIntent.payload.fingerprint = fingerprint;
    registrationIntent.payload.capabilities = ['scan', 'post', 'enter', 'sign-challenge'];
    registrationIntent.payload.academyVersion = 'phase1';

    client.post(registrationIntent);
    logStep('posted registration intent', registrationIntent.intentId);

    const challenge = await waitForMessage(
      client,
      registrationIntent.intentId,
      (msg) => msg.type === 'INTENT' && typeof msg.payload.challenge === 'string',
      'registration challenge',
    );
    logStep('received challenge');

    const sign = createSign('RSA-SHA256');
    sign.update(String(challenge.payload.challenge));
    sign.end();
    const signatureBase64 = sign.sign(privateKeyPem).toString('base64');

    const signedResponse = createIntent(options.agentId, 'Signed challenge response');
    signedResponse.intentId = `registration-response-${randomUUID()}`;
    signedResponse.parentId = registrationIntent.intentId;
    signedResponse.payload.challenge = challenge.payload.challenge;
    signedResponse.payload.signatureBase64 = signatureBase64;
    client.post(signedResponse);
    logStep('posted signed challenge response');

    await waitForMessage(
      client,
      registrationIntent.intentId,
      (msg) => msg.type === 'INTENT'
        && msg.senderId === 'differ-tutor'
        && msg.payload.tutorialSpaceId === TUTORIAL_SPACE_ID
        && msg.payload.ritualGreeting === RITUAL_GREETING_CONTENT,
      'registration acknowledgement',
    );
    logStep('registration acknowledged');

    const greeting = createIntent(options.agentId, RITUAL_GREETING_CONTENT);
    greeting.intentId = `tutorial-greeting-${randomUUID()}`;
    greeting.parentId = TUTORIAL_SPACE_ID;
    client.post(greeting);
    logStep('posted ritual greeting', greeting.intentId);

    await waitForMessage(
      client,
      greeting.intentId,
      (msg) => msg.type === 'INTENT'
        && msg.senderId === 'differ-tutor'
        && msg.payload.nextStep === 'enter-subspace',
      'tutorial instruction',
    );
    logStep('entered greeting subspace');

    const firstAsk = createIntent(options.agentId, 'I want to try the first tutorial move');
    firstAsk.intentId = `tutorial-first-${randomUUID()}`;
    firstAsk.parentId = greeting.intentId;
    client.post(firstAsk);
    logStep('posted first tutorial intent');

    await waitForMessage(
      client,
      greeting.intentId,
      (msg) => msg.type === 'DECLINE' && msg.intentId === firstAsk.intentId,
      'tutorial decline',
    );
    logStep('received deliberate decline');

    const correctedAsk = createIntent(
      options.agentId,
      'Please guide me through the station ritual with an explicit promise I can accept.',
    );
    correctedAsk.intentId = `tutorial-corrected-${randomUUID()}`;
    correctedAsk.parentId = greeting.intentId;
    client.post(correctedAsk);
    logStep('posted corrected tutorial intent');

    const promise = await waitForMessage(
      client,
      greeting.intentId,
      (msg) => msg.type === 'PROMISE' && typeof msg.promiseId === 'string',
      'tutorial promise',
    );
    logStep('received promise', promise.promiseId);

    const accept = createAccept(options.agentId, promise.promiseId!);
    accept.parentId = greeting.intentId;
    client.post(accept);
    logStep('accepted promise');

    await waitForMessage(
      client,
      greeting.intentId,
      (msg) => msg.type === 'COMPLETE' && msg.promiseId === promise.promiseId,
      'tutorial complete',
    );
    logStep('received complete');

    const assess = createAssess(options.agentId, promise.promiseId!, 'FULFILLED');
    assess.parentId = greeting.intentId;
    client.post(assess);
    logStep('posted assess FULFILLED');

    await waitForMessage(
      client,
      greeting.intentId,
      (msg) => msg.type === 'INTENT'
        && msg.senderId === 'differ-tutor'
        && msg.payload.content === 'Tutorial complete. You can now proceed beyond the ritual.',
      'final tutorial acknowledgement',
    );

    logStep('happy path complete');
  } finally {
    client.disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`dojo-agent: failed ${message}`);
  process.exit(1);
});
