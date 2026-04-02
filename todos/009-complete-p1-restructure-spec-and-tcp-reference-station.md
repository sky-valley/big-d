---
status: complete
priority: p1
issue_id: "009"
tags: [intent-space, restructure, reference-station, docs]
dependencies: []
---

# Restructure Spec And TCP Reference Station

Replace the current mixed repo shape with one clean story: `intent-space/` as
spec and `tcp-reference-station/` as the only live runnable TCP/ITP reference
implementation.

## Problem Statement

`big-d` currently mixes normative spec, live station implementation, dojo
surfaces, steward-managed surfaces, and product-era docs across
`intent-space/`, `academy/`, and `headwaters/`. That makes the repo harder to
trust and harder for another team to implement from.

## Findings

- `intent-space/` currently contains both normative protocol docs and live
  implementation files under `src/`.
- `academy/` and `headwaters/` still dominate the repo story through READMEs,
  setup docs, deploy scripts, harnesses, and Welcome Mat surfaces.
- The recent framed-wire and proof-recut work provides a good semantic baseline
  to preserve while simplifying the repo shape.

## Proposed Solutions

### Option 1: Keep the current layout and deprecate old surfaces

**Approach:** Add new docs and a new reference station, but leave current
product-shaped directories in place.

**Pros:**
- Lowest short-term effort
- Minimal file movement

**Cons:**
- Keeps conceptual contamination alive
- Leaves contributors guessing which surface is current

**Effort:** 1-2 days

**Risk:** High

---

### Option 2: Restructure around spec + plain reference station

**Approach:** Rewrite `intent-space/` into a spec-only home, extract a new
`tcp-reference-station/`, and remove `academy/` and `headwaters/`.

**Pros:**
- Clean repo position
- Matches the intended architecture directly
- Makes external implementation easier

**Cons:**
- Large edit surface
- Requires careful doc and test rewiring

**Effort:** 1-2 days

**Risk:** Medium

## Recommended Action

Execute Option 2. Keep the recent protocol and auth doctrine intact, extract a
minimal runnable TCP reference station, then remove the old product surfaces
and rewrite the repo-facing docs around the new shape.

## Technical Details

**Main targets:**
- `intent-space/`
- `tcp-reference-station/` (new)
- `README.md`
- `AGENTS.md`
- `docs/runbooks/`
- `academy/` (remove)
- `headwaters/` (remove)

## Resources

- Plan: `/Users/noam/work/skyvalley/big-d/docs/plans/2026-04-02-002-feat-restructure-spec-and-tcp-reference-station-plan.md`
- Requirements: `/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-02-restructure-spec-and-tcp-reference-station-requirements.md`

## Acceptance Criteria

- [x] `intent-space/` is spec-only in the final tree
- [x] `tcp-reference-station/` exists and runs as the plain TCP reference
- [x] `academy/` and `headwaters/` are removed
- [x] Root docs and AGENTS guidance reflect only the new repo story
- [x] Validation passes for the new reference station

## Work Log

### 2026-04-02 - Initial execution

**By:** Codex

**Actions:**
- Read and validated the restructure plan
- Reviewed current repo surfaces and guardrails
- Created this ready todo to track execution

**Learnings:**
- The extraction path is straightforward enough to do in one pass
- The biggest risk is doc drift, not protocol drift

### 2026-04-02 - Restructure completed

**By:** Codex

**Actions:**
- Extracted the runnable station into `tcp-reference-station/`
- Rewrote `intent-space/` into a spec-only surface and added fixtures
- Removed `academy/`, `headwaters/`, `observatory/`, evals, and old runbooks
- Rewired `loop/` to the new reference station package and defaults
- Ran validation:
  - `cd tcp-reference-station && npm run typecheck`
  - `cd tcp-reference-station && npm test`
  - `cd loop && bash scripts/test-protocol.sh`
  - `cd loop && bash scripts/test-negative.sh`
  - `cd loop && npm run build`

**Learnings:**
- The main hidden dependency was `loop/` importing the live station client from
  the old `intent-space/src` path
- The long LLM-backed loop E2E path still depends on local runtime setup and is
  not the right validation gate for this restructure
