---
title: feat: Headwaters shared space provisioning
type: feat
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-headwaters-shared-space-provisioning-requirements.md
---

# feat: Headwaters shared space provisioning

## Overview

Headwaters should add a second steward-provisioned space kind: a fresh private shared space for an explicit set of principals. The request still begins as a commons `INTENT`, its interior remains the only coordination room for `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`, and the steward still hands agents off to direct participation in a real spawned space.

This plan deliberately does not introduce mutable membership, owner-managed invites, request-to-join flows, or canonical shared-space reuse. The first cut should stay opinionated and narrow:

- requester names the exact participant set up front
- participants are explicit `principal_id`s, not handles
- requester must be one of the participants
- the steward either refuses explicitly or promises that exact shared space
- each valid request creates a fresh shared space
- fulfillment returns one shared-space descriptor plus per-participant credentials

That keeps the new multi-agent surface aligned with the existing Headwaters stance instead of opening a broader admission system prematurely.

## Problem Statement / Motivation

Headwaters already proves one strong promise-native slice: an agent can arrive in the commons, request a home space, complete the steward lifecycle, and participate directly in a spawned space. For the next product step and for a short live demo, the more useful extension is multi-agent participation in a directly provisioned shared space.

Two possible expansions were on the table:

1. let agents invite others into an already-provisioned private/home space
2. let agents ask the steward to create a fresh shared space for an explicit participant set

The second option is the cleaner first cut. Mutable admission into an existing space creates harder authority and lifecycle questions:

- who is allowed to expand membership after creation?
- how is that authority represented on the wire?
- does membership change require a new promise lifecycle or hidden direct mutation?
- how do later invite semantics stay honest without turning the steward into a relay or hidden admin surface?

The requirements doc chose the more opinionated answer: extend the existing steward provisioning flow to support a `shared` space kind and keep membership fixed at request time.

## Proposed Solution

Extend the current Headwaters stewardship model in four layers:

1. **Shared-space contract extension**
   Broaden the request contract from `home` only to `home | shared`, define the validation rules for a shared participant set, and define the shared completion artifact shape.

2. **Provisioner support for fresh shared spaces**
   Teach the provisioner to create a fresh opaque shared space record with a fixed participant set and per-participant credentials, while preserving the existing principal-owned home-space behavior.

3. **Steward offer and refusal behavior**
   Teach the steward to advertise both `home` and `shared`, validate shared-space requests, explicitly `DECLINE` invalid requests in the request interior, and `PROMISE` / `COMPLETE` valid ones with the shared artifact bundle.

4. **Docs and validation for two-agent use**
   Update Headwaters onboarding and tests so fresh agents can discover the shared-space shape, request it correctly, and demonstrate at least two principals entering the same spawned shared space.

## Technical Considerations

- **Keep the request interior as the only coordination room.**
  Shared spaces should not introduce a second coordination layer or pre-negotiation room. The request `INTENT` already creates the interior needed for the steward lifecycle.
- **Do not blur handles and principals.**
  Shared participation is a durable access decision. The contract should use `principal_id` only, consistent with the recent station identity cutover.
- **Keep home semantics and shared semantics distinct.**
  Home remains one stable space per principal. Shared remains a fresh space per valid request. Avoid a half-generalized ownership model that makes both ambiguous.
- **Do not introduce mutable membership in disguise.**
  The provisioner and steward should treat the participant set as fixed once promised. Later changes would need a separate product decision and lifecycle.
- **Preserve direct participation.**
  The steward should return artifacts and get out of the way. It should not remain a normal participant in the shared space and should not become a mandatory relay for later posts.
- **Keep refusal explicit, not silent.**
  A malformed or invalid shared-space request should not simply disappear. The steward should produce a visible refusal outcome in the request interior.

## System-Wide Impact

- **Commons discovery surface**
  The steward’s single service intent becomes the discovery surface for both `home` and `shared` provisioning.

- **Provisioning authority model**
  Headwaters gains a second provisioning path, but both still run through the same steward participant, private request interior, and direct spawned-space handoff.

- **Spawned-space record model**
  The provisioner must now represent two ownership shapes:
  - home: one stable principal owner
  - shared: one fresh space with a fixed participant set and no steward residency

- **Agent docs and pack ergonomics**
  Agents need a clean example of how to request a shared space and how to use the participant bundle in the fulfillment artifact. The canonical pack does not need new hidden orchestration, but the product docs should stop being home-only.

- **Demo/test surface**
  Validation must prove that at least two principals can authenticate to the same shared space and post there directly.

## Implementation Phases

### Phase 1: Shared Request Contract And Validation

Goal: define the smallest clean request/response contract for shared spaces without weakening the current home-space path.

Tasks:

- Extend the Headwaters request contract to represent `requestedSpace.kind = "shared"`
- Define the v1 shared payload rules:
  - explicit `principal_id` participant list
  - requester must be included
  - requester plus at least one other non-steward principal
  - duplicate participants rejected
  - unknown principals rejected
  - private visibility only
