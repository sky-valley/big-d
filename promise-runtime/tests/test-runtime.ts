import { strict as assert } from 'assert';
import { PromiseSessionRuntime } from '../src/runtime.ts';
import { InMemoryThreadPathProjector } from '../src/thread-projector.ts';
import { InMemoryLocalAutonomyAdapter } from '../src/local-autonomy.ts';
import type {
  IntentSpaceProjectionAdapter,
  ProjectionRef,
  SemanticMove,
  SpaceRef,
} from '../src/types.ts';

class FakeProjectionAdapter implements IntentSpaceProjectionAdapter {
  private seq = 0;
  private readonly projections = new Map<string, ProjectionRef[]>();

  constructor(private readonly resolveSpaces: (threadId: string) => ReadonlyArray<SpaceRef>) {}

  async projectMove(threadId: string, move: SemanticMove): Promise<ProjectionRef[]> {
    const spaceId = this.resolveSpaces(threadId).at(-1)?.spaceId ?? threadId;
    const next: ProjectionRef = {
      atomType: move.kind,
      atomId: ('promiseId' in move && move.promiseId) ? move.promiseId : `${move.kind.toLowerCase()}-${this.seq + 1}`,
      spaceId,
      parentId: spaceId,
      senderId: 'tester',
      seq: ++this.seq,
      summary: 'content' in move ? move.content : 'reason' in move ? move.reason : move.kind,
    };
    const refs = this.projections.get(threadId) ?? [];
    refs.push(next);
    this.projections.set(threadId, refs);
    return [next];
  }

  async scanThreadProjection(threadId: string, since: number): Promise<ProjectionRef[]> {
    return (this.projections.get(threadId) ?? []).filter((ref) => ref.seq > since);
  }

  async waitForProjection(threadId: string, since: number): Promise<ProjectionRef[]> {
    return this.scanThreadProjection(threadId, since);
  }
}

async function main(): Promise<void> {
  const projector = new InMemoryThreadPathProjector();
  const resolveSpaces = (threadId: string): ReadonlyArray<SpaceRef> => projector
    .deriveState({
      threadId,
      myAgentId: 'tester',
      desireRefs: [],
      authorityRefs: [],
      projectionRefs: [],
    }).pathSpaces;
  const projection = new FakeProjectionAdapter(resolveSpaces);
  const runtime = new PromiseSessionRuntime({
    agentId: 'tester',
    localAutonomy: new InMemoryLocalAutonomyAdapter('tester'),
    projection,
    threadProjector: projector,
  });

  runtime.upsertThread({
    threadId: 'registration-thread',
    role: 'requester',
    summary: 'Registration negotiation',
    pathSpaces: [
      { spaceId: 'registration', relation: 'origin', summary: 'Registration root' },
      { spaceId: 'registration-thread', relation: 'entered', summary: 'Registration subspace' },
    ],
  });

  const intentResult = await runtime.expressIntent('registration-thread', 'I want to register', { challenge: false });
  assert.equal(intentResult.desireRefs.length, 1);
  assert.equal(intentResult.projectionRefs[0]?.spaceId, 'registration-thread');

  const promiseResult = await runtime.offerPromise('registration-thread', 'I will verify your registration', {}, 'promise-1');
  assert.equal(promiseResult.authorityRefs.at(-1)?.promiseId, 'promise-1');

  const acceptResult = await runtime.accept('registration-thread', 'promise-1');
  assert.equal(acceptResult.threadState.openCommitments.some((commitment) => commitment.promiseId === 'promise-1'), true);

  await runtime.complete('registration-thread', 'promise-1', 'Verification complete');
  const assessed = await runtime.assess('registration-thread', 'promise-1', 'FULFILLED');
  assert.equal(assessed.threadState.authorityRefs.at(-1)?.status, 'assessed');

  runtime.upsertThread({
    threadId: 'tutorial-thread',
    role: 'mixed',
    summary: 'Tutorial negotiation',
    pathSpaces: [
      { spaceId: 'tutorial', relation: 'origin', summary: 'Tutorial root' },
      { spaceId: 'tutorial-greeting', relation: 'entered', summary: 'Greeting subspace' },
      { spaceId: 'tutorial-promise', relation: 'delegated', summary: 'Promise subspace' },
    ],
  });

  await runtime.expressIntent('tutorial-thread', 'Teach me the ritual');
  await runtime.reviseDesire('tutorial-thread', 'Teach me the ritual clearly');
  await runtime.offerPromise('tutorial-thread', 'I will guide you', {}, 'promise-2');
  await runtime.revisePromise('tutorial-thread', 'promise-2', 'I will guide you after correction');

  const tutorialState = await runtime.refreshThread('tutorial-thread', 0);
  assert.equal(tutorialState.pathSpaces.length, 3);
  assert.equal(tutorialState.desireRefs.length, 2);
  assert.equal(tutorialState.authorityRefs.some((ref) => ref.promiseId === 'promise-2'), true);

  const waited = await runtime.waitForUpdate('tutorial-thread', 0.01, tutorialState.latestCursor);
  assert.equal(waited.wakeReason, 'timeout');

  console.log('promise-runtime: synthetic tests passed');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
