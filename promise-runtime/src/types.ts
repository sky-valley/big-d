export type JsonDict = Record<string, unknown>;
export type AssessmentValue = 'FULFILLED' | 'PARTIAL' | 'BROKEN' | 'UNKNOWN';
export type MoveKind =
  | 'INTENT'
  | 'PROMISE'
  | 'DECLINE'
  | 'ACCEPT'
  | 'ASSESS'
  | 'REVISE_DESIRE'
  | 'REVISE_PROMISE'
  | 'COMPLETE'
  | 'WAIT';
export type WakeReason = 'new-event' | 'timeout' | 'interrupted';

export interface SpaceRef {
  spaceId: string;
  relation: 'origin' | 'entered' | 'delegated' | 'projected' | 'authority-shadow';
  summary: string;
}

export interface ProjectionRef {
  atomType: string;
  atomId: string;
  spaceId: string;
  parentId: string;
  senderId: string;
  seq: number;
  summary: string;
}

export interface AuthorityRef {
  recordId: string;
  promiseId: string;
  ownerId: string;
  summary: string;
  status: 'open' | 'completed' | 'assessed' | 'released' | 'broken';
}

export interface DesireRef {
  recordId: string;
  desireId: string;
  ownerId: string;
  summary: string;
  status: 'active' | 'revised' | 'withdrawn' | 'satisfied' | 'superseded';
}

export interface PendingDecision {
  decisionId: string;
  summary: string;
  allowedMoves: ReadonlyArray<MoveKind>;
  projectionRefs: ReadonlyArray<ProjectionRef>;
  authorityRefs: ReadonlyArray<AuthorityRef>;
  desireRefs: ReadonlyArray<DesireRef>;
  notes?: string;
}

export interface OpenCommitment {
  promiseId: string;
  promiserId: string;
  summary: string;
  status: 'open' | 'completed' | 'assessed';
  authorityRef?: AuthorityRef;
  projectionRefs: ReadonlyArray<ProjectionRef>;
}

export interface ThreadState {
  threadId: string;
  myAgentId: string;
  role: 'requester' | 'promiser' | 'observer' | 'mixed';
  summary: string;
  latestCursor: number;
  pathSpaces: ReadonlyArray<SpaceRef>;
  pendingDecisions: ReadonlyArray<PendingDecision>;
  openCommitments: ReadonlyArray<OpenCommitment>;
  latestProjectionEvents: ReadonlyArray<ProjectionRef>;
  authorityRefs: ReadonlyArray<AuthorityRef>;
  desireRefs: ReadonlyArray<DesireRef>;
  rawStateHints: JsonDict;
}

export interface MoveResult {
  acceptedByRuntime: boolean;
  projectionRefs: ReadonlyArray<ProjectionRef>;
  desireRefs: ReadonlyArray<DesireRef>;
  authorityRefs: ReadonlyArray<AuthorityRef>;
  threadState: ThreadState;
  notes?: string;
}

export interface WaitResult {
  wakeReason: WakeReason;
  threadState: ThreadState;
  newProjectionEvents: ReadonlyArray<ProjectionRef>;
  newDesireRefs: ReadonlyArray<DesireRef>;
  newAuthorityRefs: ReadonlyArray<AuthorityRef>;
}

export interface IntentMove {
  kind: 'INTENT';
  content: string;
  payload?: JsonDict;
}

export interface PromiseMove {
  kind: 'PROMISE';
  content: string;
  intentId?: string;
  promiseId?: string;
  payload?: JsonDict;
}

export interface DeclineMove {
  kind: 'DECLINE';
  reason: string;
  intentId?: string;
  payload?: JsonDict;
}

export interface AcceptMove {
  kind: 'ACCEPT';
  promiseId: string;
}

export interface AssessMove {
  kind: 'ASSESS';
  promiseId: string;
  assessment: AssessmentValue;
  payload?: JsonDict;
}

export interface CompleteMove {
  kind: 'COMPLETE';
  promiseId: string;
  summary: string;
  payload?: JsonDict;
}

export interface ReviseDesireMove {
  kind: 'REVISE_DESIRE';
  content: string;
  payload?: JsonDict;
}

export interface RevisePromiseMove {
  kind: 'REVISE_PROMISE';
  content: string;
  promiseId: string;
  intentId?: string;
  payload?: JsonDict;
}

export type SemanticMove =
  | IntentMove
  | PromiseMove
  | DeclineMove
  | AcceptMove
  | AssessMove
  | CompleteMove
  | ReviseDesireMove
  | RevisePromiseMove;

export interface ThreadContext {
  threadId: string;
  role?: ThreadState['role'];
  summary?: string;
  rawStateHints?: JsonDict;
  pathSpaces?: ReadonlyArray<SpaceRef>;
  pendingDecisions?: ReadonlyArray<PendingDecision>;
}

export interface LocalAutonomyAdapter {
  recordIntent(threadId: string, content: string, payload: JsonDict): DesireRef[];
  recordPromise(threadId: string, content: string, promiseId: string | undefined, payload: JsonDict): AuthorityRef[];
  recordDecline(threadId: string, reason: string, payload: JsonDict): AuthorityRef[];
  recordAccept(threadId: string, promiseId: string): AuthorityRef[];
  recordAssess(
    threadId: string,
    promiseId: string,
    assessment: AssessmentValue,
    payload: JsonDict,
  ): AuthorityRef[];
  recordComplete(threadId: string, promiseId: string, summary: string, payload: JsonDict): AuthorityRef[];
  recordDesireRevision(threadId: string, content: string, payload: JsonDict): DesireRef[];
  recordPromiseRevision(
    threadId: string,
    promiseId: string,
    content: string,
    payload: JsonDict,
  ): AuthorityRef[];
  readThreadDesire(threadId: string): DesireRef[];
  readThreadAuthority(threadId: string): AuthorityRef[];
}

export interface IntentSpaceProjectionAdapter {
  projectMove(threadId: string, move: SemanticMove): Promise<ProjectionRef[]>;
  scanThreadProjection(threadId: string, since: number): Promise<ProjectionRef[]>;
  waitForProjection(threadId: string, since: number, timeoutSeconds: number): Promise<ProjectionRef[]>;
}

export interface ThreadPathProjector {
  upsertThread(context: ThreadContext): void;
  appendProjection(threadId: string, refs: ReadonlyArray<ProjectionRef>): void;
  deriveState(input: {
    threadId: string;
    myAgentId: string;
    desireRefs: ReadonlyArray<DesireRef>;
    authorityRefs: ReadonlyArray<AuthorityRef>;
    projectionRefs: ReadonlyArray<ProjectionRef>;
  }): ThreadState;
}
