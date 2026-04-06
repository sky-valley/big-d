import type {
  HttpRequestAuth,
  SignupBodyValidationError,
  SignupRequestBody,
  SignupResponse,
  StationSession,
} from './types.ts';

export const WELCOME_MAT_PROTOCOL = 'welcome mat v1 (DPoP)';
export const WELCOME_MAT_DPOP_ALGORITHM = 'RS256';
export const WELCOME_MAT_MINIMUM_RSA_BITS = 4096;
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

export function normalizeHandle(handle: string): string {
  const normalized = handle.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-');
  return normalized.replace(/^[.-]+|[.-]+$/g, '');
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

const SIGNUP_FIELDS = ['tos_signature', 'access_token', 'handle'] as const;

export function validateSignupRequestBody(value: unknown): {
  ok: true;
  body: SignupRequestBody;
} | {
  ok: false;
  error: SignupBodyValidationError;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: {
        error: 'invalid_signup_body',
        reason: 'expected_json_object',
      },
    };
  }

  const record = value as Record<string, unknown>;
  for (const field of SIGNUP_FIELDS) {
    if (!(field in record)) {
      return {
        ok: false,
        error: {
          error: 'missing_field',
          field,
        },
      };
    }
    if (typeof record[field] !== 'string') {
      return {
        ok: false,
        error: {
          error: 'invalid_field_type',
          field,
          expected: 'string',
        },
      };
    }
  }

  return { ok: true, body: record as SignupRequestBody };
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
    '## signup body',
    '',
    '- content-type: application/json',
    '- handle: string — your participant handle; the station normalizes it to the supported handle format',
    `- access_token: string — a ${WELCOME_MAT_DPOP_ALGORITHM}-signed Welcome Mat access token JWT with typ \`wm+jwt\``,
    `- tos_signature: string — a detached ${WELCOME_MAT_DPOP_ALGORITHM} signature over the current terms text at ${profile.termsUrl}`,
    '',
    'Example:',
    '',
    '```json',
    JSON.stringify({
      handle: 'your-agent-name',
      access_token: '<wm+jwt access token>',
      tos_signature: '<detached rs256 signature over terms>',
    }, null, 2),
    '```',
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
  const normalizedHandle = normalizeHandle(input.handle);
  assertHandle(normalizedHandle);

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

  return { handle: normalizedHandle, jwk, jwkThumbprint: thumbprint };
}

function makeOpaqueStationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

export async function issueStationSession(
  handle: string,
  principalId: string,
  jwkThumb: string,
  profile: ClaimProfile,
  spaceId: string,
): Promise<{ signup: SignupResponse; session: StationSession; stationToken: string }> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + STATION_TOKEN_TTL_SECONDS * 1000);
  const stationToken = makeOpaqueStationToken();
  const session: StationSession = {
    tokenHash: await sha256b64url(stationToken),
    principalId,
    handle,
    jkt: jwkThumb,
    audience: profile.audience,
    spaceId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return {
    stationToken,
    session,
    signup: {
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
    },
  };
}

export async function authenticateHttpRequest(
  request: Request,
  absoluteUrl: string,
  audience: string,
  lookupSession: (tokenHash: string) => Promise<StationSession | null>,
  rememberProofJti: (tokenHash: string, jti: string, expiresAt: string) => Promise<boolean>,
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

  const tokenHash = await sha256b64url(stationTokenRaw);
  const session = await lookupSession(tokenHash);
  if (!session) {
    throw new Error('Unknown station token');
  }
  if (session.audience !== audience) {
    throw new Error('Station token aud does not match configured audience');
  }
  if (session.expiresAt < new Date().toISOString()) {
    throw new Error('Station token has expired');
  }
  const proof = parseJwt(proofRaw);
  const jwk = await verifyRs256Jwt(proof, 'dpop+jwt');
  const nowSeconds = Math.floor(Date.now() / 1000);

  assertRecent(proof.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS, 'DPoP proof');
  const proofIssuedAt = proof.payload.iat;
  if (typeof proofIssuedAt !== 'number') {
    throw new Error('DPoP proof missing iat');
  }
  if (typeof proof.payload.jti !== 'string' || !proof.payload.jti) {
    throw new Error('DPoP proof missing jti');
  }
  if (proof.payload.htm !== request.method.toUpperCase()) {
    throw new Error('DPoP htm mismatch');
  }
  if (proof.payload.htu !== absoluteUrl) {
    throw new Error('DPoP htu mismatch');
  }
  if (proof.payload.ath !== await sha256b64url(stationTokenRaw)) {
    throw new Error('DPoP ath mismatch');
  }
  if (await jwkThumbprint(jwk) !== session.jkt) {
    throw new Error('DPoP key does not match station token binding');
  }
  const proofExpiresAt = new Date((proofIssuedAt + PROOF_MAX_AGE_SECONDS) * 1000).toISOString();
  if (!(await rememberProofJti(tokenHash, proof.payload.jti, proofExpiresAt))) {
    throw new Error('DPoP proof replay detected');
  }

  return {
    senderId: session.principalId,
    principalId: session.principalId,
    handle: session.handle,
    stationToken: stationTokenRaw,
    jkt: session.jkt,
    audience,
  };
}
