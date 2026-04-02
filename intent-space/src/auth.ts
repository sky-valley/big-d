import { createHash, createHmac, createPublicKey, createVerify, type JsonWebKey as CryptoJsonWebKey } from 'crypto';
import type { AuthenticatedITPMessage, AuthRequest, ScanRequest } from './types.ts';
import { requestProofHash } from './proof-input.ts';

const STATION_PROOF_TYP = 'itp-pop+jwt';
const STATION_TOKEN_TYP = 'itp+jwt';
const PROOF_MAX_AGE_SECONDS = 120;
const MIN_RSA_BITS = 4096;

interface JwtHeader extends Record<string, unknown> {
  typ?: string;
  alg?: string;
  jwk?: Record<string, unknown>;
}

interface JwtPayload extends Record<string, unknown> {
  sub?: string;
  principal_id?: string;
  aud?: string;
  space_id?: string;
  cnf?: { jkt?: string };
  scope?: string;
  iat?: number;
  exp?: number;
  ath?: string;
  action?: string;
  req_hash?: string;
}

interface ParsedJwt {
  raw: string;
  signingInput: string;
  signature: Buffer;
  header: JwtHeader;
  payload: JwtPayload;
}

export interface StationSessionAuth {
  senderId: string;
  principalId: string;
  stationToken: string;
  jkt: string;
  audience: string;
  spaceId?: string;
}

export function defaultStationAudience(): string {
  return process.env.ACADEMY_STATION_AUDIENCE ?? 'intent-space://academy/station';
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function requireJwtString(raw: unknown, fieldName: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`${fieldName} must be a string JWT`);
  }
  if (!raw.trim()) {
    throw new Error(`${fieldName} must not be empty`);
  }
  return raw;
}

function parseJwt(raw: unknown, fieldName: string): ParsedJwt {
  const token = requireJwtString(raw, fieldName);
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error(`${fieldName} must have exactly three JWT parts`);
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  try {
    return {
      raw: token,
      signingInput: `${headerPart}.${payloadPart}`,
      signature: b64urlDecode(signaturePart),
      header: JSON.parse(b64urlDecode(headerPart).toString('utf8')) as JwtHeader,
      payload: JSON.parse(b64urlDecode(payloadPart).toString('utf8')) as JwtPayload,
    };
  } catch {
    throw new Error(`${fieldName} is not a valid JWT`);
  }
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
  if (parsed.header.alg !== 'RS256') {
    throw new Error('Expected JWT alg RS256');
  }
  const jwk = parsed.header.jwk;
  if (!jwk || typeof jwk !== 'object') {
    throw new Error('JWT header missing jwk');
  }
  const publicKey = createPublicKey({ format: 'jwk', key: jwk as CryptoJsonWebKey });
  const details = publicKey.asymmetricKeyDetails;
  if (!details || details.modulusLength == null || details.modulusLength < MIN_RSA_BITS) {
    throw new Error(`RSA key must be at least ${MIN_RSA_BITS} bits`);
  }
  const verify = createVerify('RSA-SHA256');
  verify.update(parsed.signingInput);
  verify.end();
  if (!verify.verify(publicKey, parsed.signature)) {
    throw new Error('JWT signature verification failed');
  }
  return jwk as Record<string, unknown>;
}

function verifyHs256Jwt(raw: unknown, secret: string, fieldName: string): ParsedJwt {
  const parsed = parseJwt(raw, fieldName);
  if (parsed.header.typ !== STATION_TOKEN_TYP || parsed.header.alg !== 'HS256') {
    throw new Error('Expected HS256 station token');
  }
  const expected = createHmac('sha256', secret).update(parsed.signingInput).digest();
  if (!expected.equals(parsed.signature)) {
    throw new Error('Station token signature verification failed');
  }
  return parsed;
}

