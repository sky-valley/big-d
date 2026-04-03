import type { ITPMessage } from '@differ/itp/src/types.ts';

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

export interface PrivateSpacePolicy {
  visibility: 'private';
  participants: string[];
}

export interface StoredSpacePolicy {
  spaceId: string;
  participants: string[];
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

export type MessageEcho = ITPMessage & { seq: number };

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
}

export interface HttpRequestAuth {
  senderId: string;
  principalId: string;
  stationToken: string;
  jkt: string;
  audience: string;
}
