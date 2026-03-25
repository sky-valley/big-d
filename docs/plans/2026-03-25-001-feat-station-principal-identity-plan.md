---
title: "feat: station principal identity"
type: feat
status: completed
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-station-principal-identity-brainstorm.md
---

# feat: station principal identity

## Overview

Replace handle-keyed durable identity with an explicit station-issued `principal_id` across the station auth profile, runtime surfaces, and Headwaters ownership model.

The core correction is simple:

- handle remains self-chosen social identity
- station mints or reuses a station-local `principal_id`
- station token carries `principal_id`
- `AUTH_RESULT` reaffirms `principal_id`
- durable ownership, including Headwaters home-space ownership, binds to `principal_id`, not handle

This is a clean cutover, not a compatibility exercise. The repo is still pre-release, so the plan intentionally favors a coherent identity model over preserving earlier handle-keyed semantics (see origin: [2026-03-25-station-principal-identity-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-25-station-principal-identity-brainstorm.md)).

## Problem Statement

The current station surface still conflates two different identities:

- `handle`: chosen by the agent, socially meaningful, not reliably unique
- proof-bearing key identity: what signup and station auth actually validate

That mismatch is already causing the wrong product behavior in Headwaters:

- signup returns `handle`, `station_token`, and `commons_space_id`
- the station token is cryptographically bound to the enrolled key via `cnf.jkt`
- but Headwaters home provisioning still keys stable ownership off `ownerId`/handle in `headwaters/src/provisioner.ts`
- repeated signup with the same handle rebinds to the same “home” even though handle is not authoritative identity

The result is a dishonest ownership model:

- two principals could choose the same handle
- the station already has a stronger identity signal than the handle
- the published profile would teach the wrong lesson if it kept treating self-name as durable authority

So the problem is not only “fix Headwaters home IDs.” It is:

How do we define a station-local principal identity model that stays explicit, leaves room for future key rotation, keeps handle freedom intact, and propagates cleanly through Welcome Mat enrollment, station auth, runtime surfaces, and Headwaters ownership?

## Proposed Solution

Introduce a first-class station-local `principal_id` into the station auth profile and make it the only durable ownership key.

The intended model is:

1. **Signup mints or reuses principal identity**
   - station validates the enrolled proof-bearing key
   - station returns:
     - `handle`
     - `principal_id`
     - station token
     - default participation space

2. **Station token carries principal identity**
   - the token continues binding participation to the enrolled key
   - the token also carries `principal_id`
   - this keeps the connection/auth layer honest about who the durable station principal is

3. **Auth result reaffirms principal identity**
   - `AUTH_RESULT` returns:
     - bound `spaceId`
     - reaffirmed `principal_id`
   - runtime can reason about current connection identity without trusting stale local enrollment artifacts alone

4. **Headwaters ownership binds to principal identity**
   - home-space ownership keys off `principal_id`
   - home `space_id` itself remains opaque and separate from principal naming
   - handle becomes metadata/display identity only

This keeps the authority story explicit:

- local station mints local principal
- current key proves current binding
- handle remains chosen self-description

## Promise-Native Architecture Check

- **Autonomous participants:** enrolling agent, station enrollment boundary, live station runtime, Headwaters steward, and any provisioned spaces.
- **Promises about self:** the agent chooses its handle and proves possession of its current key; the station promises that a given principal exists locally and that the current key is accepted as that principal; the steward promises to provision spaces for the authenticated principal it recognizes.
- **State authority:** durable identity authority lives in station-issued enrollment/auth state and Headwaters ownership metadata, not in ad hoc handle strings found in space messages. Intent spaces remain observational surfaces for visible coordination, not the authority for principal identity.
- **Which lifecycle acts are required and why:** this identity cutover does not add a new promise lifecycle. Existing promise-native provisioning remains `INTENT -> PROMISE -> ACCEPT -> COMPLETE -> ASSESS`. Identity is a boundary/auth concern that must support that lifecycle honestly.
- **How the design preserves intent-space purity:** principal identity is introduced in signup, token, and auth surfaces, not by overloading ITP semantic acts with account-management meaning. The wire remains promise-native; identity remains a boundary layer.
- **How visibility / containment is scoped:** principal IDs are explicit to the enrolled participant and auth/runtime surfaces; private provisioning interiors remain scoped to the requester principal and steward; no sensitive ownership details need to leak into public commons beyond ordinary visible request acts.
- **Rejected shortcut:** reject continuing to key durable ownership off handle just because it is easy to read and already exists in signup payloads. Also reject equating raw key thumbprint with the full durable principal, because that would make later rotation harder and collapse principal identity into current credential material.

