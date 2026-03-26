import { createHash, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { headwatersOrigin } from './contract.ts';

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalRequest(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return stableStringify(value);
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'AUTH') {
    return 'AUTH';
  }
  if (record.type === 'SCAN') {
    return ['SCAN', String(record.spaceId ?? ''), String(record.since ?? 0)].join('|');
  }
  return [
    String(record.type ?? ''),
    String(record.senderId ?? ''),
    String(record.parentId ?? ''),
    String(record.intentId ?? ''),
    String(record.promiseId ?? ''),
    String(record.timestamp ?? ''),
    stableStringify(record.payload ?? {}),
  ].join('|');
}

function signJwt(privateKeyPem: string, header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const headerPart = b64urlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem);
  return `${signingInput}.${b64urlEncode(signature)}`;
}

function signDetachedB64url(privateKeyPem: string, rawText: string): string {
  return b64urlEncode(sign('RSA-SHA256', Buffer.from(rawText, 'utf8'), privateKeyPem));
}

export interface EnrolledAgent {
  senderId: string;
  principalId: string;
  handle: string;
  stationToken: string;
  stationAudience: string;
  stationEndpoint: string;
  commonsSpaceId: string;
  stewardId: string;
  buildProof: (action: string, request: Record<string, unknown>) => string;
  buildProofFor: (stationToken: string, stationAudience: string, action: string, request: Record<string, unknown>) => string;
}

function parseEndpoints(markdown: string): { terms: string; signup: string; station: string } {
  const endpoints: Record<string, string> = {};
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('- terms: ')) endpoints.terms = line.replace('- terms: GET ', '');
    if (line.startsWith('- signup: ')) endpoints.signup = line.replace('- signup: POST ', '');
    if (line.startsWith('- station: ')) endpoints.station = line.replace('- station: ', '');
  }
  if (!endpoints.terms || !endpoints.signup || !endpoints.station) {
    throw new Error('welcome.md missing terms, signup, or station endpoints');
  }
  return endpoints as { terms: string; signup: string; station: string };
}

export async function enrollAgent(headwatersUrl: string, handle: string): Promise<EnrolledAgent> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const thumbprint = createHash('sha256').update(
    JSON.stringify({ e: publicJwk.e, kty: 'RSA', n: publicJwk.n }),
  ).digest('base64url');

  const welcomeUrl = new URL('/.well-known/welcome.md', headwatersUrl).toString();
  const welcomeMarkdown = await fetch(welcomeUrl).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to fetch welcome.md: ${res.status}`);
    return res.text();
  });
  const endpoints = parseEndpoints(welcomeMarkdown);

  const tosText = await fetch(endpoints.terms).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to fetch ToS: ${res.status}`);
    return res.text();
  });

  const wmAccessToken = signJwt(
    privateKeyPem,
    { typ: 'wm+jwt', alg: 'RS256' },
    {
      jti: `wm-${randomUUID()}`,
      tos_hash: createHash('sha256').update(tosText).digest('base64url'),
      aud: headwatersOrigin(),
      cnf: { jkt: thumbprint },
      iat: Math.floor(Date.now() / 1000),
    },
  );
  const dpop = signJwt(
    privateKeyPem,
    { typ: 'dpop+jwt', alg: 'RS256', jwk: publicJwk },
    {
      jti: `dpop-${randomUUID()}`,
      htm: 'POST',
      htu: endpoints.signup,
      iat: Math.floor(Date.now() / 1000),
    },
  );

  const signupResponse = await fetch(endpoints.signup, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      dpop,
    },
    body: JSON.stringify({
      tos_signature: signDetachedB64url(privateKeyPem, tosText),
      access_token: wmAccessToken,
      handle,
    }),
  }).then(async (res) => {
    const payload = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Signup failed: ${payload.message ?? payload.error ?? res.status}`);
    }
    return payload;
  });

  return {
    senderId: String(signupResponse.principal_id ?? signupResponse.handle ?? handle),
    principalId: String(signupResponse.principal_id ?? signupResponse.handle ?? handle),
    handle: String(signupResponse.handle ?? handle),
    stationToken: String(signupResponse.station_token),
    stationAudience: String(signupResponse.station_audience),
    stationEndpoint: String(signupResponse.station_endpoint ?? endpoints.station),
    commonsSpaceId: String(signupResponse.commons_space_id ?? 'headwaters-commons'),
    stewardId: String(signupResponse.steward_id ?? 'headwaters-steward'),
    buildProofFor: (stationToken: string, stationAudience: string, action: string, request: Record<string, unknown>) => signJwt(
      privateKeyPem,
      { typ: 'itp-pop+jwt', alg: 'RS256', jwk: publicJwk },
      {
        jti: `itp-proof-${randomUUID()}`,
        sub: String(signupResponse.principal_id ?? signupResponse.handle ?? handle),
        aud: stationAudience,
        iat: Math.floor(Date.now() / 1000),
        ath: createHash('sha256').update(stationToken).digest('base64url'),
        action,
        req_hash: createHash('sha256').update(canonicalRequest(request)).digest('base64url'),
      },
    ),
    buildProof: (action: string, request: Record<string, unknown>) => signJwt(
      privateKeyPem,
      { typ: 'itp-pop+jwt', alg: 'RS256', jwk: publicJwk },
      {
        jti: `itp-proof-${randomUUID()}`,
        sub: String(signupResponse.principal_id ?? signupResponse.handle ?? handle),
        aud: String(signupResponse.station_audience),
        iat: Math.floor(Date.now() / 1000),
        ath: createHash('sha256').update(String(signupResponse.station_token)).digest('base64url'),
        action,
        req_hash: createHash('sha256').update(canonicalRequest(request)).digest('base64url'),
      },
    ),
  };
}
