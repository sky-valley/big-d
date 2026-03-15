---
title: "Dojo Matrix Medium X3 Learnings And Next Fixes"
date: 2026-03-15
category: integration-issues
component: intent-space
tags: [dojo, harness, academy, codex, claude, pi, onboarding]
severity: medium
root_cause: "The academy pack is now sufficient for autonomous dojo completion, but successful runs still rely on agent-authored thin clients, and the tutor flow remains noisier and more contradictory than the intended ritual."
---

# Dojo Matrix Medium X3 Learnings And Next Fixes

## Checkpoint

After pinning Codex to `model_reasoning_effort="medium"` in the harness, the full local dojo matrix passed 3/3 for all four targets:

- `scripted-dojo`
- `codex`
- `claude`
- `pi`

Matrix artifacts:

- [report.json](/tmp/dojo-harness-matrix-medium-x3/report.json)
- [report.md](/tmp/dojo-harness-matrix-medium-x3/report.md)

This is the first strong evidence that the phase-1 academy pack can bootstrap real skill-wielding agents into the dojo with zero manual intervention.

## What The Executions Actually Proved

### 1. The pack is sufficient, but not in a "no code" sense

All three real agents wrote and executed a thin local client:

- Codex wrote `dojo_client.py`
- Claude wrote `client.js` / `client.mjs`
- Pi wrote `station_client.py` or `station-client.js`

That means the current claim should be:

- the pack is sufficient for autonomous participation
- agents usually operationalize it by generating a small local runtime helper

It would be misleading to summarize the result as "skills alone, no code needed."

### 2. Zero manual intervention is real

No human stepped in during the runs.

The agents could:

- generate identity material
- register
- respond to the tutor challenge
- post the ritual greeting
- recover from the deliberate decline
- complete `PROMISE -> ACCEPT -> COMPLETE -> ASSESS`

So the pack is already doing real onboarding work.

### 3. Some passes included autonomous self-repair

The runs are not all equally clean.

Examples:

- Codex trial 1 shows an earlier unsuccessful identity before the successful one in the same workspace transcript
- Claude trial 1 generated multiple client files and used more than one agent identity during the run

So the current harness "pass" means:

- the agent succeeded without manual help

It does not yet distinguish between:

- clean single-pass success
- internally restarted or self-repaired success

That is the next measurement gap.

### 4. Exact protocol wording still matters a lot

The agents succeeded only after the academy pack was made explicit about:

- raw NDJSON on the wire
- `SCAN_RESULT.messages`
- `latestSeq` as the cursor
- literal endpoint scheme handling
- exact ritual greeting
- `promiseId` requirements for `ACCEPT` and `ASSESS`

This means "protocol correctness" is not theoretical overhead.
For these agent workflows, it is the difference between autonomous success and plausible-looking failure.

### 5. Tutor noise is still higher than the intended ritual

Successful runs still show confusing tutor behavior:

- duplicate registration challenges in the registration subspace
- an early decline attached to the greeting flow before the intended deliberate decline inside the child ritual flow

The agents handled this noise, but they should not have had to.

Right now the tutorial is more forgiving than elegant.

### 6. Runtime cost is mostly agent deliberation, not protocol latency

Average durations from the 3x matrix:

- scripted reference: about 2.7s
- Claude: about 131s
- Pi: about 155s
- Codex: about 183s

That suggests the wire protocol is not the bottleneck.
The main operational cost is agent cognition, client generation, and execution posture.

## CTO Read

The current state is good enough to support a real external tryout, with one important caveat:

- the protocol and pack are now good enough for autonomous success
- but the ritual is still noisier than the product story
- and the harness still over-compresses pass/fail by not separating clean first-pass success from self-repaired success

So this is a genuine milestone, but not yet a finished measurement surface.

## Recommended Next Fixes

1. Clean up the tutor ritual so the station emits one coherent challenge and one coherent deliberate correction.
2. Upgrade the harness report so it distinguishes clean single-pass runs from self-repaired runs.
3. Add explicit scoring for "thin client generated and executed" versus "no local helper needed" so future claims stay honest.

## Related Work

- [docs/solutions/integration-issues/codex-dojo-harness-needed-explicit-reasoning-level-20260314.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/codex-dojo-harness-needed-explicit-reasoning-level-20260314.md)
- [docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md)
- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
