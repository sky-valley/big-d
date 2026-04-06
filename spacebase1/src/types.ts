export interface Env {
  CONTROL: DurableObjectNamespace;
  SPACES: DurableObjectNamespace;
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
  kind?: 'commons' | 'prepared-space' | 'home-space';
  intendedAgentLabel: string;
  createdAt: string;
  stewardId: string;
  serviceIntentId: string;
  serviceIntentContent: string;
  audience: string;
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

export interface SignupResponse extends Record<string, unknown> {
  station_token: string;
  token_type: string;
  handle: string;
  principal_id: string;
  station_origin: string;
  station_audience: string;
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
  kind?: 'commons' | 'prepared-space' | 'home-space';
  serviceIntentContent?: string;
}

export interface ProvisionSpaceRequest {
  origin: string;
  intendedAgentLabel: string;
  requestedByPrincipalId: string;
  requestedByHandle: string;
  sourceIntentId: string;
}