## Technical Approach

### Architecture

Define station identity in three explicit layers:

#### Layer 1: Social identity

- `handle`
- self-chosen
- non-unique
- used for display and agent self-expression

#### Layer 2: Durable station identity

- `principal_id`
- station-issued
- station-local
- prefixed but opaque
- minted or reused at signup
- stable across repeated signup with the same enrolled key

#### Layer 3: Current credential binding

- proof-bearing key
- bound to the current principal through signup + token + auth
- modeled in a way that leaves room for later key rotation

The station auth profile should therefore say:

- a principal is not the same thing as a handle
- a principal is not merely the raw key thumbprint
- the current key is the credential currently accepted for that principal

### Implementation Phases

#### Phase 1: Define the principal-bearing station auth profile

Goal: make the published station profile explicit about durable principal identity.

Tasks:

- update the general station profile/spec docs under `intent-space/` and `docs/` to define:
  - `principal_id`
  - station-local principal scope
  - same-key signup reuse semantics
  - relationship between principal and current proof-bearing key
- define the field placement for:
  - signup response
  - station token payload
  - `AUTH_RESULT`
- define the naming/format requirements for `principal_id`:
  - prefixed
  - opaque
  - high-entropy suffix
- state explicitly that handle uniqueness is not required
- state explicitly that home-space ownership and similar durable station resources must key off principal identity

Success criteria:

- the published profile explains handle, principal, and key-binding distinctly
- the profile is explicit enough that runtime and product code do not need local folklore
- the profile leaves room for future key rotation without pretending to implement it now

#### Phase 2: Implement principal issuance and reuse in station enrollment

Goal: make signup return a real station-local principal instead of only handle-shaped identity.

Tasks:

- add principal issuance/reuse logic to station signup paths in:
  - `academy/src/welcome-mat.ts`
  - `headwaters/src/welcome-mat.ts`
  - shared helpers as appropriate
- persist a station-local principal record keyed by current enrolled key identity
- reuse the same principal on repeat signup with the same key
- return `principal_id` in signup responses and stored enrollment artifacts
- keep handle validation and storage, but stop treating handle as the ownership key

Success criteria:

- repeat signup with the same key returns the same `principal_id`
- different principals may choose the same handle
- station-local enrollment artifacts now reflect both handle and principal identity

#### Phase 3: Carry principal identity through token and auth surfaces

Goal: make live station participation explicitly principal-aware.

Tasks:

- extend station token payloads to include `principal_id`
- extend auth verification state to carry `principal_id`
- extend `AUTH_RESULT` types and emitters to return `principal_id`
- update:
  - `intent-space/src/auth.ts`
  - `intent-space/src/types.ts`
  - `intent-space/src/space.ts`
  - Headwaters shared-host auth path
  - academy station auth path where relevant
- ensure current runtime/session snapshots expose:
  - handle
  - `principal_id`
  - current bound `spaceId`

Success criteria:

- station token, auth state, and auth result all agree on principal identity
- runtime snapshots no longer force agents to infer durable identity from handle
- auth remains a boundary concern and does not distort ITP semantics

#### Phase 4: Re-key Headwaters durable ownership to principal

Goal: remove handle-keyed home ownership and replace it with principal-keyed ownership.

Tasks:

- refactor `headwaters/src/provisioner.ts` so stable ownership keys off `principal_id`
- stop deriving home `space_id` from handle
- introduce opaque home `space_id` generation
- persist ownership linkage separately from `space_id`
- update steward provisioning and completion payload assembly so:
  - ownership is principal-keyed
  - returned space credentials still work on existing shared-host model
- remove assumptions that `home-${handle}` is canonical or meaningful

Success criteria:

- durable home-space lookup is principal-based
- space ID is opaque and no longer conflates identity with address
- same-handle different-principal cases do not collide

#### Phase 5: Update runtime, pack, and docs

Goal: teach the corrected identity model consistently.

Tasks:

- update runtime/session surfaces in the canonical marketplace pack and any in-repo canonical references to show:
  - handle
  - `principal_id`
  - current `spaceId`
- update docs:
  - `intent-space/INTENT-SPACE.md`
  - `intent-space/README.md`
  - `academy/README.md`
  - `academy/agent-setup.md`
  - `headwaters/README.md`
  - `headwaters/agent-setup.md`
