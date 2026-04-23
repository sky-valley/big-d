/**
 * ITP Protocol Utilities — Differ Runtime
 *
 * Factory functions, state transitions, promise lifecycle tracking.
 *
 * Two entity types:
 *   Intent  — Permanent declaration. No state machine. Never transitions.
 *   Promise — Autonomous agent commitment. Has lifecycle: PROMISED → ... → FULFILLED/BROKEN.
 *
 * DECLINE does not create a promise entity. It is recorded in the message log only.
 */

import { randomUUID } from 'crypto';
import type {
  ITPMessage,
  ITPMessageType,
  PromiseState,
  PromiseRecord,
  AssessmentResult,
} from './types.ts';

// ============ Valid State Transitions ============

// Intents have no state machine — they are permanent declarations.
// Only promises have state transitions.
const TRANSITIONS: Record<PromiseState, Partial<Record<ITPMessageType, PromiseState>>> = {
  PROMISED:  { ACCEPT: 'ACCEPTED', REVISE: 'REVISED', RELEASE: 'RELEASED' },
  ACCEPTED:  { COMPLETE: 'COMPLETED', RELEASE: 'RELEASED' },
  COMPLETED: { ASSESS: 'FULFILLED' }, // ASSESS dispatches to FULFILLED or BROKEN
  DECLINED:  {},
  FULFILLED: {},
  BROKEN:    {},
  REVISED:   {},
  RELEASED:  {},
};

/** Check if a state transition is valid */
export function isValidTransition(from: PromiseState, msgType: ITPMessageType): boolean {
  return msgType in (TRANSITIONS[from] ?? {});
}

/** Get the next state after a message (or null if invalid) */
export function nextState(from: PromiseState, msg: ITPMessage): PromiseState | null {
  if (msg.type === 'ASSESS' && from === 'COMPLETED') {
    return msg.payload.assessment === 'FULFILLED' ? 'FULFILLED' : 'BROKEN';
  }
  return TRANSITIONS[from]?.[msg.type] ?? null;
}

// ============ Factory Functions ============

/** Create an INTENT — a permanent declaration of desired outcome */
export function createIntent(
  senderId: string,
  content: string,
  criteria?: string,
  targetRepo?: string,
  parentId?: string,
): ITPMessage {
  return {
    type: 'INTENT',
    intentId: randomUUID(),
    parentId: parentId ?? 'root',
    timestamp: Date.now(),
    senderId,
    payload: { content, criteria, targetRepo },
  };
}

/**
 * Create a PROMISE — an autonomous agent commitment to satisfy an intent.
 * Each promise gets its own promiseId. intentId links back to the originating intent.
 */
export function createPromise(senderId: string, intentId: string, plan?: string): ITPMessage {
  return {
    type: 'PROMISE',
    promiseId: randomUUID(),
    intentId,
    timestamp: Date.now(),
    senderId,
    payload: { content: plan },
  };
}

export function createAccept(senderId: string, promiseId: string): ITPMessage {
  return {
    type: 'ACCEPT',
    promiseId,
    timestamp: Date.now(),
    senderId,
    payload: {},
  };
}

/**
 * Create a DECLINE — recorded in the log but does NOT create a promise entity.
 *
 * Stewards must emit DECLINE on unsupported operations so callers fail loudly
 * instead of silently timing out. Use `supportedOperations` to hint which ops
 * the steward does handle.
 */
export function createDecline(
  senderId: string,
  intentId: string,
  reason: string,
  options?: { parentId?: string; supportedOperations?: string[] },
): ITPMessage {
  const payload: ITPMessage['payload'] = { reason };
  if (options?.supportedOperations) {
    payload.supportedOperations = options.supportedOperations;
  }
  return {
    type: 'DECLINE',
    intentId,
    ...(options?.parentId ? { parentId: options.parentId } : {}),
    timestamp: Date.now(),
    senderId,
    payload,
  };
}

export function createComplete(
  senderId: string,
  promiseId: string,
  summary: string,
  filesChanged?: string[],
): ITPMessage {
  return {
    type: 'COMPLETE',
    promiseId,
    timestamp: Date.now(),
    senderId,
    payload: { content: summary, summary, filesChanged },
  };
}

export function createAssess(
  senderId: string,
  promiseId: string,
  assessment: AssessmentResult,
  reason?: string,
): ITPMessage {
  return {
    type: 'ASSESS',
    promiseId,
    timestamp: Date.now(),
    senderId,
    payload: { assessment, reason },
  };
}

/**
 * Create a REVISE — creates a new promise (new promiseId) with parentId linking
 * to the previous promise being revised. intentId propagates from the original.
 */
export function createRevise(
  senderId: string,
  parentPromiseId: string,
  intentId: string,
  revisedContent: string,
): ITPMessage {
  return {
    type: 'REVISE',
    promiseId: randomUUID(),
    intentId,
    parentId: parentPromiseId,
    timestamp: Date.now(),
    senderId,
    payload: { revisedContent },
  };
}

export function createRelease(senderId: string, promiseId: string, reason?: string): ITPMessage {
  return {
    type: 'RELEASE',
    promiseId,
    timestamp: Date.now(),
    senderId,
    payload: { reason },
  };
}

// ============ Promise Record Management ============

/** Create a fresh promise record from a PROMISE message */
export function createPromiseRecord(msg: ITPMessage): PromiseRecord {
  return {
    promiseId: msg.promiseId!,
    parentId: msg.parentId,
    state: 'PROMISED',
    intentFrom: msg.senderId,
    intent: msg.payload.content ?? msg.payload.revisedContent ?? '',
    criteria: msg.payload.criteria,
    history: [msg],
    createdAt: msg.timestamp,
    updatedAt: msg.timestamp,
  };
}

/** Update a promise record based on an incoming message */
export function updatePromiseRecord(record: PromiseRecord, msg: ITPMessage): PromiseRecord {
  const next = nextState(record.state, msg);
  if (next) {
    record.state = next;
  }
  if (msg.type === 'PROMISE') {
    record.promiserTo = msg.senderId;
  }
  if (msg.type === 'COMPLETE') {
    record.completedContent = msg.payload.content;
  }
  record.history.push(msg);
  record.updatedAt = msg.timestamp;
  return record;
}
