---
status: ready
priority: p1
issue_id: "011"
tags: [spacebase1, intent-space, collaboration, stewards]
dependencies: []
---

# Spacebase1 Shared Spaces

Add shared-space provisioning to Spacebase1 so agents with bound home spaces can
create and use private peer collaboration spaces.

## Problem Statement

Spacebase1 currently supports private home spaces and self-service home-space
provisioning, but it does not yet support shared spaces for a fixed peer set.
That limits collaboration even though the underlying spec and reference
stations already support private participant-scoped spaces.

The goal is to add a hosted shared-space product flow in Spacebase1 without
changing intent-space semantics, without leaking Spacebase1 ritual into the
generic onboarding pack, and without introducing hidden control callbacks.

## Findings

- The current spec/reference layer already supports private spaces with
  participant lists in both reference stations.
- Spacebase1 already has the basic hosted product ingredients:
  - bound home spaces
  - per-space stewards
  - a visible provisioning lifecycle in commons
  - claim/signup/bind flow for created spaces
- The agreed product boundary for v1 is:
  - fixed peer set at creation
  - principals, not handles
  - requester must be part of the set
  - all-or-nothing participant validation
  - active immediately after provisioning
  - local invitation `INTENT`s in participant home spaces
- We explicitly decided not to use a steward-only coordination space in v1.
  Delivery obligations should live in authoritative Spacebase1 state.

## Proposed Solutions

### Option 1: State-backed delivery with local steward publication

**Approach:** Keep authoritative shared-space and delivery obligations in
Spacebase1 state. The requester lifecycle ends with `COMPLETE`, and each
participant home steward posts a local invitation `INTENT` from those recorded
obligations.

**Pros:**
- Simpler first cut
- Easier to test and explain
- Preserves per-space steward autonomy
- Avoids hidden control-plane drift

**Cons:**
- Less internally elegant than a steward-only coordination space
- Requires explicit delivery bookkeeping in product state

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Execute Option 1 following the approved plan in
`docs/plans/2026-04-07-001-feat-spacebase1-shared-spaces-plan.md`.

## Technical Details

Primary work areas:

- `intent-space/fixtures/`
- `http-reference-station/scripts/test.ts`
- `tcp-reference-station/scripts/test.ts`
- `spacebase1/src/index.ts`
- `spacebase1/src/types.ts`
- `spacebase1/src/templates.ts`
- `spacebase1/scripts/*.test.ts`
- `docs/architecture/spacebase1-product-flow-addendum.md`
- `docs/plans/2026-04-07-001-feat-spacebase1-shared-spaces-plan.md`

## Resources

- Plan:
  `/Users/noam/work/skyvalley/big-d/docs/plans/2026-04-07-001-feat-spacebase1-shared-spaces-plan.md`
- Requirements:
  `/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`
- Intent-space semantics:
  `/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md`
- Prior architecture learning:
  `/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md`

## Acceptance Criteria

- [x] Spec/reference fixtures cover fixed multi-participant private spaces
- [x] HTTP and TCP reference-station tests prove named-peer access and outsider denial
- [ ] Spacebase1 can resolve and validate a full requested participant set by principal id
- [ ] Shared-space request flow works from a requester home space through visible `INTENT -> PROMISE -> ACCEPT -> COMPLETE`
- [ ] Each named participant receives a local steward invitation `INTENT` in its home space
- [ ] Named peers can collaborate in the resulting shared space
- [ ] Outsiders cannot discover or read the resulting shared space
- [ ] Hosted Spacebase1 docs explain the shared-space flow without polluting the generic pack
- [ ] Spacebase1 tests pass
- [ ] HTTP and TCP reference-station tests pass

## Work Log

### 2026-04-07 - Initial Execution Setup

**By:** Codex

**Actions:**
- Read the approved brainstorm and plan documents
- Confirmed `main` was the default branch and created feature branch
  `codex/spacebase1-shared-spaces`
- Reviewed current spec, reference-station, and Spacebase1 state to ground the
  implementation
- Captured the agreed v1 decision to keep delivery obligations in Spacebase1
  state and defer any steward-only coordination space

**Learnings:**
- The state-backed delivery model is the cleanest v1 shape
- The strongest boundaries to preserve are:
  - spec semantics stay generic
  - Spacebase1 owns shared-space ritual
  - per-space stewards only publish locally in their own spaces

### 2026-04-07 - Conformance Grounding Complete

**By:** Codex

**Actions:**
- Added a multi-participant private shared-space fixture in
  `intent-space/fixtures/06-intent-private-shared.itp`
- Extended the HTTP reference-station suite to prove:
  - named peer access to a private shared subspace
  - outsider denial
  - isolated temp DB usage to avoid stale-data false negatives
- Extended the TCP reference-station suite with the same named-peer/outsider
  proof
- Ran:
  - `cd http-reference-station && npm test`
  - `cd tcp-reference-station && npm test`

**Learnings:**
- The private-space primitive already matches the collaboration shape we want
- A private intent’s policy governs the intent interior; tests need a real
  follow-up act inside that interior to prove shared access honestly
- The HTTP suite needed an explicit temp `dbPath`; otherwise idempotent intent
  IDs collided with stale state and produced misleading failures
