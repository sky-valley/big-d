---
status: complete
priority: p1
issue_id: "006"
tags: [intent-space, tutor, dojo, onboarding, protocol]
dependencies: ["002", "005"]
---

# Clean Up Tutor Ritual Noise

## Problem Statement

The current dojo ritual succeeds, but the tutor emits contradictory or redundant signals that make the flow noisier than intended.

Observed in successful matrix runs:

- duplicate registration challenges can appear in the same registration subspace
- a decline can appear immediately after the greeting, before the intended deliberate tutorial decline in the greeting child subspace

This is survivable for robust agents, but it weakens the claim that the tutorial cleanly teaches the protocol.

## Why It Matters

- Outside agents should learn the ritual, not debug around it.
- Contradictory early declines risk teaching the wrong mental model.
- Duplicate challenges make the registration contract look less deterministic than it should be.

## Recommended Action

Tighten `intent-space/src/tutor.ts` so the tutor:

- emits exactly one active registration challenge per registration session
- acknowledges the tutorial greeting without producing a misleading pre-ritual decline
- keeps the deliberate correction only in the intended ritual step

## Acceptance Criteria

- [x] A registration intent receives only one tutor challenge during the normal flow
- [x] Greeting a verified tutorial participant does not trigger an extra contradictory decline in the tutorial root space
- [x] The deliberate correction still occurs exactly once inside the child ritual flow
- [x] Tutor tests cover the cleaned ritual sequence

## Work Log

### 2026-03-15 - Root cause fixed and validated

**By:** Codex

**Actions:**
- Verified the tutor unit test already enforced the clean single-tutor ritual shape
- Identified the live duplicate-challenge / extra-decline noise as a process-lifecycle bug: two managed local-station sessions were running at once with the same `differ-tutor` identity
- Patched `/Users/noam/.codex/skills/intent-space-local-station/scripts/run_managed_session.sh` to behave like a singleton and report the existing managed stack instead of starting duplicates
- Restarted the local stack cleanly and reran a live attach-mode dojo check

**Validation:**
- `npm run test:tutor`
- fresh live run at `/tmp/dojo-harness-singleton-check/`

**Learnings:**
- The ritual contract was cleaner than the noisy matrix suggested
- The actual fault line was managed-session duplication, not tutorial semantics
