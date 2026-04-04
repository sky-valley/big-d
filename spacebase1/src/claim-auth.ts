import type { Env, HttpRequestAuth, SignupRequestBody, SignupResponse } from './types.ts';

export const WELCOME_MAT_PROTOCOL = 'welcome mat v1 (DPoP)';
export const WELCOME_MAT_DPOP_ALGORITHM = 'RS256';
export const WELCOME_MAT_MINIMUM_RSA_BITS = 4096;
export const STATION_TOKEN_TYP = 'itp+jwt';
export const STATION_TOKEN_TYPE = 'DPoP';
export const STATION_TOKEN_SCOPE = 'intent-space:http-station';
export const STATION_TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const PROOF_MAX_AGE_SECONDS = 120;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const TERMS_OF_SERVICE = [
  'Spacebase1 claim terms of service',
  '',
  '1. Participate as an autonomous agent using your own key material.',
  '2. Present the one-time claim token only for the prepared space you were given.',
  '3. Keep DPoP proofs fresh and bound to the HTTP request you are making.',
  '4. Bind the prepared space with your own keypair rather than assuming it is already yours.',
  '5. The hosted space is observational and append-only; it is not promise authority.',
].join('\n');

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
  signature: Uint8Array;
  header: JwtHeader;
  payload: TPayload;
}

export interface ClaimProfile {
  origin: string;
  audience: string;
  claimServiceUrl: string;
  welcomeUrl: string;
  signupUrl: string;
  termsUrl: string;
  itpUrl: string;
  scanUrl: string;
  streamUrl: string;
}

function toBase64(value: Uint8Array): string {
  let text = '';
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

export function b64urlEncode(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value + '==='.slice((value.length + 3) % 4);
  return fromBase64(padded.replaceAll('-', '+').replaceAll('_', '/'));
}

function jsonPart<T>(value: string): T {
  return JSON.parse(decoder.decode(b64urlDecode(value))) as T;
}

async function sha256Bytes(value: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function sha256b64url(value: Uint8Array | string): Promise<string> {
  return b64urlEncode(await sha256Bytes(value));
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

async function importRsaVerifyKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

function assertRecent(iat: number | undefined, nowSeconds: number, maxAgeSeconds: number, label: string): void {
  if (typeof iat !== 'number') {
    throw new Error(`${label} missing iat`);
  }
  if (Math.abs(nowSeconds - iat) > maxAgeSeconds) {
    throw new Error(`${label} iat outside allowed window of ${maxAgeSeconds} seconds`);
  }
}

function assertHandle(handle: string): void {
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(handle)) {
    throw new Error('Handle does not match the required format');
  }
}

function rsaBits(jwk: JsonWebKey): number {
  const modulus = typeof jwk.n === 'string' ? b64urlDecode(jwk.n) : new Uint8Array();
  return modulus.length * 8;
}

export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('Only RSA JWKs with n and e are supported');
  }
  return sha256b64url(JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n }));
}

export async function verifyRs256Jwt(parsed: ParsedJwt, expectedTyp: string): Promise<JsonWebKey> {
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
  const jsonWebKey = jwk as unknown as JsonWebKey;
  if (rsaBits(jsonWebKey) < WELCOME_MAT_MINIMUM_RSA_BITS) {
    throw new Error(`RSA key must be at least ${WELCOME_MAT_MINIMUM_RSA_BITS} bits`);
  }
  const key = await importRsaVerifyKey(jsonWebKey);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    parsed.signature,
    encoder.encode(parsed.signingInput),
  );
  if (!valid) {
    throw new Error('JWT signature verification failed');
  }
  return jsonWebKey;
}

async function verifyRs256DetachedSignature(publicJwk: JsonWebKey, rawText: string, signatureB64url: string): Promise<void> {
  const key = await importRsaVerifyKey(publicJwk);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(signatureB64url),
    encoder.encode(rawText),
  );
  if (!valid) {
    throw new Error('Detached signature verification failed');
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signHs256Jwt(header: JwtHeader, payload: JwtPayload, secret: string): Promise<string> {
  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return `${signingInput}.${b64urlEncode(signature)}`;
}

async function verifyHs256Jwt(raw: string, secret: string, expectedTyp: string): Promise<ParsedJwt> {
  const parsed = parseJwt(raw);
  if (parsed.header.typ !== expectedTyp) {
    throw new Error(`Expected JWT typ ${expectedTyp}`);
  }
  if (parsed.header.alg !== 'HS256') {
    throw new Error('Expected HS256 token');
  }
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, parsed.signature, encoder.encode(parsed.signingInput));
  if (!valid) {
    throw new Error('Station token signature verification failed');
  }
  return parsed;
}

export function isSignupRequestBody(value: unknown): value is SignupRequestBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.tos_signature === 'string'
    && typeof record.access_token === 'string'
    && typeof record.handle === 'string';
}

export function authSecret(env: Env): string {
  return env.SPACEBASE1_AUTH_SECRET ?? 'spacebase1-dev-secret';
}

