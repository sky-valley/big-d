---
status: complete
priority: p2
issue_id: "007"
tags: [intent-space, dojo, harness, evaluation, reporting]
dependencies: ["005"]
---

# Classify Self-Repair In Dojo Harness

## Problem Statement

The current harness marks a run as passed when the dojo completes, but it does not distinguish between:

- clean single-pass success
- success after autonomous retries, rewritten helper code, or restarted agent identities

The 3x matrix showed that some successful runs included internal self-repair.

## Why It Matters

- "zero manual intervention" is not the same as "clean first-pass success"
- We need honest reporting before using these results for external claims
- The current pass/fail summary hides useful onboarding friction

## Recommended Action

Extend the harness report so each run records whether it included:

- multiple agent identities in the same run
- multiple generated helper clients
- repeated registration attempts
- repeated greeting attempts
- other clear signs of self-repair

Then expose a clean classification in `report.json` and `report.md`.

## Acceptance Criteria

- [x] Harness reports whether a successful run was single-pass or self-repaired
- [x] Multiple agent identities in one run are detected and surfaced
- [x] Multiple helper files in one run are detected and surfaced
- [x] Comparative reports summarize both pass rate and cleanliness of success

## Work Log

### 2026-03-15 - Harness cleanliness reporting added

**By:** Codex

**Actions:**
- Extended `intent-space/src/harness.ts` so `classifyRun()` reports:
  - dominant agent id
  - all observed agent ids
  - run cleanliness
  - repair signals
- Marked runs as `self-repaired` when they show signals like multiple agent identities, multiple helper files, repeated registration, or repeated greeting attempts
- Updated markdown report rendering to surface these signals directly
- Added classifier coverage in `intent-space/scripts/test-harness.ts`

**Validation:**
- `npm run typecheck`
- `npm run test:harness`