- explain plainly:
  - handle is your self-name
  - `principal_id` is your durable station identity here
  - current key is the credential currently accepted for that principal
- remove any wording that implies handle uniqueness or handle-owned stable resources

Success criteria:

- docs no longer teach or imply handle-keyed durable identity
- agents can understand their principal identity without runtime folklore
- Headwaters and academy onboarding surfaces tell the same identity story

#### Phase 6: Validate with focused tests and fresh-agent flows

Goal: prove the identity cutover behaves correctly before wider work resumes.

Tasks:

- add test coverage for:
  - same-key repeat signup returns same `principal_id`
  - different keys with same handle mint different principals
  - station token carries `principal_id`
  - `AUTH_RESULT` carries `principal_id`
  - Headwaters home-space provisioning binds to principal, not handle
  - same-handle/different-principal home requests do not collide
- update happy-path and harness flows to assert the new identity fields explicitly
- rerun:
  - relevant `intent-space` tests
  - relevant `academy` tests
  - relevant `headwaters` tests
  - at least one fresh-agent Headwaters flow end to end

Success criteria:

- the principal model is exercised at signup, auth, and provisioning boundaries
- the old handle-keyed collision shape is no longer possible
- the new fields are visible and stable in agent-facing flows

## Alternative Approaches Considered

### 1. Keep handle as the durable identity

Rejected because self-chosen handles are not a trustworthy uniqueness boundary and would continue teaching the wrong identity model.

### 2. Use raw key thumbprint as the durable identity

Rejected because it collapses durable principal identity into current credential material and makes future key rotation harder to introduce cleanly.

### 3. Hide principal identity behind runtime magic

Rejected because the station is already making durable identity claims. Keeping them implicit would preserve ambiguity and force agents to infer important state from side effects.

### 4. Encode principal identity directly into home `space_id`

Rejected because ownership and address are different concerns. Opaque `space_id` plus separate principal ownership linkage is cleaner and leaves more room for future changes.

## System-Wide Impact

### Interaction Graph

Current:

- agent chooses handle
- signup validates key and returns station artifacts
- runtime/auth binds to key
- Headwaters durable ownership still keys home-space behavior off handle

Planned:

- agent chooses handle
- signup validates current key and returns:
  - handle
  - `principal_id`
  - station artifacts
- station token carries `principal_id`
- auth result reaffirms `principal_id`
- Headwaters durable ownership keys off `principal_id`

### Error And Failure Propagation

New failure points include:

- signup principal issuance/reuse bug
- token/profile mismatch where `principal_id` is missing or inconsistent
- auth result omission or mismatch
- Headwaters ownership record mismatch between principal and space linkage

Plan implications:

- failures should be explicit and typed, not silent fallback to handle-based behavior
- tests should reject mixed identity states rather than tolerating them
- no compatibility shim should silently reinterpret old handle-keyed records

### State Lifecycle Risks

Critical state transitions:

- first principal issuance
- repeat signup principal reuse
- token issuance carrying principal
- auth session binding to principal
- Headwaters durable space ownership persistence

Risks:

- accidental minting of multiple principals for the same enrolled key
- accidental fallback to handle-based provisioning
- partially updated runtime surfaces that expose conflicting identity fields

Mitigations:

- centralize principal issuance/reuse logic
- make handle-keyed ownership impossible in the new data model
- test same-handle/different-key and same-key/repeat-signup paths explicitly

## Testing Strategy

- unit-level tests for principal issuance/reuse logic
- auth/token tests for `principal_id` propagation
- Headwaters provisioning tests for principal-keyed ownership
- fresh-agent integration tests that inspect:
  - signup response
  - auth result
  - completion payloads
- regression tests for same handle chosen by different keys

## Rollout Notes

- This is a pre-release clean cutover.
- Do not add backward-compatibility layers for handle-keyed durable identity.
- If local persisted state becomes incompatible during implementation, operator reset is acceptable.

## Promise-Native Plan Review

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Blocked-red-flag review:

- [x] Embedded callbacks replace real participants: no
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: no
- [x] `ASSESS` is absent where fulfillment quality matters: no change to provisioning lifecycle; `ASSESS` remains required there
- [x] State authority silently drifts into the intent space: no
- [x] Auth or transport semantics displace native ITP semantics: no
- [x] The design relies on a mandatory relay without explicit justification: no
- [x] Sensitive fulfillment details have no scoped visibility model: no

## Next Steps

→ /ce:work docs/plans/2026-03-25-001-feat-station-principal-identity-plan.md
