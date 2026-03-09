/**
 * Intent Space wire protocol.
 *
 * Two message families:
 *   1. ITP INTENT messages — semantic content, persisted, echoed to all
 *   2. SCAN queries — private reads, client-to-space, not persisted
 */

import type { ITPMessage } from '@differ/itp/src/types.ts';

// ============ Stored Record ============

export interface StoredIntent {
  intentId: string;
  parentId: string;
  senderId: string;
  content: string;
  seq: number;
  timestamp: number;
}

// ============ Client → Server ============

export interface ScanRequest {
  type: 'SCAN';
  spaceId: string;
  since?: number;
}

export type ClientMessage = ITPMessage | ScanRequest;

// ============ Server → Client ============

export interface ScanResult {
  type: 'SCAN_RESULT';
  spaceId: string;
  intents: StoredIntent[];
  latestSeq: number;
}

export interface SpaceError {
  type: 'ERROR';
  message: string;
}

/** ITP INTENT with seq attached (echoed after persist) */
export type IntentEcho = ITPMessage & { seq: number };

export type ServerMessage = IntentEcho | ScanResult | SpaceError;
