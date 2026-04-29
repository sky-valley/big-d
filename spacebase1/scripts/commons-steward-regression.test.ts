import { generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import worker, { HostedSpace, SpacebaseControl } from '../src/index.ts';
import { TERMS_OF_SERVICE, jwkThumbprint, sha256b64url } from '../src/claim-auth.ts';
import { frameToServerMessage, parseSingleFramedMessage, serializeFramedMessage } from '../src/framing.ts';
import { isCommonsHomeSpaceProvisioningRequest } from '../src/shared-spaces.ts';
import type { Env, ScanResult, StationSession, StoredMessage } from '../src/types.ts';

const ORIGIN = 'https://spacebase1.differ.ac';
const textEncoder = new TextEncoder();

interface Identity {
  privateKeyPem: string;
  publicJwk: JsonWebKey;
  thumbprint: string;
}

interface CommonsSession {
  env: Env;
  identity: Identity;
  stationToken: string;
  principalId: string;
}

class MemoryStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
    const entries = Array.from(this.values.entries()).filter(([key]) => key.startsWith(prefix));
    return new Map(entries as [string, T][]);
  }
}

class MemoryState {
  readonly storage = new MemoryStorage();
}

class MemoryNamespace<T extends { fetch(request: Request): Promise<Response> }> {
  private readonly states = new Map<string, MemoryState>();
  private readonly instances = new Map<string, T>();

  constructor(
    private readonly createInstance: (state: DurableObjectState, env: Env) => T,
    private readonly env: Env,
  ) {}

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch(request: Request): Promise<Response> } {
    let instance = this.instances.get(id);
    if (!instance) {
      const state = new MemoryState();
      this.states.set(id, state);
      instance = this.createInstance(state as unknown as DurableObjectState, this.env);
      this.instances.set(id, instance);
    }
    return {
      fetch: (request: Request) => instance.fetch(request),
    };
  }
}

function makeEnv(): Env & {
  CONTROL: MemoryNamespace<SpacebaseControl>;
  SPACES: MemoryNamespace<HostedSpace>;
} {
  const env = {
    GOOGLE_ANALYTICS_ID: 'G-TEST123456',
    GOOGLE_SITE_VERIFICATION: 'google-verification-token',
  } as Env & {
    CONTROL: MemoryNamespace<SpacebaseControl>;
    SPACES: MemoryNamespace<HostedSpace>;
  };
  env.CONTROL = new MemoryNamespace((state, runtimeEnv) => new SpacebaseControl(state, runtimeEnv), env);
  env.SPACES = new MemoryNamespace((state, runtimeEnv) => new HostedSpace(state, runtimeEnv), env);
  return env;
}

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const headerPart = b64urlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem);
  return `${signingInput}.${b64urlEncode(signature)}`;
}

async function makeIdentity(): Promise<Identity> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  return {
    privateKeyPem,
    publicJwk,
    thumbprint: await jwkThumbprint(publicJwk),
  };
}

function makeDpopProof(identity: Identity, method: string, url: string): string {
  return signJwt(
    { typ: 'dpop+jwt', alg: 'RS256', jwk: identity.publicJwk },
    {
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      htm: method,
      htu: url,
    },
    identity.privateKeyPem,
  );
}

async function makeBoundDpopProof(identity: Identity, method: string, url: string, stationToken: string): Promise<string> {
  return signJwt(
    { typ: 'dpop+jwt', alg: 'RS256', jwk: identity.publicJwk },
    {
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      htm: method,
      htu: url,
      ath: await sha256b64url(stationToken),
    },
    identity.privateKeyPem,
  );
}

async function makeAccessToken(identity: Identity): Promise<string> {
  return signJwt(
    { typ: 'wm+jwt', alg: 'RS256' },
    {
      sub: 'agent-spacebase1-commons-steward-test',
      aud: ORIGIN,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      jti: crypto.randomUUID(),
      cnf: { jkt: identity.thumbprint },
      tos_hash: await sha256b64url(TERMS_OF_SERVICE),
    },
    identity.privateKeyPem,
  );
}

function signTerms(identity: Identity): string {
  return b64urlEncode(sign('RSA-SHA256', Buffer.from(TERMS_OF_SERVICE, 'utf8'), identity.privateKeyPem));
}

async function openCommonsSession(handle: string): Promise<CommonsSession> {
  const env = makeEnv();
  const identity = await makeIdentity();
  const signupUrl = `${ORIGIN}/commons/signup`;
  const response = await worker.fetch(
    new Request(signupUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        dpop: makeDpopProof(identity, 'POST', signupUrl),
      },
      body: JSON.stringify({
        handle,
        access_token: await makeAccessToken(identity),
        tos_signature: signTerms(identity),
      }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const signup = await response.json() as { station_token: string; principal_id: string };
  return { env, identity, stationToken: signup.station_token, principalId: signup.principal_id };
}

async function postCommonsIntent(session: CommonsSession, intentId: string, payload: Record<string, unknown>): Promise<void> {
  const itpUrl = `${ORIGIN}/spaces/commons/itp`;
  const response = await worker.fetch(
    new Request(itpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/itp',
        authorization: `DPoP ${session.stationToken}`,
        dpop: await makeBoundDpopProof(session.identity, 'POST', itpUrl, session.stationToken),
      },
      body: serializeFramedMessage({
        verb: 'INTENT',
        headers: {
          sender: session.principalId,
          parent: 'commons',
          intent: intentId,
          timestamp: String(Date.now()),
          'payload-hint': 'application/json',
        },
        body: textEncoder.encode(JSON.stringify(payload)),
      }),
    }),
    session.env,
  );
  expect(response.status).toBe(200);
}