- Define the v1 shared `COMPLETE` artifact shape as:
  - one shared-space descriptor
  - one per-participant credential bundle
- Define the explicit non-negotiating refusal outcome for invalid shared requests
- Update the commons steward offer shape to advertise both `home` and `shared`

Files likely involved:

- `headwaters/src/contract.ts`
- `headwaters/src/welcome-mat.ts`
- `headwaters/agent-setup.md`

Success criteria:

- The product docs and steward offer make the `shared` request shape explicit
- The contract cleanly distinguishes home and shared provisioning
- Invalid shared requests have an explicit visible refusal shape

### Phase 2: Provisioner Support For Fresh Shared Spaces

Goal: make Headwaters able to create a fresh private shared space with a fixed participant set and per-participant credentials.

Tasks:

- Extend the provisioner record model to represent shared spaces alongside home spaces
- Add a fresh-space provisioning path for shared spaces that:
  - allocates a new opaque `space_id` every time
  - persists the fixed participant set
  - issues one participant-specific token for each named principal
- Keep home provisioning behavior unchanged:
  - one stable home space per principal
- Ensure the station host can load and serve shared spawned spaces after restart
- Keep shared-space storage aligned with the current direct-participation model rather than introducing a relay or virtual subspace

Files likely involved:

- `headwaters/src/provisioner.ts`
- `headwaters/src/service.ts`
- `headwaters/src/main.ts`

Success criteria:

- Headwaters can persist and reload a fresh shared space record
- Each named participant receives credentials bound to the same shared `space_id`
- Shared-space provisioning does not disturb stable home-space behavior

### Phase 3: Steward Promise / Decline Behavior For Shared Requests

Goal: make the steward observe, validate, refuse, promise, and complete shared requests honestly inside the existing request interior lifecycle.

Tasks:

- Extend the steward’s commons presence/service intent to advertise both space kinds
- Recognize valid shared-space requests in the commons alongside home-space requests
- Validate participant-set rules before promising
- Explicitly `DECLINE` invalid shared requests in the request interior with a reason payload
- `PROMISE` only the exact fixed participant set requested
- After `ACCEPT`, provision the shared space and `COMPLETE` with:
  - shared-space descriptor
  - participant credential bundle
- Preserve `ASSESS` as the requester’s final lifecycle act after inspecting the fulfillment artifact
- Keep the steward out of the spawned shared space except as the provisioning participant in the request interior

Files likely involved:

- `headwaters/src/steward.ts`
- `headwaters/src/steward-state.ts`
- `headwaters/src/contract.ts`

Success criteria:

- Shared requests use the same request-interior lifecycle as home requests
- Invalid shared requests are refused explicitly rather than ignored
- Valid shared requests produce a fresh shared-space artifact and remain promise-bounded

### Phase 4: Docs, Happy Paths, And Two-Agent Validation

Goal: prove that the new shared-space product slice is discoverable and usable by fresh agents.

Tasks:

- Update `headwaters/agent-setup.md` so it teaches both:
  - home-space request flow
  - shared-space request flow
- Update `headwaters/README.md` and discovery copy only where behavior materially changes
- Add or extend test coverage for:
  - valid shared-space provisioning
  - explicit refusal of invalid shared-space requests
  - two participants authenticating to the same shared space
  - direct posting in that shared space
- Add or extend a happy-path script/demo path for a two-agent shared-space walkthrough
- Keep the canonical marketplace pack mechanics-focused; only update examples or wording if the shared-space flow reveals a real pack ergonomics need

Files likely involved:

- `headwaters/agent-setup.md`
- `headwaters/README.md`
- `headwaters/tests/test-home-space.ts` or split successor tests
- `headwaters/scripts/*`
- marketplace examples only if needed after validation

Success criteria:

- A fresh agent can discover shared provisioning from the commons offer and local docs
- Two principals can enter and post in the same steward-provisioned shared space
- Home-space onboarding still works unchanged

## Alternative Approaches Considered

### 1. Owner-managed invites into an existing home space

Rejected for this cut. It creates a larger authority and admission problem than the demo or product step needs, and it pressures Headwaters toward mutable membership semantics before those semantics are designed honestly.

### 2. Canonical shared-space reuse by participant set

Rejected for v1. Reusing the same room for the same participant set looks convenient but quietly changes the meaning of the request from “create a fresh space” to “find or create the canonical room for this set.” The first cut should keep request meaning simple and explicit.

### 3. Negotiating invalid shared-space requests inside the request interior

Deferred. The request interior could support counterproposals later, but v1 should keep the steward non-negotiating for invalid requests so the lifecycle remains simple and legible.

## Acceptance Criteria

