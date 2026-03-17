import type {
  AuthorityRef,
  DesireRef,
  OpenCommitment,
  ProjectionRef,
  ThreadContext,
  ThreadPathProjector,
  ThreadState,
} from './types.ts';

interface InternalThreadContext {
  role: ThreadState['role'];
  summary: string;
  rawStateHints: Record<string, unknown>;
  pathSpaces: ThreadState['pathSpaces'];
  pendingDecisions: ThreadState['pendingDecisions'];
  projectionRefs: ProjectionRef[];
}

export class InMemoryThreadPathProjector implements ThreadPathProjector {
  private readonly contexts = new Map<string, InternalThreadContext>();

  upsertThread(context: ThreadContext): void {
    const existing = this.contexts.get(context.threadId);
    this.contexts.set(context.threadId, {
      role: context.role ?? existing?.role ?? 'observer',
      summary: context.summary ?? existing?.summary ?? `Thread ${context.threadId}`,
      rawStateHints: {
        ...(existing?.rawStateHints ?? {}),
        ...(context.rawStateHints ?? {}),
      },
      pathSpaces: [...(context.pathSpaces ?? existing?.pathSpaces ?? [])],
      pendingDecisions: [...(context.pendingDecisions ?? existing?.pendingDecisions ?? [])],
      projectionRefs: [...(existing?.projectionRefs ?? [])],
    });
  }

  appendProjection(threadId: string, refs: ReadonlyArray<ProjectionRef>): void {
    const context = this.contexts.get(threadId) ?? {
      role: 'observer' as const,
      summary: `Thread ${threadId}`,
      rawStateHints: {},
      pathSpaces: [],
      pendingDecisions: [],
      projectionRefs: [],
    };
    context.projectionRefs.push(...refs);
    this.contexts.set(threadId, context);
  }

  deriveState(input: {
    threadId: string;
    myAgentId: string;
    desireRefs: ReadonlyArray<DesireRef>;
    authorityRefs: ReadonlyArray<AuthorityRef>;
    projectionRefs: ReadonlyArray<ProjectionRef>;
  }): ThreadState {
    const context = this.contexts.get(input.threadId) ?? {
      role: 'observer' as const,
      summary: `Thread ${input.threadId}`,
      rawStateHints: {},
      pathSpaces: [],
      pendingDecisions: [],
      projectionRefs: [],
    };
    const combinedProjectionRefs = [...context.projectionRefs, ...input.projectionRefs];
    const uniqueProjectionRefs = dedupeProjectionRefs(combinedProjectionRefs);
    const latestCursor = uniqueProjectionRefs.reduce((max, ref) => Math.max(max, ref.seq), 0);
    const commitmentMap = new Map<string, OpenCommitment>();
    for (const ref of input.authorityRefs) {
      const existing = commitmentMap.get(ref.promiseId);
      commitmentMap.set(ref.promiseId, {
        promiseId: ref.promiseId,
        promiserId: ref.ownerId,
        summary: ref.summary,
        status: ref.status === 'completed' ? 'completed' : ref.status === 'assessed' ? 'assessed' : 'open',
        authorityRef: ref,
        projectionRefs: existing?.projectionRefs ?? [],
      });
    }
    for (const ref of uniqueProjectionRefs) {
      const promiseId = ref.atomType === 'PROMISE' || ref.atomType === 'COMPLETE' || ref.atomType === 'ACCEPT' || ref.atomType === 'ASSESS'
        ? ref.atomId
        : undefined;
      if (!promiseId) continue;
      const existing = commitmentMap.get(promiseId);
      if (!existing) continue;
      existing.projectionRefs = [...existing.projectionRefs, ref];
    }

    return {
      threadId: input.threadId,
      myAgentId: input.myAgentId,
      role: context.role,
      summary: context.summary,
      latestCursor,
      pathSpaces: context.pathSpaces,
      pendingDecisions: context.pendingDecisions,
      openCommitments: [...commitmentMap.values()],
      latestProjectionEvents: uniqueProjectionRefs.slice(-10),
      authorityRefs: [...input.authorityRefs],
      desireRefs: [...input.desireRefs],
      rawStateHints: { ...context.rawStateHints },
    };
  }
}

function dedupeProjectionRefs(refs: ReadonlyArray<ProjectionRef>): ProjectionRef[] {
  const seen = new Set<string>();
  const out: ProjectionRef[] = [];
  for (const ref of refs) {
    const key = `${ref.seq}:${ref.atomType}:${ref.atomId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
