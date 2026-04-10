export interface Env {
  CONTROL: DurableObjectNamespace;
  SPACES: DurableObjectNamespace;
  GOOGLE_ANALYTICS_ID?: string;
  GOOGLE_SITE_VERIFICATION?: string;
}

export interface PreparedSpaceRecord {
  spaceId: string;
  status: 'prepared' | 'claimed';
  kind?: 'prepared-space' | 'home-space';
  intendedAgentLabel: string;
  claimToken: string;
  createdAt: string;
  claimPath: string;
  bundlePath: string;
  claimServiceUrl: string;
  claimWelcomeUrl: string;
  claimSignupUrl: string;
  audience: string;
  claimedAt?: string;
  handle?: string;
  principalId?: string;
}

export interface HostedSpaceRecord {
  spaceId: string;
  status: 'prepared' | 'claimed';
  kind?: 'commons' | 'prepared-space' | 'home-space' | 'shared-space';
  intendedAgentLabel: string;
  createdAt: string;
  stewardId: string;
  serviceIntentId: string;
  serviceIntentContent: string;
  audience: string;
  participantPrincipalIds?: string[];
  handle?: string;
  principalId?: string;
}

export interface SpaceBundle extends PreparedSpaceRecord {
  origin: string;
}

export interface SpaceProvisionBundle extends SpaceBundle {
  requestedByPrincipalId: string;
  requestedByHandle: string;
  sourceIntentId: string;
}

export interface StoredMessage {
  type: string;
  intentId?: string;
  promiseId?: string;
  parentId: string;
  senderId: string;
  payload: Record<string, unknown>;
  seq: number;
  timestamp: number;
}

export interface ScanRequest {
  type: 'SCAN';
  spaceId: string;
  since?: number;
}

export interface ScanResult {
  type: 'SCAN_RESULT';
  spaceId: string;
  messages: StoredMessage[];
  latestSeq: number;
}

export interface SpaceError {
  type: 'ERROR';
  message: string;
}

export interface MessageEcho extends StoredMessage {}

export type ServerMessage = MessageEcho | ScanResult | SpaceError;

export interface SignupRequestBody extends Record<string, unknown> {
  tos_signature?: string;
  access_token?: string;
  handle?: string;
}

export interface SignupBodyValidationError extends Record<string, unknown> {
  error: 'invalid_signup_body' | 'missing_field' | 'invalid_field_type';
  field?: 'tos_signature' | 'access_token' | 'handle';
  expected?: 'string';
  reason?: 'expected_json_object' | 'malformed_json';
}

export interface SignupProtocolError extends Record<string, unknown> {
  error:
    | 'missing_dpop_header'
    | 'malformed_dpop_proof'
    | 'invalid_dpop_proof'
    | 'invalid_dpop_claim'
    | 'malformed_access_token'
    | 'invalid_access_token_header'
    | 'invalid_access_token_signature'
    | 'invalid_access_token_claim'
    | 'invalid_tos_signature'
    | 'invalid_handle';
  field?: 'dpop' | 'access_token' | 'tos_signature' | 'handle';
  claim?: 'typ' | 'alg' | 'jwk' | 'iat' | 'htm' | 'htu' | 'aud' | 'cnf.jkt' | 'tos_hash';
  expected?: string;
  detail?: string;
  hint?: string;
}

export interface SignupResponse extends Record<string, unknown> {
  station_token: string;
  token_type: string;
  handle: string;
  principal_id: string;
  station_origin: string;
  station_audience: string;
  continue_endpoint: string;
  itp_endpoint: string;
  scan_endpoint: string;
  stream_endpoint: string;
  space_id: string;
}

export interface StationSession {
  tokenHash: string;
  principalId: string;
  handle: string;
  jkt: string;
  audience: string;
  spaceId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface StationPrincipalBinding {
  principalId: string;
  handle: string;
  jkt: string;
}

export interface ProvisioningRequestRecord {
  intentId: string;
  promiseId: string;
  requestedByPrincipalId: string;
  requestedByHandle: string;
  requestedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  bundle?: SpaceProvisionBundle;
}

export interface HttpRequestAuth {
  senderId: string;
  principalId: string;
  handle: string;
  stationToken: string;
  jkt: string;
  audience: string;
}

export interface SpaceBootstrapInput {
  spaceId: string;
  intendedAgentLabel: string;
  status: 'prepared' | 'claimed';
  createdAt: string;
  audience: string;
  kind?: 'commons' | 'prepared-space' | 'home-space' | 'shared-space';
  serviceIntentContent?: string;
  participantPrincipalIds?: string[];
}

export interface ProvisionSpaceRequest {
  origin: string;
  intendedAgentLabel: string;
  requestedByPrincipalId: string;
  requestedByHandle: string;
  sourceIntentId: string;
}

export interface PrincipalHomeRecord {
  principalId: string;
  handle: string;
  homeSpaceId: string;
  jkt: string;
}

export interface SharedSpaceAccessMaterial {
  stationToken: string;
  audience: string;
  itpEndpoint: string;
  scanEndpoint: string;
  streamEndpoint: string;
  spaceId: string;
}

export interface SharedSpaceDeliveryObligation {
  obligationId: string;
  sharedSpaceId: string;
  participantPrincipalId: string;
  participantHandle: string;
  homeSpaceId: string;
  requesterPrincipalId: string;
  participantPrincipalIds: string[];
  invitationIntentId: string;
  access: SharedSpaceAccessMaterial;
  deliveredAt?: string;
}

export interface SharedSpaceRecord {
  spaceId: string;
  status: 'claimed';
  kind: 'shared-space';
  createdAt: string;
  requestedByPrincipalId: string;
  requestedByHandle: string;
  sourceIntentId: string;
  participantPrincipalIds: string[];
  audience: string;
}

export interface SharedSpaceProvisionBundle {
  origin: string;
  sharedSpaceId: string;
  participantPrincipalIds: string[];
  requesterPrincipalId: string;
  invitationCount: number;
}

export interface SharedSpaceRequestRecord {
  intentId: string;
  promiseId: string;
  requestedByPrincipalId: string;
  requestedByHandle: string;
  participantPrincipalIds: string[];
  requestedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  bundle?: SharedSpaceProvisionBundle;
}
