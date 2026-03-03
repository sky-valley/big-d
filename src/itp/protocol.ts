/**
 * ITP Protocol Utilities — Differ Runtime
 *
 * Factory functions, state transitions, promise lifecycle tracking.
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

const TRANSITIONS: Record<PromiseState, Partial<Record<ITPMessageType, PromiseState>>> = {
  PENDING:   { PROMISE: 'PROMISED', DECLINE: 'DECLINED', RELEASE: 'RELEASED' },
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

export function createIntent(senderId: string, content: string, criteria?: string): ITPMessage {
  return {
    type: 'INTENT',
    promiseId: randomUUID(),
    timestamp: Date.now(),
    senderId,
    payload: { content, criteria },
  };
}

export function createPromise(senderId: string, promiseId: string, plan?: string): ITPMessage {
  return {
    type: 'PROMISE',
    promiseId,
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

export function createDecline(senderId: string, promiseId: string, reason: string): ITPMessage {
  return {
    type: 'DECLINE',
    promiseId,
    timestamp: Date.now(),
    senderId,
    payload: { reason },
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

export function createRevise(
  senderId: string,
  parentPromiseId: string,
  revisedContent: string,
): ITPMessage {
  return {
    type: 'REVISE',
    promiseId: randomUUID(),
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

/** Create a fresh promise record from an INTENT message */
export function createPromiseRecord(msg: ITPMessage): PromiseRecord {
  return {
    promiseId: msg.promiseId,
    parentId: msg.parentId,
    state: 'PENDING',
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