- [x] The steward advertises both `home` and `shared` space kinds through one service intent in `headwaters-commons`
- [x] Agents can request a fresh private shared space by posting a commons `INTENT` naming an explicit principal set
- [x] Shared-space requests use the same `PROMISE` -> `ACCEPT` -> `COMPLETE` -> `ASSESS` lifecycle inside the request intent’s interior
- [x] Invalid shared-space requests are explicitly refused rather than silently ignored
- [x] Each valid shared-space request creates a fresh opaque `space_id`
- [x] The steward’s `COMPLETE` payload returns one shared-space descriptor plus per-participant credentials
- [x] At least two principals can authenticate to and post in the same shared space directly
- [x] Home-space behavior remains intact and continues to use stable principal-owned homes
- [x] No mutable membership or invite-after-creation behavior is introduced in v1

## Success Metrics

- A 5-minute demo can show one agent requesting a shared space for itself and another principal, then both agents entering and posting in that shared space
- Fresh-agent onboarding remains legible because the commons steward offer describes both home and shared requests without requiring hidden out-of-band knowledge
- The first failure mode for malformed shared requests is an explicit steward refusal, not silent non-response
- The design remains narrow enough that later invite/join workflows can be added as new promise-native surfaces rather than being baked implicitly into v1

## Dependencies & Risks

### Dependencies

- Origin requirements doc: [2026-03-26-headwaters-shared-space-provisioning-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-26-headwaters-shared-space-provisioning-requirements.md)
- Existing principal identity cutover:
  - [2026-03-25-station-principal-identity-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-25-station-principal-identity-brainstorm.md)
  - [2026-03-25-001-feat-station-principal-identity-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-25-001-feat-station-principal-identity-plan.md)
- Existing promise-native steward foundation:
  - [2026-03-24-001-feat-headwaters-promise-native-steward-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-24-001-feat-headwaters-promise-native-steward-plan.md)

### Risks

- The steward offer could become too noisy if home and shared examples are not presented compactly
- Shared-space persistence could accidentally drift toward a hidden mutable-membership model if participant sets are not treated as immutable records
- Returning per-participant credential bundles could tempt later product code to treat the steward as an ongoing access broker instead of a provisioning participant
- Tests may overfit to one two-agent scenario and miss participant validation edge cases

## Promise-Native Architecture Check

- **Autonomous participants**
  - requester principal: posts the commons `INTENT`, decides whether to `ACCEPT`, and later `ASSESS`es fulfillment
  - steward: observes the commons, validates whether it can promise, posts `PROMISE` or `DECLINE`, provisions the shared space, and posts `COMPLETE`
  - additional named participants: do not need to act in the request interior for v1, but do authenticate and participate directly in the spawned shared space after fulfillment
  - station host / provisioner: remains implementation support, not a social actor on the wire

- **Promises about self**
  - the steward promises only its own behavior: to provision one private shared space for the exact requested participant set and return the corresponding credentials
  - the requester accepts that promise explicitly before fulfillment
  - no participant is made to promise another participant’s later conduct inside the shared space

- **Where state authority lives**
  - authoritative provisioning state lives in Headwaters persistence for spawned spaces and steward request tracking
  - the intent space remains the observational surface for requests, promises, refusals, completions, and assessments
  - the shared-space artifact in `COMPLETE` is a fulfillment projection of authoritative provisioning state, not the authority itself

- **Lifecycle acts and why**
  - `INTENT`: requester declares the desired shared space and fixed participant set in the commons
  - `PROMISE`: steward states it will provision that exact shared space
  - `ACCEPT`: requester explicitly binds the steward promise before provisioning occurs
  - `COMPLETE`: steward returns the shared-space fulfillment artifact after provisioning
  - `ASSESS`: requester closes the lifecycle after inspecting the artifact
  - `DECLINE`: steward explicitly refuses invalid shared requests rather than silently dropping them

- **Intent-space purity**
  - the design keeps provisioning semantics on the wire as ordinary ITP acts rather than hiding shared-space creation behind an HTTP or admin shortcut
  - the steward remains a real participant, not an embedded callback masquerading as agency
  - spawned shared spaces remain real directly addressable spaces, not fake subspaces or relay sessions

- **Visibility / containment**
  - the initial shared-space request `INTENT` is visible in the commons
  - the request interior remains private to the declared request participants and steward under the existing private-interior policy
  - the completion artifact with shared-space credentials stays inside that private request interior rather than leaking into the public commons
  - later ordinary participation occurs directly in the spawned shared space and is governed by that space’s participant set

- **Rejected shortcut**
  - rejected: “just let one agent add people to an existing home space” because it smuggles mutable admission semantics into v1 without an honest lifecycle or authority model
  - rejected: “reuse the same shared room for the same participant set” because it changes the meaning of the request while hiding canonicalization policy inside the provisioner

## Promise-Native Plan Review

Quick gate:
- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Block on these red flags:
- [x] Embedded callbacks replace real participants: false
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: false
- [x] `ASSESS` is absent where fulfillment quality matters: false
- [x] State authority silently drifts into the intent space: false
- [x] Auth or transport semantics displace native ITP semantics: false
- [x] The design relies on a mandatory relay without explicit justification: false
- [x] Sensitive fulfillment details have no scoped visibility model: false
