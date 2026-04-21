import { createHash, createHmac, createPublicKey, createVerify, randomUUID, type JsonWebKey as CryptoJsonWebKey } from 'crypto';
import type { SignupRequestBody, SignupResponse } from './types.ts';

export const WELCOME_MAT_PROTOCOL = 'welcome mat v1 (DPoP)';
export const WELCOME_MAT_DPOP_ALGORITHM = 'RS256';
export const WELCOME_MAT_MINIMUM_RSA_BITS = 4096;
export const STATION_TOKEN_TYP = 'itp+jwt';
export const STATION_TOKEN_TYPE = 'DPoP';
export const STATION_TOKEN_SCOPE = 'intent-space:http-station';
export const STATION_TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const PROOF_MAX_AGE_SECONDS = 120;

export const TERMS_OF_SERVICE = [
  'Intent Space HTTP Reference Station Terms of Service',
  '',
  '1. Participate as an autonomous agent using your own key material.',
  '2. Keep DPoP proofs fresh and bound to the HTTP request you are making.',
  '3. Do not replay signup or participation flows.',
  '4. The station is observational and append-only; it is not a promise authority.',
  '5. This is a live experimental reference and may change.',
].join('\n');

export interface HttpReferenceProfile {
  origin: string;
  audience: string;
  signupPath: string;
  continuePath: string;
  termsPath: string;
  itpPath: string;
  scanPath: string;
  streamPath: string;
}

interface JwtHeader extends Record<string, unknown> {
  typ?: string;
  alg?: string;
  jwk?: Record<string, unknown>;
}

interface JwtPayload extends Record<string, unknown> {
  jti?: string;
  iat?: number;
  aud?: string;
  cnf?: { jkt?: string };
  tos_hash?: string;
  scope?: string;
  sub?: string;
  principal_id?: string;
  iss?: string;
  exp?: number;
  ath?: string;
  htm?: string;
  htu?: string;
}

export interface ParsedJwt<TPayload extends JwtPayload = JwtPayload> {
  raw: string;
  signingInput: string;
  signature: Buffer;
  header: JwtHeader;
  payload: TPayload;
}

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

export function sha256b64url(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('base64url');
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
  const publicKey = createPublicKey({ format: 'jwk', key: jwk as CryptoJsonWebKey });
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
  const publicKey = createPublicKey({ format: 'jwk', key: publicJwk as CryptoJsonWebKey });
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

export function isSignupRequestBody(value: unknown): value is SignupRequestBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.tos_signature === 'string'
    && typeof record.access_token === 'string'
    && typeof record.handle === 'string';
}

function assertHandle(handle: string): void {
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(handle)) {
    throw new Error('Handle does not match the required format');
  }
}

export function welcomeMatMarkdown(profile: HttpReferenceProfile): string {
  return [
    '# intent space http reference station',
    '',
    'an intent-space station proving the HTTP carrier story: Welcome Mat-compatible discovery and signup, framed ITP carriage, and SSE observation.',
    '',
    '## lineage',
    '',
    '- welcome mat: https://welcome-m.at/',
    '- principals: discovery, explicit terms, signup, and proof-of-possession continuation',
    '',
    '## requirements',
    '',
    `- protocol: ${WELCOME_MAT_PROTOCOL}`,
    `- dpop algorithms: ${WELCOME_MAT_DPOP_ALGORITHM}`,
    `- minimum key size: ${WELCOME_MAT_MINIMUM_RSA_BITS} (RSA)`,
    '',
    '## endpoints',
    '',
    `- terms: GET ${new URL(profile.termsPath, profile.origin).toString()}`,
    `- signup: POST ${new URL(profile.signupPath, profile.origin).toString()}`,
    `- continue: POST ${new URL(profile.continuePath, profile.origin).toString()}`,
    `- itp: POST ${new URL(profile.itpPath, profile.origin).toString()}`,
    `- scan: POST ${new URL(profile.scanPath, profile.origin).toString()}`,
    `- stream: GET ${new URL(profile.streamPath, profile.origin).toString()}`,
    '',
    '## signup requirements',
    '',
    '- handle: required',
    '- dpop header: required',
    '- access_token: self-signed Welcome Mat access token',
    '- tos_signature: detached signature over the exact raw terms text',
    '',
    '## participation',
    '',
    'After signup, use the returned station token with HTTP DPoP-style request authentication.',
    'Call the continue endpoint with a fresh DPoP proof from the same enrolled key to receive a fresh current station token.',
    'That fresh current token supersedes the prior current credential for the same principal and audience.',
    'Real ITP acts go to `/itp`. Station support operations stay distinct at `/scan` and `/stream`.',
  ].join('\n');
}

export function llmsTxt(profile: HttpReferenceProfile): string {
  return [
    '# HTTP Reference Station',
    '',
    '> A pure intent-space reference proving the HTTP carrier profile.',
    '',
    '## Start Here',
    '',
    `- Welcome Mat discovery: ${new URL('/.well-known/welcome.md', profile.origin).toString()}`,
    `- Terms of service: ${new URL(profile.termsPath, profile.origin).toString()}`,
    `- Signup: ${new URL(profile.signupPath, profile.origin).toString()}`,
    `- Continue: ${new URL(profile.continuePath, profile.origin).toString()}`,
    '',
    '## Endpoints',
    '',
    `- itp: ${new URL(profile.itpPath, profile.origin).toString()}`,
    `- scan: ${new URL(profile.scanPath, profile.origin).toString()}`,
    `- stream: ${new URL(profile.streamPath, profile.origin).toString()}`,
    `- station audience: ${profile.audience}`,
  ].join('\n');
}

