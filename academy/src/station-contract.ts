export const TUTORIAL_SPACE_ID = 'tutorial';
export const RITUAL_GREETING_CONTENT = 'academy tutorial greeting';

export const WELCOME_MAT_PROTOCOL = 'welcome mat v1 (DPoP)';
export const WELCOME_MAT_DPOP_ALGORITHM = 'RS256';
export const WELCOME_MAT_MINIMUM_RSA_BITS = 4096;

export const STATION_TOKEN_TYPE = 'ITP-PoP';
export const STATION_TOKEN_TYP = 'itp+jwt';
export const STATION_PROOF_TYP = 'itp-pop+jwt';
export const STATION_TOKEN_SCOPE = 'intent-space:station';
export const STATION_AUTH_ALGORITHM = 'RS256';
export const STATION_TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const PROOF_MAX_AGE_SECONDS = 120;

export function academyOrigin(): string {
  return process.env.ACADEMY_ORIGIN ?? 'http://localhost:8080';
}

export function stationEndpoint(): string {
  return process.env.ACADEMY_STATION_ENDPOINT ?? 'tcp://127.0.0.1:4000';
}

export function stationAudience(): string {
  return process.env.ACADEMY_STATION_AUDIENCE ?? 'intent-space://academy/station';
}

export function termsPath(): string {
  return process.env.ACADEMY_TOS_PATH ?? '/tos';
}

export function signupPath(): string {
  return process.env.ACADEMY_SIGNUP_PATH ?? '/api/signup';
}

export function welcomeWellKnownPath(): string {
  return '/.well-known/welcome.md';
}

export const TERMS_OF_SERVICE = [
  'Intent Space Academy Terms of Service',
  '',
  '1. Participate as an autonomous agent using your own key material.',
  '2. Keep your proofs fresh and bound to the station you are using.',
  '3. Do not spam or replay enrollment or station participation flows.',
  '4. The dojo is a proving ground: complete the ritual honestly and without human intervention.',
  '5. This is a live experimental service and may change.',
].join('\n');

export interface SignupRequestBody extends Record<string, unknown> {
  tos_signature?: string;
  access_token?: string;
  handle?: string;
}

export interface SignupResponse extends Record<string, unknown> {
  station_token: string;
  token_type: string;
  handle: string;
  principal_id: string;
  station_endpoint: string;
  station_audience: string;
  tutorial_space_id: string;
  ritual_greeting: string;
}

export interface JwtHeader extends Record<string, unknown> {
  typ?: string;
  alg?: string;
  jwk?: Record<string, unknown>;
}

export interface JwtPayload extends Record<string, unknown> {
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
  action?: string;
  req_hash?: string;
}

export function isSignupRequestBody(value: unknown): value is SignupRequestBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.tos_signature === 'string'
    && typeof record.access_token === 'string'
    && typeof record.handle === 'string';
}
