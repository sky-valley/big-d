/**
 * Intent Space wire protocol.
 *
 * Two message families:
 *   1. Stored ITP messages — persisted, echoed to all
 *   2. SCAN queries — private reads, client-to-space, not persisted
 */

import type { ITPMessage } from '@differ/itp/src/types.ts';

// ============ Stored Record ============

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

// Backward-compat alias for existing loop imports.
export type StoredIntent = StoredMessage;

// ============ Client → Server ============

export interface ScanRequest {
  type: 'SCAN';
  spaceId: string;
  since?: number;
  proof?: string;
}

export interface AuthRequest {
  type: 'AUTH';
  stationToken: string;
  proof: string;
}

export type AuthenticatedITPMessage = ITPMessage & { proof?: string };

export type ClientMessage = AuthenticatedITPMessage | ScanRequest | AuthRequest;

// ============ Server → Client ============

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

export interface AuthResult {
  type: 'AUTH_RESULT';
  senderId: string;
  spaceId?: string;
  tutorialSpaceId?: string;
  ritualGreeting?: string;
}

/** ITP message with seq attached (echoed after persist) */
export type MessageEcho = ITPMessage & { seq: number };

// Backward-compat alias for existing listeners/tests.
export type IntentEcho = MessageEcho;

export type ServerMessage = MessageEcho | ScanResult | SpaceError | AuthResult;

export interface TcpClientTarget {
  host: string;
  port: number;
  tls?: false;
}

export interface TlsClientTarget {
  host: string;
  port: number;
  tls: true;
  servername?: string;
  ca?: string | Buffer;
  cert?: string | Buffer;
  key?: string | Buffer;
  rejectUnauthorized?: boolean;
}

export type ClientTarget = string | TcpClientTarget | TlsClientTarget;