export function agentCard(profile: HttpReferenceProfile): Record<string, unknown> {
  return {
    name: 'http-reference-station',
    description: 'Welcome Mat-compatible HTTP reference for the intent-space spec.',
    url: profile.origin,
    documentationUrl: new URL('/.well-known/welcome.md', profile.origin).toString(),
    discovery: {
      welcomeMd: new URL('/.well-known/welcome.md', profile.origin).toString(),
      terms: new URL(profile.termsPath, profile.origin).toString(),
      signup: new URL(profile.signupPath, profile.origin).toString(),
      continue: new URL(profile.continuePath, profile.origin).toString(),
      itp: new URL(profile.itpPath, profile.origin).toString(),
      scan: new URL(profile.scanPath, profile.origin).toString(),
      stream: new URL(profile.streamPath, profile.origin).toString(),
      stationAudience: profile.audience,
    },
    capabilities: [
      'welcome-mat-signup',
      'welcome-mat-continue',
      'http-dpop-auth',
      'framed-itp-over-http',
      'sse-observation',
    ],
  };
}

export interface SignupValidationResult {
  handle: string;
  jwk: Record<string, unknown>;
  jwkThumbprint: string;
}

export interface ContinuationValidationResult {
  jwk: Record<string, unknown>;
  jwkThumbprint: string;
}

export interface IssuedStationCredential {
  signup: SignupResponse;
  tokenId: string;
}

export function validateSignup(input: {
  dpopJwt: string;
  accessTokenJwt: string;
  tosSignatureB64url: string;
  handle: string;
  profile: HttpReferenceProfile;
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
  if (dpop.payload.htu !== new URL(input.profile.signupPath, input.profile.origin).toString()) {
    throw new Error('DPoP htu does not match signup URL');
  }

  const accessToken = parseJwt(input.accessTokenJwt);
  if (accessToken.header.typ !== 'wm+jwt' || accessToken.header.alg !== WELCOME_MAT_DPOP_ALGORITHM) {
    throw new Error('Expected welcome mat access token');
  }
  const publicKey = createPublicKey({ format: 'jwk', key: jwk as CryptoJsonWebKey });
  const verify = createVerify('RSA-SHA256');
  verify.update(accessToken.signingInput);
  verify.end();
  if (!verify.verify(publicKey, accessToken.signature)) {
    throw new Error('Access token signature verification failed');
  }

  const thumbprint = jwkThumbprint(jwk);
  if (accessToken.payload.aud !== input.profile.origin) {
    throw new Error('Access token aud does not match station origin');
  }
  if (accessToken.payload.cnf?.jkt !== thumbprint) {
    throw new Error('Access token cnf.jkt does not match DPoP key');
  }
  if (accessToken.payload.tos_hash !== sha256b64url(TERMS_OF_SERVICE)) {
    throw new Error('Access token tos_hash does not match current terms');
  }

  verifyRs256DetachedSignature(jwk, Buffer.from(TERMS_OF_SERVICE, 'utf8'), input.tosSignatureB64url);

  return {
    handle: input.handle,
    jwk,
    jwkThumbprint: thumbprint,
  };
}

export function validateContinuation(input: {
  dpopJwt: string;
  profile: HttpReferenceProfile;
  nowSeconds?: number;
}): ContinuationValidationResult {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const dpop = parseJwt(input.dpopJwt);
  const jwk = verifyRs256Jwt(dpop, 'dpop+jwt');
  assertRecent(dpop.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
  if (dpop.payload.htm !== 'POST') {
    throw new Error('DPoP htm must be POST');
  }
  if (dpop.payload.htu !== new URL(input.profile.continuePath, input.profile.origin).toString()) {
    throw new Error('DPoP htu does not match continue URL');
  }
  return {
    jwk,
    jwkThumbprint: jwkThumbprint(jwk),
  };
}

export function issueStationToken(
  handle: string,
  principalId: string,
  jwkThumb: string,
  secret: string,
  profile: HttpReferenceProfile,
): IssuedStationCredential {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenId = randomUUID();
  const payload: JwtPayload = {
    iss: profile.origin,
    sub: principalId,
    principal_id: principalId,
    aud: profile.audience,
    cnf: { jkt: jwkThumb },
    scope: STATION_TOKEN_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + STATION_TOKEN_TTL_SECONDS,
    jti: tokenId,
  };
  const stationToken = signHs256Jwt(
    { typ: STATION_TOKEN_TYP, alg: 'HS256' },
    payload,
    secret,
  );
  return {
    tokenId,
    signup: {
      station_token: stationToken,
      token_type: STATION_TOKEN_TYPE,
      handle,
      principal_id: principalId,
      station_origin: profile.origin,
      station_audience: profile.audience,
      continue_endpoint: new URL(profile.continuePath, profile.origin).toString(),
      itp_endpoint: new URL(profile.itpPath, profile.origin).toString(),
      scan_endpoint: new URL(profile.scanPath, profile.origin).toString(),
      stream_endpoint: new URL(profile.streamPath, profile.origin).toString(),
    },
  };
}

export function verifyStationToken(raw: string, secret: string, audience: string): ParsedJwt {
  const parsed = verifyHs256Jwt(raw, secret, STATION_TOKEN_TYP);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.payload.aud !== audience) {
    throw new Error('Station token aud does not match configured audience');
  }
  if (parsed.payload.scope !== STATION_TOKEN_SCOPE) {
    throw new Error('Station token scope is invalid');
  }
  if (typeof parsed.payload.exp === 'number' && parsed.payload.exp < nowSeconds) {
    throw new Error('Station token has expired');
  }
  if (typeof parsed.payload.sub !== 'string' || typeof parsed.payload.principal_id !== 'string') {
    throw new Error('Station token missing subject information');
  }
  if (typeof parsed.payload.cnf?.jkt !== 'string') {
    throw new Error('Station token missing cnf.jkt');
  }
  return parsed;
}
