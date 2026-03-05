/**
 * ITP Message Types — Differ Runtime
 *
 * Promise Theory: agents coordinate through voluntary commitments.
 *
 * Two distinct entity types:
 *   INTENT  — Permanent declaration of desired outcome. No state machine.
 *   PROMISE — Autonomous agent commitment to satisfy an intent. Has lifecycle.
 *
 * Message types:
 *   INTENT   — Declaration of desired outcome (creates an intent)
 *   PROMISE  — Voluntary commitment to satisfy intent (+b give-promise, creates a promise)
 *   ACCEPT   — Commitment to use the promised work (-b use-promise)
 *   DECLINE  — Refusal to promise (autonomous agents can say no, no promise created)
 *   COMPLETE — Claim of completion by promisor
 *   ASSESS   — Judgment of completion by promisee
 *   REVISE   — Proposal to modify an existing promise (creates new promise)
 *   RELEASE  — Graceful release from a promise
 */

// ============ ITP Protocol Types ============

export type ITPMessageType =
  | 'INTENT'
  | 'PROMISE'
  | 'ACCEPT'
  | 'DECLINE'
  | 'COMPLETE'
  | 'ASSESS'
  | 'REVISE'
  | 'RELEASE';

export type AssessmentResult = 'FULFILLED' | 'BROKEN';

export type PromiseState =
  | 'PROMISED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'COMPLETED'
  | 'FULFILLED'
  | 'BROKEN'
  | 'REVISED'
  | 'RELEASED';

export const TERMINAL_STATES: ReadonlySet<PromiseState> = new Set([
  'DECLINED',
  'FULFILLED',
  'BROKEN',
  'REVISED',
  'RELEASED',
]);

/** ITP message — the wire format */
export interface ITPMessage {
  type: ITPMessageType;
  promiseId?: string;
  intentId?: string;
  parentId?: string;
  timestamp: number;
  senderId: string;
  payload: ITPPayload;
}

export interface ITPPayload {
  content?: string;
  criteria?: string;
  reason?: string;
  assessment?: AssessmentResult;
  revisedContent?: string;
  plan?: string;
  filesChanged?: string[];
  summary?: string;
  targetRepo?: string;
}

// ============ Meta-Protocol Types ============

/** Overlay request — user submits a change request */
export interface OverlayRequest {
  type: 'OVERLAY_REQUEST';
  content: string;
  timestamp: number;
}

/** Agent status broadcast */
export interface AgentStatus {
  type: 'AGENT_STATUS';
  agentId: string;
  targetRepo?: string;
  status: 'idle' | 'observing' | 'deliberating' | 'awaiting' | 'working' | 'error';
  detail?: string;
  filesChanged?: string[];
  tokensUsed?: { input: number; output: number; cached?: number };
}

/** Reload signal — triggers browser refresh */
export interface ReloadSignal {
  type: 'RELOAD';
  timestamp: number;
}

/** Error message from the space */
export interface SpaceError {
  type: 'ERROR';
  message: string;
}

/** History replay for late-joining clients */
export interface SpaceHistory {
  type: 'SPACE_HISTORY';
  messages: SpaceMessage[];
}

/** Upstream change — developer's original project changed */
export interface UpstreamChange {
  type: 'UPSTREAM_CHANGE';
  files: Array<{
    path: string;
    action: 'modified' | 'created' | 'deleted';
    diff?: string;
    previousContent?: string;
  }>;
  timestamp: number;
}

/** Any message that flows through the space */
export type SpaceMessage =
  | ITPMessage
  | OverlayRequest
  | AgentStatus
  | ReloadSignal
  | SpaceError
  | SpaceHistory
  | UpstreamChange;

// ============ Project Context ============

/** Project understanding derived from .differ/intent.md */
export interface ProjectContext {
  name: string;
  language: string;
  description: string;
  constraints: string[];
  buildCommand?: string;
  testCommand?: string;
  projectType?: string;
  frameworks: string[];
}

// ============ Promise Record ============

/** Local promise lifecycle tracking */
export interface PromiseRecord {
  promiseId: string;
  parentId?: string;
  state: PromiseState;
  intentFrom: string;
  promiserTo?: string;
  intent: string;
  criteria?: string;
  completedContent?: string;
  history: ITPMessage[];
  createdAt: number;
  updatedAt: number;
}

// ============ Adaptation Record ============

/** Recorded adaptation for the store */
export interface AdaptationRecord {
  id: string;
  hash: string;
  intent: string;
  plan: string;
  filesChanged: string[];
  outcome: 'success' | 'rollback' | 'error';
  summary?: string;
  timestamp: number;
}