async function postCommonsAccept(session: CommonsSession, parentIntentId: string, promiseId: string): Promise<void> {
  const itpUrl = `${ORIGIN}/spaces/commons/itp`;
  const response = await worker.fetch(
    new Request(itpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/itp',
        authorization: `DPoP ${session.stationToken}`,
        dpop: await makeBoundDpopProof(session.identity, 'POST', itpUrl, session.stationToken),
      },
      body: serializeFramedMessage({
        verb: 'ACCEPT',
        headers: {
          sender: session.principalId,
          parent: parentIntentId,
          promise: promiseId,
          timestamp: String(Date.now()),
          'payload-hint': 'application/json',
        },
        body: textEncoder.encode('{}'),
      }),
    }),
    session.env,
  );
  expect(response.status).toBe(200);
}

async function scanSpace(session: CommonsSession, spaceId: string): Promise<StoredMessage[]> {
  const scanUrl = `${ORIGIN}/spaces/commons/scan`;
  const response = await worker.fetch(
    new Request(scanUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/itp',
        authorization: `DPoP ${session.stationToken}`,
        dpop: await makeBoundDpopProof(session.identity, 'POST', scanUrl, session.stationToken),
      },
      body: serializeFramedMessage({
        verb: 'SCAN',
        headers: {
          space: spaceId,
          since: '0',
        },
        body: new Uint8Array(),
      }),
    }),
    session.env,
  );
  expect(response.status).toBe(200);
  const parsed = frameToServerMessage(parseSingleFramedMessage(new Uint8Array(await response.arrayBuffer()))) as ScanResult;
  expect(parsed.type).toBe('SCAN_RESULT');
  return parsed.messages;
}

function stewardPromises(messages: StoredMessage[]): StoredMessage[] {
  return messages.filter((message) => message.type === 'PROMISE' && message.senderId === 'steward-commons');
}

function stewardMessages(messages: StoredMessage[]): StoredMessage[] {
  return messages.filter((message) => message.senderId === 'steward-commons');
}

describe('Spacebase1 commons steward request detection', () => {
  it('recognizes varied home-space provisioning language without treating generic questions as requests', () => {
    for (const content of [
      'Create a private home space.',
      'Set up my Spacebase1 space.',
      'I need an intent space / home space.',
      'I would like my own space for this agent.',
      'Claim a space.',
      'Bind a space.',
    ]) {
      expect(isCommonsHomeSpaceProvisioningRequest({ content })).toBe(true);
    }

    for (const content of [
      'What is an intent space?',
      'Team update: judging is ready in the public space.',
      'Can someone make room in the schedule?',
    ]) {
      expect(isCommonsHomeSpaceProvisioningRequest({ content })).toBe(false);
    }
  });

  it('keeps structured home-space requests on the full PROMISE ACCEPT COMPLETE path', async () => {
    const session = await openCommonsSession('structured-home-agent');
    const intentId = 'intent-structured-home-space';

    await postCommonsIntent(session, intentId, {
      content: 'I would like one private agent space.',
      requestedSpace: { kind: 'home' },
      spacePolicy: { visibility: 'private' },
    });

    const [promise] = stewardPromises(await scanSpace(session, intentId));
    expect(promise).toBeTruthy();
    expect(promise.promiseId).toBeTruthy();

    await postCommonsAccept(session, intentId, promise.promiseId!);

    const messages = await scanSpace(session, intentId);
    const complete = messages.find((message) => message.type === 'COMPLETE' && message.senderId === 'steward-commons');
    expect(complete?.payload.home_space_id).toEqual(expect.stringMatching(/^space-/));
    expect(complete?.payload.claim_url).toEqual(expect.stringContaining('/claim/'));
  }, 15000);

  it('promises for clear natural-language home-space provisioning requests', async () => {
    const session = await openCommonsSession('natural-home-agent');
    const intentId = 'intent-natural-home-space';

    await postCommonsIntent(session, intentId, {
      content: 'Please provision one home space for me.',
    });

    expect(stewardPromises(await scanSpace(session, intentId))).toHaveLength(1);
  }, 15000);

  it('ignores song requests in top-level commons', async () => {
    const session = await openCommonsSession('deejay-agent');
    const intentId = 'intent-song-request';

    await postCommonsIntent(session, intentId, {
      content: 'Hey Deejay, play Pink Pony Club.',
      song: 'Pink Pony Club',
    });

    expect(stewardMessages(await scanSpace(session, intentId))).toEqual([]);
  }, 15000);

  it('ignores judging and team-update intents in top-level commons', async () => {
    const session = await openCommonsSession('judging-agent');
    const intentId = 'intent-judging-anchor';

    await postCommonsIntent(session, intentId, {
      content: 'Judging anchor: Team Neon submitted final notes for rubric review.',
      updateType: 'team-update',
      team: 'Neon',
    });

    expect(stewardMessages(await scanSpace(session, intentId))).toEqual([]);
  }, 15000);

  it('ignores generic top-level commons intents', async () => {
    const session = await openCommonsSession('generic-agent');
    const intentId = 'intent-generic-question';

    await postCommonsIntent(session, intentId, {
      content: 'Does anyone know where the meeting notes are?',
    });

    expect(stewardMessages(await scanSpace(session, intentId))).toEqual([]);
  }, 15000);
});
