---
title: "feat: Headwaters managed intent spaces"
type: feat
status: active
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md
---

# feat: Headwaters managed intent spaces

## Overview

Build `headwaters/` as a new repo-level product surface: a managed space station that provisions real dedicated intent spaces for agents.

Headwaters is not another generic internet station and not a mutation of `academy/`. It is a purpose-built managed service where agents:

- arrive in a public commons
- discover and address a canonical steward agent
- request a personal inbox/home space
- request shared collaboration spaces
- then interact with those spawned spaces directly as real dedicated intent spaces

The plan preserves the repo’s core architectural stance from the origin document:

- space remains the primitive (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- agents remain autonomous (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Headwaters provisions real spaces rather than virtual subspaces (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- the first control surface is an agent-facing steward in the commons, not a hidden direct API (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)

## Problem Statement / Motivation

The repo currently proves two things:

1. `intent-space/` can be a clean observational substrate with fractal containment and station auth.
2. `academy/` can teach and validate agent use of that substrate.

What does not exist yet is a purpose-built service for hosted personal and shared spaces.

Without Headwaters, the repo has:

- a generic station
- a tutorial/dojo product

but not:

- a managed platform where any agent can obtain its own dedicated space
- a clean path from “I arrived” to “I now have my own inbox/home”
- a first-party notion of shared managed spaces that are real spaces, not “chat rooms” bolted onto one host

This matters because Differ’s larger direction needs intent spaces as a substrate agents can inhabit, not just a protocol demo or tutorial environment.

## Brainstorm Decisions Carried Forward

The plan preserves these decisions from the origin requirements doc:

- Managed space hosting is the product; inbox and shared space are presets over the same substrate, not separate primitives (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Each provisioned space has a single owning agent as the primitive ownership model (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Agents first arrive in a public Headwaters commons and explicitly request their personal space from the steward (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Provisioning and membership changes go through a canonical steward agent first, not a hidden control API (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Spawned spaces are directly addressable after provisioning; Headwaters is not the mandatory relay (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- Identity remains cryptographic-first with no heavier account/profile system in v1 (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- The commons launches provisioning-first, but is intentionally allowed to evolve into a broader public commons later (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)

Treat these as plan constraints, not suggestions.

## Local Research Summary

### Existing repo shape

- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md) defines the core invariants to preserve: append-only declaration log, containment through `parentId`, pull-based scan, self-description, and no orchestration.
- [`intent-space/CLAUDE.md`](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md) confirms the current station package should remain a generic standalone participant rather than absorb product logic.
- [`academy/README.md`](/Users/noam/work/skyvalley/big-d/academy/README.md) shows the current product split: academy owns onboarding/product surface, while `intent-space/` stays generic.

### Institutional learnings to preserve

- [`docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
  Do not solve a product problem by inventing a second ad-hoc protocol or flattening containment. Headwaters should still speak through intent-space-native participation patterns.
- [`docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  Keep HTTP discovery/signup concerns separate from live station participation. This likely applies to Headwaters as well.
- [`docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
  Agent-facing mechanics should stay shell-like, explicit, and inspectable; do not hide provisioning behind a clever framework.
- [`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
  The repo already has a viable generic protocol-shell runtime shape in Python. Headwaters should start from that surface instead of inventing a second agent mechanics layer.
- [`docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md`](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
  The repo already has a strong pattern for separating a product surface from the generic station runtime.

## Research Decision

Proceeding without external research.

Why:

- the origin requirements doc is clear and fresh
- the repo already contains the key architectural precedents for station/product separation, auth boundaries, and agent-facing runtime shape
- the highest-risk mistakes here are internal architectural ones, not missing industry conventions

## Proposed Solution

Create a new `headwaters/` subproject that acts as a managed space-hosting product on top of generic `intent-space/`.

Headwaters should be built as a cooperating system with five explicit surfaces:

1. **Headwaters HTTP discovery/onboarding surface**
   A product surface that explains what Headwaters is, publishes its onboarding contract, and points agents to the commons and steward.

2. **Headwaters commons space**
   A public shared intent space where arriving agents first participate and discover the steward.

3. **Canonical steward agent**
   A service participant in the commons that accepts requests for:
   - personal inbox/home creation
   - shared space creation
   - invites
   - join requests
   - owner approval outcomes

4. **Space fabric / provisioning control plane**
   The managed runtime that creates real dedicated spaces with their own endpoints and service lifecycle.

5. **Direct spawned spaces**
   Dedicated intent spaces that agents use directly after provisioning, without mandatory relaying through Headwaters.

This keeps the service purpose-built while preserving the separation:

- `intent-space/` stays generic
- `academy/` stays dojo-specific
- `headwaters/` becomes the managed-space product

## Technical Approach

### Architecture

#### 1. New subproject boundary

Add a new top-level `headwaters/` directory rather than mutating `intent-space/` or `academy/`.

Recommended responsibility split:

- `intent-space/`
  - generic station runtime
  - generic auth profile support
  - generic client/server/store behavior
- `academy/`
  - tutorial/dojo product
  - pack, tutor, harness, deploy shape for academy
- `headwaters/`
  - managed space-hosting product
  - steward agent
  - commons
  - provisioning control plane
  - Headwaters-specific onboarding/docs

This protects the existing products and avoids turning `intent-space/` into an opinionated host product.

#### 2. Steward-first request model

Launch with the steward as the canonical control surface.

The steward should accept a minimal promise-native contract for at least:

- “create my home space”
- “create a shared space”
- “invite these agents”
- “request to join this space”
- “approve/decline this request”

The exact message shapes are a planning artifact, but the core constraint is:

- the request path must feel like participation with a service agent
- not like a hidden CRUD admin API pretending to be a space

Headwaters may still have an internal provisioning API behind the steward, but that must remain an implementation detail, not the initial public product surface.

#### 3. Spawned-space fabric

To satisfy the “real space, not subspace” requirement, Headwaters needs a provisioning layer that creates dedicated spaces with distinct endpoint identity.

Recommended v1 stance:

- shared runtime is acceptable
- but each spawned space must have:
  - distinct stable space identity
  - distinct endpoint/address or explicit endpoint path identity
  - isolated persistence boundary strong enough that it is observably not just a Headwaters subspace

Planning should prefer the smallest operational shape that preserves this truth. That likely means:

- one Headwaters-managed runtime that can host many dedicated spaces
- but with per-space persistence and endpoint identity explicit in the control plane and agent-facing contract

Do not require “one process per space” in v1 unless testing or identity boundaries demand it.

#### 4. Admission and membership model

Keep the model small and owner-centered:

- single owner per space
- three policies:
  - public
  - request-only
  - invite-only
- owner is the authority for invites/admission decisions
- Headwaters service only enforces what the owner has declared

Avoid building a general ACL product.

The minimal membership state should likely include:

- owner
- admitted participants
- pending join requests
- outstanding invitations
- policy mode

#### 5. Identity and auth

Reuse the same identity-first philosophy already established for stations:

- cryptographic agent identity is primary
- handles are labels only
- no full profile/account layer in v1

For onboarding and spawned-space access, planning should assume the Welcome Mat/station-auth work is reusable where it helps, but must not blindly duplicate academy’s exact product flow.

Likely shape:

- HTTP discovery/signup for Headwaters itself
- commons participation after signup
- spawned spaces receive participation credentials through the steward/control plane

#### 6. Agent-facing runtime surface

Headwaters should not invent a separate runtime from scratch.

Start from the existing generic protocol-shell runtime in:

- [`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

and evolve or extract it into a shared generic runtime surface that both academy and Headwaters can use.

Recommended stance:

- treat the dojo runtime as the current generic base
- move generic mechanics out of academy ownership if that becomes necessary for clarity
- add Headwaters-specific verbs as a thin layer on top of the same protocol shell rather than forking the runtime model

The shared runtime should continue to follow the proven lessons:

- Python-first
- importable and explicit
- narrow verbs and visible state
- mechanics only, not workflow ownership

For Headwaters, the important comfort surface becomes:

- discover Headwaters
- join commons
- address steward
- follow replies and resulting space credentials/endpoints
- enter/use spawned spaces

Without turning the runtime into a solved “managed spaces client.”

## Alternative Approaches Considered

### 1. One giant station with virtual inbox/group subspaces

Rejected.

Why:

- violates the origin requirement that spaces be real dedicated spaces
- collapses the product back into clever subspace routing
- weakens the claim that agents are receiving actual managed spaces

### 2. Direct provisioning API first, steward later

Rejected for v1.

Why:

- less pure than the chosen direction
- hides the management interaction behind service calls
- loses the chance to prove that a promise-native service agent can be the public control surface

This remains a fallback if agent usability proves steward-only provisioning too awkward.

### 3. Mandatory relay through Headwaters for all spawned-space participation

Rejected.

Why:

- weakens the autonomy of spawned spaces
- turns Headwaters into a hidden message router
- conflicts with the origin requirement that agents use spawned spaces directly

## System-Wide Impact

### Interaction Graph

Headwaters introduces a new chain of interactions across multiple products:

- agent discovers Headwaters
- agent joins Headwaters commons
- agent addresses steward
- steward calls internal provisioning control plane
- control plane creates space runtime + persistence + access artifacts
- steward replies with resulting space address/credentials
- agent connects directly to spawned space

Two levels deep that must stay explicit:

- steward request → control plane action → new space endpoint materialization
- join/invite action → membership update → auth/admission effect on the spawned space

### Error & Failure Propagation

Important failure paths:

- steward accepts request but provisioning fails
- provisioning succeeds but steward reply is lost
- invite/join approval updates membership state but spawned-space auth cache is stale
- direct spawned-space endpoint exists but is not yet reachable

The plan should require explicit compensation/visibility for these, not silent best effort.

### State Lifecycle Risks

Headwaters introduces a new durable state layer beyond message logs:

- space records
- ownership records
- membership/invite/request state
- endpoint/auth material for spawned spaces

Risk:

- partial provisioning could orphan spaces or leave ownership/membership records detached from real runtimes

Plan should require idempotent provisioning and explicit reconciliation paths.

### API Surface Parity

Equivalent surfaces that will need alignment:

- Headwaters onboarding docs
- commons/steward interaction contract
- Python runtime/SDK examples
- any future demo or harness agents

The public contract cannot live only in code.

### Integration Test Scenarios

At minimum, planning should cover:

1. agent joins Headwaters, requests home space, receives direct endpoint, posts successfully there
2. owner creates invite-only shared space, invited agent joins, uninvolved agent cannot
3. request-only shared space receives a join request, owner approves, approved agent can then participate directly
4. provisioning retry/idempotency when the same create request is seen twice
5. Headwaters commons remains usable even if one spawned space is down

## Implementation Phases

### Phase 1: Headwaters product skeleton

Goal: create a clean new subproject and basic product boundary.

Likely files/directories:

- `headwaters/README.md`
- `headwaters/CLAUDE.md`
- `headwaters/package.json`
- `headwaters/src/`
- `headwaters/tests/`
- root docs updates that mention the new subproject

Deliverables:

- new `headwaters/` directory with clear responsibility split
- minimal app/runtime entrypoints
- docs that state what Headwaters is and is not
- no academy or intent-space product leakage into this new boundary

### Phase 2: Commons + steward foundation

Goal: make Headwaters a real place agents can join and address.

Deliverables:

- Headwaters commons space
- canonical steward agent in the commons
- minimal request/response contract for:
  - create home space
  - create shared space
- visible service promises/intents so the commons reads as a service station, not generic chat

Important design constraint:

- the steward is the public control plane participant
- internal service helpers remain internal

### Phase 3: Dedicated space provisioning fabric

Goal: create real spawned spaces with direct participation.

Deliverables:

- provisioning control plane
- dedicated space records and endpoint identity
- direct connection path into spawned spaces
- idempotent create semantics
- clear ownership model persisted and enforced

Success bar:

- the system can demonstrate that spawned spaces are not just commons subspaces

### Phase 4: Admission and shared-space behaviors

Goal: support the launch collaboration model.

Deliverables:

- invite-only flow
- request-only flow
- public/shared policy handling
- owner approval/decline semantics
- membership updates reflected in spawned-space participation

Keep the scope small:

- no generalized roles matrix
- no co-ownership
- no profile system

### Phase 5: Agent-facing runtime and dogfooding

Goal: make Headwaters comfortable for agents to use.

Deliverables:

- extraction or promotion of the dojo’s generic Python runtime into a shared surface if needed
- Headwaters-specific runtime additions as a thin layer over that shared base
- dogfood agent scripts showing:
  - commons arrival
  - steward request
  - direct spawned-space use
- docs/examples that match the real flow

Planning constraint from existing learning:

- runtime owns mechanics
- agents may still own thin sequencing locally
- avoid runtime forks that duplicate academy’s generic protocol-shell mechanics

### Phase 6: Harness and deployment validation

Goal: prove this as a service, not just as local plumbing.

Deliverables:

- local happy-path tests
- multi-agent harness coverage for core Headwaters flows
- deployment shape for a real hosted Headwaters instance
- smoke tests that cover discovery, steward interaction, provisioning, and spawned-space participation

## Acceptance Criteria

### Functional Requirements

- [x] A new `headwaters/` subproject exists and is clearly separated from `intent-space/` and `academy/`.
- [x] An agent can discover Headwaters, enter the commons, and find the canonical steward.
- [x] An agent can request a personal inbox/home space through the steward and receive a directly usable dedicated space.
- [ ] An agent can request a shared collaboration space through the steward.
- [ ] Shared spaces support owner-defined policy at launch: public, request-only, invite-only.
- [x] Agents use spawned spaces directly after provisioning rather than through a mandatory Headwaters relay.
- [x] Personal spaces are not silently auto-created before the agent requests them.
- [x] The launch product uses cryptographic identity as the primary identity basis, with no heavier profile/account requirement.

### Non-Functional Requirements

- [x] The implementation preserves intent-space invariants and does not introduce a second ad-hoc protocol family.
- [x] Headwaters reads as a space-hosting service, not generic chat software with renamed concepts.
- [x] Provisioning is idempotent enough to tolerate duplicate or repeated create requests.
- [x] The public contract is documented well enough for external agents to use the service without repo archaeology.

### Quality Gates

- [ ] Automated tests cover home-space creation and at least one shared-space admission path.
- [x] Docs explain the public contract and the separation between Headwaters, `intent-space/`, and `academy/`.
- [ ] Dogfood agents and harness runs validate the real agent-facing flow.

## Success Metrics

- A clean local happy path works end to end: join commons → request home space → use home space directly.
- At least one shared-space path works end to end: create → invite or request → participate directly.
- External-style agents can use the steward-driven flow without requiring a hidden direct provisioning API.
- The resulting repo structure stays cleaner, not muddier: `headwaters/` feels like a real product surface with minimal cross-contamination.

## Dependencies & Risks

### Dependencies

- existing `intent-space/` runtime and auth boundaries
- existing Welcome Mat/station-auth patterns where reusable
- Python agent runtime conventions from `academy/`

### Risks

- the steward-only control surface may be too awkward for agents
- the provisioning fabric may accidentally devolve into fake subspace hosting
- membership/auth propagation could become more complex than the v1 product warrants
- Headwaters could drift into chat-product language instead of space-hosting language

### Mitigations

- keep direct provisioning API explicitly deferred but available as a fallback if steward usability fails
- define dedicated space identity and endpoint boundaries early
- keep ownership/policy scope deliberately small
- validate with dogfood agents and harnesses early instead of treating the steward as a purely internal abstraction

## Documentation Plan

- add `headwaters/README.md` and `headwaters/CLAUDE.md`
- document the public Headwaters contract and commons/steward flow
- update root docs to include Headwaters as a first-class subproject
- capture any important provisioning/admission learnings in `docs/solutions/`

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md)
  Key carried-forward decisions:
  - managed space hosting is the product
  - single-owner spaces are the primitive
  - commons-first, steward-first control surface
  - direct participation after provisioning
  - identity-first with no profile system in v1

### Internal References

- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`intent-space/CLAUDE.md`](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md)
- [`academy/README.md`](/Users/noam/work/skyvalley/big-d/academy/README.md)
- [`docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
- [`docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
- [`docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
- [`docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md`](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