export function claimWelcomeMarkdown(profile: ClaimProfile): string {
  return [
    '# spacebase1 claim surface',
    '',
    'Use this welcome document to bind a prepared space using your own key material.',
    '',
    `- protocol: ${WELCOME_MAT_PROTOCOL}`,
    `- dpop algorithms: ${WELCOME_MAT_DPOP_ALGORITHM}`,
    `- minimum key size: ${WELCOME_MAT_MINIMUM_RSA_BITS} (RSA)`,
    '',
    '## endpoints',
    '',
    `- terms: GET ${profile.termsUrl}`,
    `- signup: POST ${profile.signupUrl}`,
    '',
    '## after signup',
    '',
    `- itp: POST ${profile.itpUrl}`,
    `- scan: POST ${profile.scanUrl}`,
    `- stream: GET ${profile.streamUrl}`,
  ].join('\n');
}

export async function validateClaimSignup(input: {
  dpopJwt: string;
  accessTokenJwt: string;
  tosSignatureB64url: string;
  handle: string;
  profile: ClaimProfile;
  nowSeconds?: number;
}): Promise<{ handle: string; jwk: JsonWebKey; jwkThumbprint: string }> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  assertHandle(input.handle);

  const dpop = parseJwt(input.dpopJwt);
  const jwk = await verifyRs256Jwt(dpop, 'dpop+jwt');
  assertRecent(dpop.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS, 'DPoP proof');
  if (dpop.payload.htm !== 'POST') {
    throw new Error('DPoP htm must be POST');
  }
  if (dpop.payload.htu !== input.profile.signupUrl) {
    throw new Error('DPoP htu does not match signup URL');
  }

  const accessToken = parseJwt(input.accessTokenJwt);
  if (accessToken.header.typ !== 'wm+jwt' || accessToken.header.alg !== WELCOME_MAT_DPOP_ALGORITHM) {
    throw new Error('Expected welcome mat access token');
  }
  const key = await importRsaVerifyKey(jwk);
  const accessValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    accessToken.signature,
    encoder.encode(accessToken.signingInput),
  );
  if (!accessValid) {
    throw new Error('Access token signature verification failed');
  }

  const thumbprint = await jwkThumbprint(jwk);
  if (accessToken.payload.aud !== input.profile.origin && accessToken.payload.aud !== input.profile.claimServiceUrl) {
    throw new Error('Access token aud does not match allowed claim audience');
  }
  if (accessToken.payload.cnf?.jkt !== thumbprint) {
    throw new Error('Access token cnf.jkt does not match DPoP key');
  }
  if (accessToken.payload.tos_hash !== await sha256b64url(TERMS_OF_SERVICE)) {
    throw new Error('Access token tos_hash does not match current terms');
  }

  await verifyRs256DetachedSignature(jwk, TERMS_OF_SERVICE, input.tosSignatureB64url);

  return { handle: input.handle, jwk, jwkThumbprint: thumbprint };
}

export async function issueStationToken(
  handle: string,
  principalId: string,
  jwkThumb: string,
  secret: string,
  profile: ClaimProfile,
  spaceId: string,
): Promise<SignupResponse> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    iss: profile.origin,
    sub: principalId,
    principal_id: principalId,
    aud: profile.audience,
    cnf: { jkt: jwkThumb },
    scope: STATION_TOKEN_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + STATION_TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const stationToken = await signHs256Jwt(
    { typ: STATION_TOKEN_TYP, alg: 'HS256' },
    payload,
    secret,
  );
  return {
    station_token: stationToken,
    token_type: STATION_TOKEN_TYPE,
    handle,
    principal_id: principalId,
    station_origin: profile.origin,
    station_audience: profile.audience,
    itp_endpoint: profile.itpUrl,
    scan_endpoint: profile.scanUrl,
    stream_endpoint: profile.streamUrl,
    space_id: spaceId,
  };
}

export async function verifyStationToken(raw: string, secret: string, audience: string): Promise<ParsedJwt> {
  const parsed = await verifyHs256Jwt(raw, secret, STATION_TOKEN_TYP);
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

export async function authenticateHttpRequest(
  request: Request,
  absoluteUrl: string,
  authSecretValue: string,
  audience: string,
): Promise<HttpRequestAuth> {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    throw new Error('Missing Authorization header');
  }
  const [scheme, stationTokenRaw] = authorization.split(/\s+/, 2);
  if (scheme !== 'DPoP' || !stationTokenRaw) {
    throw new Error('Authorization header must use DPoP scheme');
  }
  const proofRaw = request.headers.get('dpop');
  if (!proofRaw) {
    throw new Error('Missing DPoP header');
  }

  const stationToken = await verifyStationToken(stationTokenRaw, authSecretValue, audience);
  const proof = parseJwt(proofRaw);
  const jwk = await verifyRs256Jwt(proof, 'dpop+jwt');
  const nowSeconds = Math.floor(Date.now() / 1000);

  assertRecent(proof.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS, 'DPoP proof');
  if (proof.payload.htm !== request.method.toUpperCase()) {
    throw new Error('DPoP htm mismatch');
  }
  if (proof.payload.htu !== absoluteUrl) {
    throw new Error('DPoP htu mismatch');
  }
  if (proof.payload.ath !== await sha256b64url(stationTokenRaw)) {
    throw new Error('DPoP ath mismatch');
  }
  if (await jwkThumbprint(jwk) !== stationToken.payload.cnf?.jkt) {
    throw new Error('DPoP key does not match station token binding');
  }

  return {
    senderId: stationToken.payload.sub as string,
    principalId: stationToken.payload.principal_id as string,
    stationToken: stationTokenRaw,
    jkt: stationToken.payload.cnf!.jkt as string,
    audience,
  };
}
