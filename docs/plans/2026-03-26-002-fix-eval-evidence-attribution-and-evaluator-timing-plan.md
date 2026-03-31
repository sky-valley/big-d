---
title: "fix: Eval harness evidence attribution and evaluator intent timing"
type: fix
status: active
date: 2026-03-26
---

# fix: Eval harness evidence attribution and evaluator intent timing

## Overview

An audit of the most recent profiled swarm eval run (`evals/tmp/headwaters-agent-pack-profiled`) revealed two independent issues that undermine the harness's ability to score agent behavior:

1. **Evidence attribution is broken.** Per-agent summaries come back with empty `messages: []` and `monitoringEvents: []` because the harness filters DB records by agent handle (e.g., `claude-01`) while the DB stores principal IDs (e.g., `prn_headwaters_a3e15b35...`). This makes all orientation/coexistence/collaboration scores meaningless.

2. **The evaluator posts its recipe intent too late.** The prompt says "Observe first" which causes the evaluator to scan multiple spaces and request a home space before posting. Combined with the 120s observation delay, the recipe intent doesn't appear until ~4 minutes into a ~10 minute run.

## Fix 1: Evidence Attribution

### Root Cause

`discoverHandle()` reads `station-enrollment.json` and returns `handle` (e.g., `claude-01`). This is passed as `actorId` to `readSpaceDb()`, which filters the SQLite DB on `sender_id = ?` and `actor_id = ?`. But those DB columns contain principal IDs (`prn_headwaters_...`), never handles. Zero rows match.

### Changes — `evals/src/harness.ts`

**1. Add `discoverPrincipalId()` function** (after `discoverHandle()`, line 1016)

Same structure as `discoverHandle()` but reads `principal_id` from `station-enrollment.json`.

**2. Add `principalId` to interfaces**

- `RunningAgent` (line 75): add `principalId?: string;`
- `AgentEvidence` (line 81): add `principalId?: string;`
- `AgentRunSummary` (line 98): add `principalId?: string;`

**3. Fix participant summary building** (lines 276-316)

```typescript
// line 278-284
const handle = agent.handle ?? discoverHandle(agent.workspaceDir);
const principalId = discoverPrincipalId(agent.workspaceDir);
const evidence = await readSpaceDb({
  repoRoot: options.repoRoot,
  dbPath: stage.commonsDbPath,
  fromTs: startedAt.getTime(),
  toTs: endedAt.getTime(),
  actorId: principalId,  // was: handle
});
```

Include `principalId` in the returned summary object.

**4. Clean up `readSpaceDb()` return** (line 930)

Stop setting `handle: input.actorId` — the value is now a principal ID. Remove or rename.

**5. Fix `agentPassedCollaboration()`** (lines 1057-1065)

- Line 1058: guard on `summary.principalId` instead of `summary.handle`
- Line 1063: compare `message.sender_id` against `summary.principalId`

**6. Fix `agentPassedCoexistence()`** (line 1034)

Guard on `summary.principalId` instead of `summary.handle`.

**7. Fix `scoreCoexistence()` and `scoreCollaboration()` filters** (lines 1074, 1085)

Filter active agents by `summary.principalId` instead of `summary.handle`.

**8. Add `principalId` to agent-map.json** (lines 337-351)

Extend the map shape to `{ handle, principalId, profile }`.

**9. Fix `generateTimeline()` lookup** (lines 1093-1178)

Build `principalIdToLabel` map keyed by `principalId` instead of `handleToLabel` keyed by `handle`. Lines 1135 and 1153 resolve labels via `principalIdToLabel`.

## Fix 2: Evaluator Intent Timing

### Root Cause

The evaluator prompt (line 85) says "Observe first, then join the shared participation space correctly." The evaluator interprets this literally — scanning commons, root, steward spaces, requesting a home space — before posting the recipe intent. ~80s burned on setup.

### Changes — `evals/src/prompts/headwaters-agent-pack.ts`

Restructure `buildEvaluatorPrompt()` (lines 81-94):

```typescript
export function buildEvaluatorPrompt(basePrompt: string, intentContent: string): string {
  return [
    'You are the requester-side evaluator participant for this trial.',
    'Use the public agent pack as your procedural guide and the live service as your source of truth.',
    'Your first priority after joining the shared participation space is to post the initial requester intent.',
    'Join the commons space correctly using the agent pack enrollment procedure.',
    `Immediately after joining, post this exact initial requester intent content once: ${JSON.stringify(intentContent)}`,
    'Do not request a home space, scan other spaces, or perform extended observation before posting the intent.',
    'After posting it, stay in the space and continue participating on your own terms.',
    'You may respond to follow-up intents, promises, completions, and other collaboration moves if you judge that useful.',
    'If you choose to bind promised work, use ACCEPT correctly.',
    'If you judge claimed completion, use ASSESS correctly.',
    'Do not behave like a hidden harness fixture. Behave like the live requester behind the original intent.',
    basePrompt,
  ].join(' ');
}
```

The `observationMs` delay (harness.ts line 224, default 120s) is intentional and stays unchanged.

### Changes — `evals/src/harness.test.ts`

Update the `buildEvaluatorPrompt` test (line 53) to verify:
- `first priority after joining` present
- `Immediately after joining, post` present
- `Do not request a home space` present
- `Observe first` NOT present

## Acceptance Criteria

- [ ] `discoverPrincipalId()` reads `principal_id` from `station-enrollment.json`
- [ ] Per-agent DB queries use principal ID, not handle
- [ ] `agentPassedCollaboration()` compares `sender_id` against `principalId`
- [ ] `agent-map.json` includes `principalId` for each agent
- [ ] Timeline resolves agent labels via `principalId`
- [ ] Evaluator prompt prioritizes intent posting over observation
- [ ] Existing tests pass with updated assertions
- [ ] Re-run trial shows non-empty evidence and non-zero scores

## Sequencing

1. **Fix 1 first** — unblocks the scoring pipeline
2. **Fix 2 second** — independent commit, improves trial dynamics

## Verification

1. `cd evals && npx tsx --test src/harness.test.ts`
2. Re-run a profiled swarm trial and confirm:
   - `summary.json` has non-empty per-agent `messages` and `monitoringEvents`
   - Orientation/coexistence/collaboration pass counts are non-zero
   - `timeline.md` shows `claude-01 (backend-builder)` not `prn_headwaters_...`
   - Evaluator recipe intent appears within ~30s of evaluator launch

## Sources

- Audit findings from agent analysis of `evals/tmp/headwaters-agent-pack-profiled/trial-01/`
- `evals/src/harness.ts` — main orchestration and evidence attribution
- `evals/src/prompts/headwaters-agent-pack.ts` — evaluator prompt
- `evals/scripts/read_space_db.py` — SQLite query script
- `evals/src/harness.test.ts` — existing test suite
