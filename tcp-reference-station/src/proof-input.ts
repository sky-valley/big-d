import { createHash } from 'crypto';
import type { AuthenticatedITPMessage, AuthRequest, ScanRequest } from './types.ts';
import { canonicalProofBytes, type FramedMessage } from './framing.ts';

type ProofBoundRequest =
  | Pick<AuthRequest, 'type' | 'stationToken'>
  | Pick<ScanRequest, 'type' | 'spaceId' | 'since'>
  | Omit<AuthenticatedITPMessage, 'proof'>;

export function requestProofHash(value: ProofBoundRequest): string {
  return createHash('sha256').update(canonicalProofInput(value)).digest('base64url');
}

export function canonicalProofInput(value: ProofBoundRequest): Buffer {
  return canonicalProofBytes(proofInputFrame(value));
}

function proofInputFrame(value: ProofBoundRequest): FramedMessage {
  if (value.type === 'AUTH') {
    return {
      verb: 'AUTH',
      headers: {
        'station-token': value.stationToken,
      },
      body: Buffer.alloc(0),
    };
  }

  if (value.type === 'SCAN') {
    return {
      verb: 'SCAN',
      headers: {
        space: value.spaceId,
        since: String(value.since ?? 0),
      },
      body: Buffer.alloc(0),
    };
  }

  return {
    verb: value.type,
    headers: withOptional({
      sender: value.senderId,
      parent: value.parentId,
      intent: value.intentId,
      promise: value.promiseId,
      timestamp: String(value.timestamp),
      'payload-hint': 'application/json',
    }),
    body: Buffer.from(JSON.stringify(value.payload ?? {}), 'utf8'),
  };
}

function withOptional(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value != null),
  ) as Record<string, string>;
}
