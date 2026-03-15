---
status: complete
priority: p1
issue_id: "005"
tags: [intent-space, dojo, evaluation, agents, harness]
dependencies: []
---

# Dojo Agent Evaluation Harness

## Problem Statement

We need a repeatable local harness that stages the academy + station + tutor dojo and runs real native agent CLIs against it with one top-level instruction, three times each, so we can measure whether the published pack is sufficient for zero-shot participation.

## Findings

- The dojo substrate already exists in `intent-space`:
  - `src/tutor.ts`
  - `scripts/dojo-agent.ts`
  - `docs/academy/`
- We already learned that managed local stacks need a persistent session under Codex rather than detached backgrounding.
- There is no current harness for launching multiple real agent CLIs, collecting artifacts, or classifying failure stages.

## Proposed Solutions

### Option 1: Shared harness core with thin per-agent recipes

Build one harness that stages the local dojo, launches each real CLI via a small recipe, collects artifacts, and classifies failure stages.

Pros:
- Honest to the real rollout
- Low semantic coupling
- Scales to more agents later

Cons:
- Requires transcript parsing and recipe design

### Option 2: Rich adapter per agent

Wrap each agent with a more opinionated facade.

Pros:
- Easier orchestration
- Cleaner normalization

Cons:
- Risks hiding onboarding friction
- Harder to trust results

## Recommended Action

Implement option 1.

Start with the harness core, artifact model, and one validated agent recipe, then add the remaining recipes and comparative reporting.

## Acceptance Criteria

- [ ] Harness can stage or attach to the local dojo stack
- [ ] Harness can run Codex CLI, Claude CLI, and Pi mono as native targets
- [ ] Harness runs three trials per agent
- [ ] Each run persists transcripts, timing, outcome, classification, and generated local artifacts
- [ ] Harness produces a comparative local report

## Work Log

### 2026-03-14 - Created work item

**By:** Codex

**Actions:**
- Converted the approved plan into a tracked todo
- Captured the current dojo substrate and harness gap

**Learnings:**
- The work is best anchored in `intent-space`, close to the tutor, academy, and dojo agent scripts

### 2026-03-14 - Implemented harness core and validated live recipes

**By:** Codex

**Actions:**
- Added harness core in [intent-space/src/harness.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/harness.ts)
- Added CLI entrypoint in [intent-space/scripts/dojo-harness.ts](/Users/noam/work/skyvalley/big-d/intent-space/scripts/dojo-harness.ts)
- Added classifier coverage in [intent-space/scripts/test-harness.ts](/Users/noam/work/skyvalley/big-d/intent-space/scripts/test-harness.ts)
- Wired harness commands into [intent-space/package.json](/Users/noam/work/skyvalley/big-d/intent-space/package.json)
- Added operator documentation in [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
- Ran live attach-mode harness trials against the current local dojo:
  - `scripted-dojo` passed
  - `codex` passed
  - `claude` failed at `pre-dojo`
  - `pi` recorded `unavailable`
- Generated a compact comparative report at `intent-space/tmp/dojo-harness-matrix/`
- Ran `npm run typecheck`
- Ran `npm test`

**Learnings:**
- The first Codex live run proved the harness must terminate on dojo completion, not on CLI exit, because a real agent may finish the ritual but keep the process alive.
- Raw station transcript plus per-run workspace files are enough to localize meaningful failure stages without adding a semantic facade.
- Claude already gives a useful failure classification in the first run, which means the harness is generating actionable signal rather than just pass/fail noise.
