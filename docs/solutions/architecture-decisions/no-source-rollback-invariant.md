---
title: "Source is Never Rolled Back: The No-Checkout Invariant"
date: 2026-03-05
category: architecture-decisions
tags:
  - crash-recovery
  - blue-green-deployment
  - source-integrity
  - architectural-invariant
  - supervisor
component: differ-loop-core
severity: high
symptoms: |
  Agent loses partial edits on crash. Double work when agent restarts
  after incomplete cycle. Working directory state inconsistent with
  promise log expectations.
resolution_type: bug-fix
established_in: 6fe6423
---

# Source is Never Rolled Back: The No-Checkout Invariant

## Problem

During the exoskeleton generalization (multi-repo support), `git checkout -- .` was reintroduced in crash recovery paths in both `agent.ts` and `supervisor.ts`. This violates the invariant established in commit `6fe6423` ("blue-green binary swap for supervisor") that **source code is never rolled back**.

The symptom: on agent crash, partial edits are destroyed and the agent must redo all work from scratch — double work.

## Root Cause

When rewriting `agent.ts` and `supervisor.ts` from scratch for multi-repo support, the original crash recovery pattern (check dirty working copy → `git checkout -- .`) was carried forward from the pre-blue-green era. The blue-green swap commit (`6fe6423`) had explicitly removed this, but the architectural decision wasn't preserved when the files were rewritten.

The commit message from `6fe6423` was explicit:
> "Source is never rolled back (git checkout removed entirely)"

But this knowledge lived only in git history and a header comment in the old `supervisor.ts`. When both files were fully rewritten, the invariant was lost.

## Solution

Removed `git checkout -- .` from crash recovery in both files.

### agent.ts — before (broken)

```typescript
if (mode === 'self') {
  log('Dirty working copy detected (crash recovery). Resetting...');
  execFileSync('git', ['checkout', '--', '.'], { cwd: targetDir });
} else {
  log('Target repo has uncommitted changes. Will observe but not work until clean.');
}
```

### agent.ts — after (correct)

```typescript
// Source is never rolled back — partial edits from a crash are preserved.
// The agent restarts with the same binary and can see its partial work.
// For external-mode: refuse to work on a dirty target (user's uncommitted changes).
if (mode === 'external') {
  try {
    const status = execFileSync('git', ['status', '--porcelain'],
      { cwd: targetDir, encoding: 'utf-8' });
    if (status.trim()) {
      log('Target repo has uncommitted changes. Will observe but not work until clean.');
    }
  } catch { /* not a git repo or git not available */ }
}
```

### supervisor.ts — before (broken)

```typescript
// Reset target repo if dirty (for self-mode only)
if (handle.mode === 'self') {
  try {
    const status = execFileSync('git', ['status', '--porcelain'],
      { cwd: handle.repoPath, encoding: 'utf-8' });
    if (status.trim()) {
      console.log(`Resetting dirty working copy for ${handle.name}...`);
      execFileSync('git', ['checkout', '--', '.'], { cwd: handle.repoPath });
    }
  } catch { /* ignore */ }
}
```

### supervisor.ts — after (correct)

```typescript
// Source is never rolled back. Partial edits from a crash are preserved.
// The agent restarts with the same compiled binary and can see its partial work.
```

## Why This Invariant Exists

The blue-green deployment model (`dist/current/` and `dist/previous/`) makes source rollback unnecessary:

```
Agent edits src/*.ts → commits → exits(0)
  → Supervisor snapshots dist/current → builds new → swaps in
  → If new fails to start: rollback to dist/previous (binary rollback, not source)

Agent crashes mid-work (no commit):
  → src/ has partial edits (that's fine)
  → dist/current/ still has the pre-crash binary (still good)
  → Restart agent from dist/current/ (same version, retry)
  → Agent can see its partial edits and continue from where it crashed
```

**Resetting source throws away work.** The agent already did some edits before crashing. On restart, it resumes from its promise state in the log and can observe its partial changes. This is strictly better than starting from scratch.

## Prevention

### Add to CLAUDE.md "What NOT to Do"

```markdown
- Don't roll back source via `git checkout -- .` on crash. The agent restarts
  with the same compiled binary and can see its partial edits. Resetting
  throws away work. (Established in 6fe6423.)
```

### Code comments as invariant anchors

When rewriting files that contain architectural invariants, preserve comments that cite the establishing commit:

```typescript
// INVARIANT (6fe6423): Source is NEVER rolled back.
// On crash, restart same binary — agent retries with partial src/ edits.
```

### Institutional memory via docs/solutions/

This document exists so that the next time these files are rewritten, the invariant is discoverable through a search of `docs/solutions/` — not buried in git history.

## Related Documents

- [Blue-green swap plan](../../../loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md) — original design establishing the invariant
- [Promise Theory architecture](promise-theory-informed-architecture.md) — broader architectural context
- [Exoskeleton generalization plan](../../plans/2026-03-05-feat-exoskeleton-generalization-plan.md) — the refactor where this was reintroduced
- Commit `6fe6423` — "feat: blue-green binary swap for supervisor" — establishing commit
- Commit `f006dfa` — "fix: remove git checkout -- . from crash recovery" — this fix
