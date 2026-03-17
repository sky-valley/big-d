import { randomUUID } from 'crypto';
import {
  InMemoryLocalAutonomyAdapter,
} from './local-autonomy.ts';
import {
  InMemoryThreadPathProjector,
} from './thread-projector.ts';
import type {
  IntentSpaceProjectionAdapter,
  JsonDict,
  LocalAutonomyAdapter,
  MoveResult,
  SemanticMove,
  ThreadContext,
  ThreadPathProjector,
  ThreadState,
  WaitResult,
} from './types.ts';

export interface PromiseSessionRuntimeOptions {
  agentId: string;
  localAutonomy?: LocalAutonomyAdapter;
  projection: IntentSpaceProjectionAdapter;
  threadProjector?: ThreadPathProjector;
}

export class PromiseSessionRuntime {
  private readonly localAutonomy: LocalAutonomyAdapter;
  private readonly projection: IntentSpaceProjectionAdapter;
  private readonly threadProjector: ThreadPathProjector;
  readonly agentId: string;

  constructor(opts: PromiseSessionRuntimeOptions) {
    this.agentId = opts.agentId;
    this.localAutonomy = opts.localAutonomy ?? new InMemoryLocalAutonomyAdapter(opts.agentId);
    this.projection = opts.projection;
    this.threadProjector = opts.threadProjector ?? new InMemoryThreadPathProjector();
  }

  upsertThread(context: ThreadContext): void {
    this.threadProjector.upsertThread(context);
  }

  getThreadState(threadId: string): ThreadState {
    return this.threadProjector.deriveState({
      threadId,
      myAgentId: this.agentId,
      desireRefs: this.localAutonomy.readThreadDesire(threadId),
      authorityRefs: this.localAutonomy.readThreadAuthority(threadId),
      projectionRefs: [],
    });
  }

  async expressIntent(threadId: string, content: string, payload: JsonDict = {}): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'INTENT', content, payload });
  }

  async offerPromise(
    threadId: string,
    content: string,
    payload: JsonDict = {},
    promiseId?: string,
    intentId?: string,
  ): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'PROMISE', content, payload, promiseId, intentId });
  }

  async decline(
    threadId: string,
    reason: string,
    payload: JsonDict = {},
    intentId?: string,
  ): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'DECLINE', reason, payload, intentId });
  }

  async accept(threadId: string, promiseId: string): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'ACCEPT', promiseId });
  }

  async assess(
    threadId: string,
    promiseId: string,
    assessment: 'FULFILLED' | 'PARTIAL' | 'BROKEN' | 'UNKNOWN',
    payload: JsonDict = {},
  ): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'ASSESS', promiseId, assessment, payload });
  }

  async complete(threadId: string, promiseId: string, summary: string, payload: JsonDict = {}): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'COMPLETE', promiseId, summary, payload });
  }

  async reviseDesire(threadId: string, content: string, payload: JsonDict = {}): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'REVISE_DESIRE', content, payload });
  }

  async revisePromise(
    threadId: string,
    promiseId: string,
    content: string,
    payload: JsonDict = {},
    intentId?: string,
  ): Promise<MoveResult> {
    return this.postMove(threadId, { kind: 'REVISE_PROMISE', promiseId, content, payload, intentId });
  }

  async waitForUpdate(threadId: string, timeoutSeconds: number, since?: number): Promise<WaitResult> {
    const currentState = this.getThreadState(threadId);
    const refs = await this.projection.waitForProjection(threadId, since ?? currentState.latestCursor, timeoutSeconds);
    this.threadProjector.appendProjection(threadId, refs);
    return {
      wakeReason: refs.length > 0 ? 'new-event' : 'timeout',
      threadState: this.getThreadState(threadId),
      newProjectionEvents: refs,
      newDesireRefs: [],
      newAuthorityRefs: [],
    };
  }

  async refreshThread(threadId: string, since?: number): Promise<ThreadState> {
    const currentState = this.getThreadState(threadId);
    const refs = await this.projection.scanThreadProjection(threadId, since ?? currentState.latestCursor);
    this.threadProjector.appendProjection(threadId, refs);
    return this.getThreadState(threadId);
  }

  private async postMove(threadId: string, move: SemanticMove): Promise<MoveResult> {
    const normalizedMove = normalizeMove(move);
    const recorded = recordLocalMove(this.localAutonomy, threadId, normalizedMove);
    const projectionRefs = await this.projection.projectMove(threadId, normalizedMove);
    this.threadProjector.appendProjection(threadId, projectionRefs);
    const threadState = this.getThreadState(threadId);
    return {
      acceptedByRuntime: true,
      projectionRefs,
      desireRefs: recorded.desireRefs,
      authorityRefs: recorded.authorityRefs,
      threadState,
    };
  }
}

function recordLocalMove(localAutonomy: LocalAutonomyAdapter, threadId: string, move: SemanticMove): {
  desireRefs: ReturnType<LocalAutonomyAdapter['readThreadDesire']>;
  authorityRefs: ReturnType<LocalAutonomyAdapter['readThreadAuthority']>;
} {
  switch (move.kind) {
    case 'INTENT':
      localAutonomy.recordIntent(threadId, move.content, move.payload ?? {});
      break;
    case 'PROMISE':
      localAutonomy.recordPromise(threadId, move.content, move.promiseId, move.payload ?? {});
      break;
    case 'DECLINE':
      localAutonomy.recordDecline(threadId, move.reason, move.payload ?? {});
      break;
    case 'ACCEPT':
      localAutonomy.recordAccept(threadId, move.promiseId);
      break;
    case 'ASSESS':
      localAutonomy.recordAssess(threadId, move.promiseId, move.assessment, move.payload ?? {});
      break;
    case 'COMPLETE':
      localAutonomy.recordComplete(threadId, move.promiseId, move.summary, move.payload ?? {});
      break;
    case 'REVISE_DESIRE':
      localAutonomy.recordDesireRevision(threadId, move.content, move.payload ?? {});
      break;
    case 'REVISE_PROMISE':
      localAutonomy.recordPromiseRevision(threadId, move.promiseId, move.content, move.payload ?? {});
      break;
  }
  return {
    desireRefs: localAutonomy.readThreadDesire(threadId),
    authorityRefs: localAutonomy.readThreadAuthority(threadId),
  };
}

function normalizeMove(move: SemanticMove): SemanticMove {
  if (move.kind === 'PROMISE' && !move.promiseId) {
    return {
      ...move,
      promiseId: randomUUID(),
    };
  }
  return move;
}
