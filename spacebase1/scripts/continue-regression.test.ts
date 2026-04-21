import { generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import worker, { HostedSpace, SpacebaseControl } from '../src/index.ts';
import { TERMS_OF_SERVICE, jwkThumbprint, sha256b64url } from '../src/claim-auth.ts';
import { frameToServerMessage, parseSingleFramedMessage, serializeFramedMessage } from '../src/framing.ts';
import type { Env, StationSession } from '../src/types.ts';

const ORIGIN = 'https://spacebase1.differ.ac';

interface Identity {
  privateKeyPem: string;
  publicJwk: JsonWebKey;
  thumbprint: string;
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

  stateFor(id: string): MemoryState {
    this.get(id);
    return this.states.get(id)!;
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

function makeDpopProof(identity: Identity, method: string, url: string, stationToken?: string): string {
  const payload: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    htm: method,
    htu: url,
  };
  if (stationToken) {
    payload.ath = b64urlEncode(Buffer.from(stationToken, 'utf8').subarray(0, 0));
  }
  return signJwt(
    { typ: 'dpop+jwt', alg: 'RS256', jwk: identity.publicJwk },
    payload,
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

async function makeAccessToken(identity: Identity, audience: string): Promise<string> {
  return signJwt(
    { typ: 'wm+jwt', alg: 'RS256' },
    {
      sub: 'agent-spacebase1-integration',
      aud: audience,
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

async function signupCommons(env: Env, identity: Identity, handle: string): Promise<any> {
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
        access_token: await makeAccessToken(identity, ORIGIN),
        tos_signature: signTerms(identity),
      }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  return await response.json();
}

async function continueCommons(env: Env, identity: Identity): Promise<any> {
  const continueUrl = `${ORIGIN}/spaces/commons/continue`;
  const response = await worker.fetch(
    new Request(continueUrl, {
      method: 'POST',
      headers: {
        dpop: makeDpopProof(identity, 'POST', continueUrl),
      },
    }),
    env,
  );
  expect(response.status).toBe(200);
  return await response.json();
}

async function scanCommons(env: Env, identity: Identity, stationToken: string): Promise<Response> {
  const scanUrl = `${ORIGIN}/spaces/commons/scan`;
  return worker.fetch(
    new Request(scanUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/itp',
        authorization: `DPoP ${stationToken}`,
        dpop: await makeBoundDpopProof(identity, 'POST', scanUrl, stationToken),
      },
      body: serializeFramedMessage({
        verb: 'SCAN',
        headers: {
          space: 'commons',
          since: '0',
        },
        body: new Uint8Array(),
      }),
    }),
    env,
  );
}

describe('Spacebase1 continuation flow', () => {
  it('reissues a fresh commons credential for the same principal', async () => {
    const env = makeEnv();
    const identity = await makeIdentity();

    const signup = await signupCommons(env, identity, 'agent-spacebase1-continue');
    const continued = await continueCommons(env, identity);

    expect(continued.principal_id).toBe(signup.principal_id);
    expect(continued.handle).toBe(signup.handle);
    expect(continued.space_id).toBe('commons');
    expect(continued.continue_endpoint).toBe(`${ORIGIN}/spaces/commons/continue`);
    expect(continued.station_token).not.toBe(signup.station_token);
  });

  it('accepts the continued credential on live scan and rejects the superseded prior credential immediately', async () => {
    const env = makeEnv();
    const identity = await makeIdentity();

    const signup = await signupCommons(env, identity, 'agent-spacebase1-continue-scan');
    const continued = await continueCommons(env, identity);

    const supersededPriorResponse = await scanCommons(env, identity, signup.station_token);
    expect(supersededPriorResponse.status).toBe(401);
    expect(await supersededPriorResponse.json()).toEqual({
      error: 'Station token is no longer current',
    });

    const continuedResponse = await scanCommons(env, identity, continued.station_token);
    expect(continuedResponse.status).toBe(200);

    const parsed = frameToServerMessage(parseSingleFramedMessage(new Uint8Array(await continuedResponse.arrayBuffer())));
    expect(parsed.type).toBe('SCAN_RESULT');
    expect(parsed.spaceId).toBe('commons');
  });
});
