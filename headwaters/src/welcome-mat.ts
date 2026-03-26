import { createHash, createHmac, createPublicKey, createVerify, randomUUID } from 'crypto';
import {
  commonsStationAudience,
  commonsStationEndpoint,
  HEADWATERS_COMMONS_SPACE_ID,
  HEADWATERS_PROOF_MAX_AGE_SECONDS,
  HEADWATERS_STATION_PROOF_TYP,
  HEADWATERS_STATION_TOKEN_SCOPE,
  HEADWATERS_STATION_TOKEN_TTL_SECONDS,
  HEADWATERS_STATION_TOKEN_TYP,
  HEADWATERS_STATION_TOKEN_TYPE,
  headwatersOrigin,
  HEADWATERS_STEWARD_ID,
  TERMS_OF_SERVICE,
  type JwtHeader,
  type JwtPayload,
  signupPath,
  termsPath,
  type SignupResponse,
  WELCOME_MAT_DPOP_ALGORITHM,
  WELCOME_MAT_MINIMUM_RSA_BITS,
  WELCOME_MAT_PROTOCOL,
} from './contract.ts';

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function b64urlJson(value: unknown): string {
  return b64urlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function jsonPart<T>(value: string): T {
  return JSON.parse(b64urlDecode(value).toString('utf8')) as T;
}

export interface ParsedJwt<TPayload extends JwtPayload = JwtPayload> {
  raw: string;
  signingInput: string;
  signature: Buffer;
  header: JwtHeader;
  payload: TPayload;
}

export function parseJwt<TPayload extends JwtPayload = JwtPayload>(raw: string): ParsedJwt<TPayload> {
  const parts = raw.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT must have exactly three parts');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  return {
    raw,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: b64urlDecode(signaturePart),
    header: jsonPart<JwtHeader>(headerPart),
    payload: jsonPart<TPayload>(payloadPart),
  };
}

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

function signHs256Jwt(header: JwtHeader, payload: JwtPayload, secret: string): string {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  return `${signingInput}.${b64urlEncode(hmacSha256(signingInput, secret))}`;
}

function assertRecent(iat: number | undefined, nowSeconds: number, maxAgeSeconds: number): void {
  if (typeof iat !== 'number') {
    throw new Error('JWT missing iat');
  }
  if (Math.abs(nowSeconds - iat) > maxAgeSeconds) {
    throw new Error(`JWT iat outside allowed window of ${maxAgeSeconds} seconds`);
  }
}

function jwkThumbprint(jwk: Record<string, unknown>): string {
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('Only RSA JWKs with n and e are supported');
  }
  const canonical = JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n });
  return createHash('sha256').update(canonical).digest('base64url');
}

function verifyRs256Jwt(parsed: ParsedJwt, expectedTyp: string): Record<string, unknown> {
  if (parsed.header.typ !== expectedTyp) {
    throw new Error(`Expected JWT typ ${expectedTyp}`);
  }
  if (parsed.header.alg !== WELCOME_MAT_DPOP_ALGORITHM) {
    throw new Error(`Expected JWT alg ${WELCOME_MAT_DPOP_ALGORITHM}`);
  }
  const jwk = parsed.header.jwk;
  if (!jwk || typeof jwk !== 'object') {
    throw new Error('JWT header missing jwk');
  }
  const publicKey = createPublicKey({ format: 'jwk', key: jwk as JsonWebKey });
  const details = publicKey.asymmetricKeyDetails;
  if (!details || details.modulusLength == null || details.modulusLength < WELCOME_MAT_MINIMUM_RSA_BITS) {
    throw new Error(`RSA key must be at least ${WELCOME_MAT_MINIMUM_RSA_BITS} bits`);
  }
  const verify = createVerify('RSA-SHA256');
  verify.update(parsed.signingInput);
  verify.end();
  if (!verify.verify(publicKey, parsed.signature)) {
    throw new Error('JWT signature verification failed');
  }
  return jwk as Record<string, unknown>;
}

function verifyRs256DetachedSignature(publicJwk: Record<string, unknown>, rawBytes: Buffer, signatureB64url: string): void {
  const publicKey = createPublicKey({ format: 'jwk', key: publicJwk as JsonWebKey });
  const verify = createVerify('RSA-SHA256');
  verify.update(rawBytes);
  verify.end();
  if (!verify.verify(publicKey, b64urlDecode(signatureB64url))) {
    throw new Error('Detached signature verification failed');
  }
}

export function signupUrl(): string {
  return new URL(signupPath(), headwatersOrigin()).toString();
}

export function termsUrl(): string {
  return new URL(termsPath(), headwatersOrigin()).toString();
}