export function verifyAuthRequest(
  request: AuthRequest,
  authSecret: string,
  audience?: string,
): StationSessionAuth {
  const stationTokenRaw = requireJwtString(request.stationToken, 'AUTH.stationToken');
  const proofRaw = requireJwtString(request.proof, 'AUTH.proof');
  const stationToken = verifyHs256Jwt(stationTokenRaw, authSecret, 'AUTH.stationToken');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const resolvedAudience = audience ?? stationToken.payload.aud;
  if (typeof resolvedAudience !== 'string' || resolvedAudience.length === 0) {
    throw new Error('Station token missing aud');
  }
  if (stationToken.payload.aud !== resolvedAudience) {
    throw new Error('Station token aud mismatch');
  }
  if (typeof stationToken.payload.exp === 'number' && stationToken.payload.exp < nowSeconds) {
    throw new Error('Station token expired');
  }
  if (typeof stationToken.payload.sub !== 'string') {
    throw new Error('Station token missing sub');
  }
  if (typeof stationToken.payload.principal_id !== 'string') {
    throw new Error('Station token missing principal_id');
  }
  if (typeof stationToken.payload.cnf?.jkt !== 'string') {
    throw new Error('Station token missing cnf.jkt');
  }
  if (stationToken.payload.sub !== stationToken.payload.principal_id) {
    throw new Error('Station token sub must match principal_id');
  }

  const proof = parseJwt(proofRaw, 'AUTH.proof');
  const jwk = verifyRs256Jwt(proof, STATION_PROOF_TYP);
  assertRecent(proof.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
  if (proof.payload.aud !== resolvedAudience) {
    throw new Error('Station proof aud mismatch');
  }
  if (proof.payload.action !== 'AUTH') {
    throw new Error('Station proof action must be AUTH');
  }
  if (proof.payload.req_hash !== requestProofHash({
    type: 'AUTH',
    stationToken: stationTokenRaw,
  })) {
    throw new Error('Station proof req_hash mismatch');
  }
  if (proof.payload.ath !== createHash('sha256').update(stationTokenRaw).digest('base64url')) {
    throw new Error('Station proof ath mismatch');
  }
  if (jwkThumbprint(jwk) !== stationToken.payload.cnf.jkt) {
    throw new Error('Station proof key does not match station token binding');
  }
  if (typeof proof.payload.sub === 'string' && proof.payload.sub !== stationToken.payload.sub) {
    throw new Error('Station proof sub mismatch');
  }

  return {
    senderId: stationToken.payload.sub,
    principalId: stationToken.payload.principal_id,
    stationToken: stationTokenRaw,
    jkt: stationToken.payload.cnf.jkt,
    audience: resolvedAudience,
    spaceId: typeof stationToken.payload.space_id === 'string' ? stationToken.payload.space_id : undefined,
  };
}

export function verifyPerMessageProof(
  session: StationSessionAuth,
  proof: string | undefined,
  request: ScanRequest | AuthenticatedITPMessage,
  audience: string = defaultStationAudience(),
): void {
  const proofRaw = requireJwtString(proof, `${request.type}.proof`);
  const parsed = parseJwt(proofRaw, `${request.type}.proof`);
  const jwk = verifyRs256Jwt(parsed, STATION_PROOF_TYP);
  const nowSeconds = Math.floor(Date.now() / 1000);
  assertRecent(parsed.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
  if (parsed.payload.aud !== audience) {
    throw new Error('Station proof aud mismatch');
  }
  const action = request.type === 'SCAN' ? 'SCAN' : request.type;
  if (parsed.payload.action !== action) {
    throw new Error(`Station proof action must be ${action}`);
  }
  const requestSansProof = { ...request };
  delete (requestSansProof as Partial<typeof requestSansProof>).proof;
  const expectedReqHash = requestProofHash(requestSansProof);
  if (parsed.payload.req_hash !== expectedReqHash) {
    throw new Error(`Station proof req_hash mismatch (expected ${expectedReqHash}, got ${String(parsed.payload.req_hash)})`);
  }
  if (parsed.payload.ath !== createHash('sha256').update(session.stationToken).digest('base64url')) {
    throw new Error('Station proof ath mismatch');
  }
  if (jwkThumbprint(jwk) !== session.jkt) {
    throw new Error('Station proof key does not match authenticated session');
  }
  if (request.type !== 'SCAN' && request.senderId !== session.senderId) {
    throw new Error('ITP senderId does not match authenticated session identity');
  }
}
