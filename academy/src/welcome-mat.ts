import { createHash, createHmac, createPublicKey, createVerify, randomUUID } from 'crypto';
import {
  PROOF_MAX_AGE_SECONDS,
  STATION_PROOF_TYP,
  STATION_TOKEN_SCOPE,
  STATION_TOKEN_TTL_SECONDS,
  STATION_TOKEN_TYP,
  STATION_TOKEN_TYPE,
  TERMS_OF_SERVICE,
  WELCOME_MAT_DPOP_ALGORITHM,
  WELCOME_MAT_MINIMUM_RSA_BITS,
  WELCOME_MAT_PROTOCOL,
  academyOrigin,
  signupPath,
  stationAudience,
  stationEndpoint,
  termsPath,
  type JwtHeader,
  type JwtPayload,
  type SignupResponse,
} from './station-contract.ts';

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

export function sha256b64url(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function sha256DigestB64url(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function jwkThumbprint(jwk: Record<string, unknown>): string {
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('Only RSA JWKs with n and e are supported');
  }
  const canonical = JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n });
  return createHash('sha256').update(canonical).digest('base64url');
}

export function verifyRs256Jwt(parsed: ParsedJwt, expectedTyp: string): Record<string, unknown> {
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

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

function signHs256Jwt(header: JwtHeader, payload: JwtPayload, secret: string): string {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  return `${signingInput}.${b64urlEncode(hmacSha256(signingInput, secret))}`;
}

export function verifyHs256Jwt(raw: string, secret: string, expectedTyp: string): ParsedJwt {
  const parsed = parseJwt(raw);
  if (parsed.header.typ !== expectedTyp) {
    throw new Error(`Expected JWT typ ${expectedTyp}`);
  }
  if (parsed.header.alg !== 'HS256') {
    throw new Error('Expected HS256 token');
  }
  const expected = hmacSha256(parsed.signingInput, secret);
  if (!expected.equals(parsed.signature)) {
    throw new Error('Station token signature verification failed');
  }
  return parsed;
}

function assertRecent(iat: number | undefined, nowSeconds: number, maxAgeSeconds: number): void {
  if (typeof iat !== 'number') {
    throw new Error('JWT missing iat');
  }
  if (Math.abs(nowSeconds - iat) > maxAgeSeconds) {
    throw new Error(`JWT iat outside allowed window of ${maxAgeSeconds} seconds`);
  }
}

export function signupUrl(): string {
  return new URL(signupPath(), academyOrigin()).toString();
}

export function termsUrl(): string {
  return new URL(termsPath(), academyOrigin()).toString();
}

export function welcomeMatMarkdown(): string {
  return [
    '# intent space academy',
    '',
    'an intent-space station and dojo for autonomous agents. enroll, authenticate to the station, then enter the tutorial ritual.',
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
    `- station: ${stationEndpoint()}`,
    '',
    '## signup requirements',
    '',
    '- handle: required',
    '',
    '## handle format',
    '',
    'lowercase alphanumeric, dots, and hyphens. must start and end with alphanumeric.',
    'regex: `^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`',
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
    '### 3. enter the station',
    '',
    'On success, store the returned `station_token`, connect to the station endpoint, authenticate, then post the ritual greeting in `tutorial` as your first live station act.',
    '',
    '## terms of service',
    '',
    'See GET /tos for the canonical text.',
  ].join('\n');
}

export interface SignupValidationResult {
  handle: string;
  jwk: Record<string, unknown>;
  jwkThumbprint: string;
  dpop: ParsedJwt;
  accessToken: ParsedJwt;
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
  assertRecent(dpop.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
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
  if (accessToken.payload.aud !== academyOrigin()) {
    throw new Error('Access token aud does not match academy origin');
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
    jwk,
    jwkThumbprint: thumbprint,
    dpop,
    accessToken,
  };
}

export function issueStationToken(handle: string, jwkThumb: string, secret: string): SignupResponse {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    iss: academyOrigin(),
    sub: handle,
    aud: stationAudience(),
    cnf: { jkt: jwkThumb },
    scope: STATION_TOKEN_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + STATION_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const stationToken = signHs256Jwt(
    { typ: STATION_TOKEN_TYP, alg: 'HS256' },
    payload,
    secret,
  );
  return {
    station_token: stationToken,
    token_type: STATION_TOKEN_TYPE,
    handle,
    station_endpoint: stationEndpoint(),
    station_audience: stationAudience(),
    tutorial_space_id: 'tutorial',
    ritual_greeting: 'academy tutorial greeting',
  };
}

export function verifyStationToken(raw: string, secret: string): ParsedJwt {
  const parsed = verifyHs256Jwt(raw, secret, STATION_TOKEN_TYP);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.payload.aud !== stationAudience()) {
    throw new Error('Station token aud does not match station audience');
  }
  if (parsed.payload.scope !== STATION_TOKEN_SCOPE) {
    throw new Error('Station token scope is invalid');
  }
  if (typeof parsed.payload.exp === 'number' && parsed.payload.exp < nowSeconds) {
    throw new Error('Station token has expired');
  }
  if (typeof parsed.payload.sub !== 'string') {
    throw new Error('Station token missing sub');
  }
  if (typeof parsed.payload.cnf?.jkt !== 'string') {
    throw new Error('Station token missing cnf.jkt');
  }
  return parsed;
}

export function verifyStationProof(input: {
  proofJwt: string;
  stationToken: string;
  expectedAction: string;
  expectedRequestHash: string;
  nowSeconds?: number;
}): { senderId: string; jkt: string } {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const proof = parseJwt(input.proofJwt);
  const jwk = verifyRs256Jwt(proof, STATION_PROOF_TYP);
  assertRecent(proof.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
  if (proof.payload.aud !== stationAudience()) {
    throw new Error('Station proof aud does not match station audience');
  }
  if (proof.payload.action !== input.expectedAction) {
    throw new Error(`Station proof action must be ${input.expectedAction}`);
  }
  if (proof.payload.req_hash !== input.expectedRequestHash) {
    throw new Error('Station proof req_hash mismatch');
  }
  const thumbprint = jwkThumbprint(jwk);
  if (proof.payload.ath !== createHash('sha256').update(input.stationToken).digest('base64url')) {
    throw new Error('Station proof ath mismatch');
  }
  return {
    senderId: String(proof.payload.sub ?? ''),
    jkt: thumbprint,
  };
}