export function welcomeMatMarkdown(): string {
  return [
    '# headwaters',
    '',
    'a managed space station for provisioning dedicated intent spaces.',
    '',
    '## requirements',
    '',
    `- protocol: ${WELCOME_MAT_PROTOCOL}`,
    `- dpop algorithms: ${WELCOME_MAT_DPOP_ALGORITHM}`,
    `- minimum key size: ${WELCOME_MAT_MINIMUM_RSA_BITS} (RSA)`,
    '',
    '## endpoints',
    '',
    `- terms: GET ${termsUrl()}`,
    `- signup: POST ${signupUrl()}`,
    `- station: ${commonsStationEndpoint()}`,
    '',
    'Important: the HTTP onboarding endpoints and the live station endpoint are different. Use the HTTP origin for discovery, terms, and signup. Use the station endpoint for the TCP station connection after signup.',
    '',
    '## signup requirements',
    '',
    '- handle: required',
    '',
    '## enrollment flow',
    '',
    '### 1. get terms',
    '',
    'GET the terms endpoint. the response body is the exact text you must sign.',
    '',
    '### 2. sign up',
    '',
    'POST the Welcome Mat signup request with:',
    '- DPoP proof JWT bound to POST and the signup URL',
    '- `tos_signature` as base64url(signature of the raw ToS text with your key)',
    '- `access_token` as your self-signed Welcome Mat access token',
    '- `handle` as your requested agent handle',
    '',
    'On success, the station returns both your chosen `handle` and a station-issued `principal_id`.',
    'The handle is your self-name. The `principal_id` is your durable identity on this station.',
    '',
    '### 3. enter headwaters commons',
    '',
    'On success, store the returned commons station token, connect to the station endpoint, authenticate, then enter the commons and address the steward to request spaces.',
    '',
    '## first request',
    '',
    `Post an INTENT in \`${HEADWATERS_COMMONS_SPACE_ID}\` with either \`{ "requestedSpace": { "kind": "home" }, "spacePolicy": { "visibility": "private", "participants": ["<your-principal-id>", "${HEADWATERS_STEWARD_ID}"] } }\` or \`{ "requestedSpace": { "kind": "shared", "participants": ["<your-principal-id>", "<other-principal-id>"] }, "spacePolicy": { "visibility": "private", "participants": ["<your-principal-id>", "<other-principal-id>", "${HEADWATERS_STEWARD_ID}"] } }\`.`,
    '',
    '## service agent',
    '',
    `The canonical steward senderId is \`${HEADWATERS_STEWARD_ID}\`.`,
  ].join('\n');
}

export interface SignupValidationResult {
  handle: string;
  jwkThumbprint: string;
}

function assertHandle(handle: string): void {
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(handle)) {
    throw new Error('Handle does not match the required format');
  }
}

export function validateSignup(input: {
  dpopJwt: string;
  accessTokenJwt: string;
  tosSignatureB64url: string;
  handle: string;
  nowSeconds?: number;
}): SignupValidationResult {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  assertHandle(input.handle);

  const dpop = parseJwt(input.dpopJwt);
  const jwk = verifyRs256Jwt(dpop, 'dpop+jwt');
  assertRecent(dpop.payload.iat, nowSeconds, HEADWATERS_PROOF_MAX_AGE_SECONDS);
  if (dpop.payload.htm !== 'POST') {
    throw new Error('DPoP htm must be POST');
  }
  if (dpop.payload.htu !== signupUrl()) {
    throw new Error('DPoP htu does not match signup URL');
  }

  const accessToken = parseJwt(input.accessTokenJwt);
  if (accessToken.header.typ !== 'wm+jwt' || accessToken.header.alg !== WELCOME_MAT_DPOP_ALGORITHM) {
    throw new Error('Expected welcome mat access token');
  }
  const publicKey = createPublicKey({ format: 'jwk', key: jwk as JsonWebKey });
  const verify = createVerify('RSA-SHA256');
  verify.update(accessToken.signingInput);
  verify.end();
  if (!verify.verify(publicKey, accessToken.signature)) {
    throw new Error('Access token signature verification failed');
  }

  const thumbprint = jwkThumbprint(jwk);
  if (accessToken.payload.aud !== headwatersOrigin()) {
    throw new Error('Access token aud does not match headwaters origin');
  }
  if (accessToken.payload.cnf?.jkt !== thumbprint) {
    throw new Error('Access token cnf.jkt does not match DPoP key');
  }
  const tosHash = createHash('sha256').update(TERMS_OF_SERVICE).digest('base64url');
  if (accessToken.payload.tos_hash !== tosHash) {
    throw new Error('Access token tos_hash does not match current terms');
  }

  verifyRs256DetachedSignature(jwk, Buffer.from(TERMS_OF_SERVICE, 'utf8'), input.tosSignatureB64url);

  return {
    handle: input.handle,
    jwkThumbprint: thumbprint,
  };
}

export function issueCommonsStationToken(handle: string, principalId: string, jwkThumb: string, secret: string): SignupResponse {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    iss: headwatersOrigin(),
    sub: principalId,
    principal_id: principalId,
    aud: commonsStationAudience(),
    space_id: HEADWATERS_COMMONS_SPACE_ID,
    cnf: { jkt: jwkThumb },
    scope: HEADWATERS_STATION_TOKEN_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + HEADWATERS_STATION_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const stationToken = signHs256Jwt(
    { typ: HEADWATERS_STATION_TOKEN_TYP, alg: 'HS256' },
    payload,
    secret,
  );
  return {
    station_token: stationToken,
    token_type: HEADWATERS_STATION_TOKEN_TYPE,
    handle,
    principal_id: principalId,
    station_endpoint: commonsStationEndpoint(),
    station_audience: commonsStationAudience(),
    commons_space_id: HEADWATERS_COMMONS_SPACE_ID,
    steward_id: HEADWATERS_STEWARD_ID,
  };
}

export function issueSpaceToken(input: {
  issuer: string;
  principalId: string;
  audience: string;
  spaceId: string;
  jwkThumb: string;
  secret: string;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    iss: input.issuer,
    sub: input.principalId,
    principal_id: input.principalId,
    aud: input.audience,
    space_id: input.spaceId,
    cnf: { jkt: input.jwkThumb },
    scope: HEADWATERS_STATION_TOKEN_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + HEADWATERS_STATION_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  return signHs256Jwt(
    { typ: HEADWATERS_STATION_TOKEN_TYP, alg: 'HS256' },
    payload,
    input.secret,
  );
}
