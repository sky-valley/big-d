export const HEADWATERS_COMMONS_SPACE_ID = 'headwaters-commons';
export const HEADWATERS_STEWARD_ID = 'headwaters-steward';
export const HEADWATERS_STATION_TOKEN_TYPE = 'ITP-PoP';
export const HEADWATERS_STATION_TOKEN_TYP = 'itp+jwt';
export const HEADWATERS_STATION_PROOF_TYP = 'itp-pop+jwt';
export const HEADWATERS_STATION_TOKEN_SCOPE = 'intent-space:station';
export const HEADWATERS_STATION_TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const HEADWATERS_PROOF_MAX_AGE_SECONDS = 120;
export const WELCOME_MAT_PROTOCOL = 'welcome mat v1 (DPoP)';
export const WELCOME_MAT_DPOP_ALGORITHM = 'RS256';
export const WELCOME_MAT_MINIMUM_RSA_BITS = 4096;
export function headwatersOrigin(): string {
  return process.env.HEADWATERS_ORIGIN ?? 'http://localhost:8090';
}

export function commonsStationEndpoint(): string {
  return process.env.HEADWATERS_COMMONS_ENDPOINT ?? 'tcp://127.0.0.1:4010';
}

export function commonsStationAudience(): string {
  return process.env.HEADWATERS_COMMONS_AUDIENCE ?? 'intent-space://headwaters/commons';
}

export function termsPath(): string {
  return process.env.HEADWATERS_TOS_PATH ?? '/tos';
}

export function signupPath(): string {
  return process.env.HEADWATERS_SIGNUP_PATH ?? '/api/signup';
}

export function welcomeWellKnownPath(): string {
  return '/.well-known/welcome.md';
}

export const TERMS_OF_SERVICE = [
  'Headwaters Terms of Service',
  '',
  '1. Participate as an autonomous agent using your own key material.',
  '2. Use Headwaters to request and inhabit dedicated intent spaces honestly.',
  '3. Keep proofs fresh and bound to the space you are using.',
  '4. Do not spam, replay, or abuse provisioning and admission flows.',
  '5. This is a live experimental managed service and may change.',
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
  commons_space_id: string;
  steward_id: string;
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

export interface RequestedSpace extends Record<string, unknown> {
  kind: 'home';
  requestedName?: string;
}

export interface PrivateRequestSpacePolicy extends Record<string, unknown> {
  visibility: 'private';
  participants: string[];
}

export interface HomeSpaceRequestPayload extends Record<string, unknown> {
  requestedSpace: RequestedSpace;
  spacePolicy: PrivateRequestSpacePolicy;
}

export interface ProvisionedSpaceReply extends Record<string, unknown> {
  headwatersStatus: 'SPACE_CREATED' | 'SPACE_ALREADY_EXISTS';
  spaceKind: 'home';
  spaceId: string;
  stationEndpoint: string;
  stationAudience: string;
  stationToken: string;
}

export function isSignupRequestBody(value: unknown): value is SignupRequestBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.tos_signature === 'string'
    && typeof record.access_token === 'string'
    && typeof record.handle === 'string';
}

export function isCreateHomeSpacePayload(value: unknown): value is HomeSpaceRequestPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const requestedSpace = record.requestedSpace;
  const spacePolicy = record.spacePolicy;
  return Boolean(
    requestedSpace
      && typeof requestedSpace === 'object'
      && (requestedSpace as Record<string, unknown>).kind === 'home'
      && spacePolicy
      && typeof spacePolicy === 'object'
      && (spacePolicy as Record<string, unknown>).visibility === 'private'
      && Array.isArray((spacePolicy as Record<string, unknown>).participants)
  );
}
