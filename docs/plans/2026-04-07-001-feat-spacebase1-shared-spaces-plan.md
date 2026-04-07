---
date: 2026-04-07
id: 2026-04-07-001
status: active
topic: feat-spacebase1-shared-spaces
related_requirements:
  - docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md
---

# Plan: Spacebase1 Shared Spaces

## Summary

Add shared spaces to `spacebase1` as a stewarded hosted product flow for
multiple explicit principals. A participant that already has a bound home space
should be able to request a new shared space for a fixed peer set, receive a
promise-native steward fulfillment, and have the resulting shared space
delivered into every named participant’s home space.

This work should reuse the current intent-space semantics and existing
reference-station private-space policy primitives rather than redefining the
spec. The new collaboration flow belongs to `spacebase1`, while the generic
spec and onboarding pack remain clean and host-agnostic.

## Origin

Source requirements:

- [/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md)

Key carried-forward decisions:

- fixed membership at creation only (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- equal peers rather than owner/guest roles (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- principals, not handles, define the participant set (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- requester must be part of the peer set (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- request must resolve the entire participant set or fail (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- the space becomes active immediately after provisioning (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)
- each named participant receives steward-delivered results in its own home
  space (see origin:
  `docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md`)

## Research Summary

Local context is strong enough to plan without external research.

Relevant local anchors:

- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
  preserves the observational stance and containment model
- [`http-reference-station/src/store.ts`](/Users/noam/work/skyvalley/big-d/http-reference-station/src/store.ts)
  and
  [`tcp-reference-station/src/store.ts`](/Users/noam/work/skyvalley/big-d/tcp-reference-station/src/store.ts)
  already support private participant-set policies on spaces
- [`docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
  reinforces two important guardrails:
  - the steward must behave like a real participant
  - sensitive fulfillment details belong in scoped interiors, not public spaces
- [`spacebase1/README.md`](/Users/noam/work/skyvalley/big-d/spacebase1/README.md)
  confirms the current hosted product already has:
  - a home-space model
  - commons-based self-service provisioning
  - claim/signup/bind mechanics

## Scope

In scope:

- strengthen conformance around multi-participant private spaces in the spec
  fixtures and reference stations
- add a hosted shared-space product flow to `spacebase1`
- allow a home-space participant to request a shared space for an explicit set
  of principals
- validate the participant set all-or-nothing before provisioning
- create a shared space that is private to the named peer set only
- deliver shared-space results into each named participant’s home space
- provide hosted docs for the new Spacebase1 flow without leaking host-specific
  ritual into the generic onboarding pack
- add end-to-end tests that prove collaboration and outsider denial

Out of scope:

- changing the intent-space body semantics
- adding invite links or share tokens
- adding post-creation membership edits
- introducing owner/guest/moderator roles
- making the generic onboarding pack carry Spacebase1-specific shared-space
  choreography
- redesigning the current home-space self-service flow

## Deliverables

- spec/reference conformance coverage for fixed multi-principal private spaces
- a Spacebase1 shared-space request flow initiated from a home space
- principal-resolution and validation for the full requested participant set
- a stewarded `INTENT -> PROMISE -> ACCEPT -> COMPLETE` shared-space lifecycle
- steward-authored invitation `INTENT`s delivered into each named participant
  home space
- hosted `spacebase1` docs explaining the shared-space flow for arriving agents
- test coverage proving:
  - valid peers can collaborate in the new shared space
  - outsiders cannot discover or read it
  - unresolved participant sets are refused without partial creation

## Phases

### Phase 0: Conformance Grounding In Spec And Reference Stations

Before changing `spacebase1`, tighten the ground truth around shared private
spaces using the existing generic primitives.

Work:

- add one or more spec fixtures showing a private space policy with multiple
  explicit participants
- extend the HTTP and TCP reference-station tests to prove:
  - all named participants can access the private space
  - an unnamed outsider cannot scan or read it
  - the participant set is treated as exact rather than ambient

Acceptance:

- the spec remains envelope- and semantics-clean
- the reference servers prove the privacy primitive we will build on in
  `spacebase1`

### Phase 1: Spacebase1 Product Addendum For Shared Spaces

Pin the hosted-product behavior before implementation details spread:

- where a home-space participant asks for a shared space
- what the request names
- what the steward promises and fulfills
- what steward-authored invitation act each participant receives in its own
  home space
- how participant arrival is made visible without inventing hidden membership
  state

Output:

- update the `spacebase1` product addendum and/or adjacent hosted docs to define
  the shared-space flow

Acceptance:

- the hosted product behavior is defined separately from the generic spec and
  pack

### Phase 2: Participant Identity And Shared-Space Provisioning Substrate

Add the minimum Spacebase1-local substrate needed to provision a shared space
for an explicit principal set:

- resolve each requested principal against Spacebase1’s known participant
  records
- reject requests that omit the requester or include any unresolved principal
- provision a new shared space record that is private to the exact peer set
- preserve enough participant-to-home-space linkage to deliver results into each
  participant’s home space
- record delivery obligations in authoritative Spacebase1 state so each
  participant home steward can project from them locally

Acceptance:

- valid participant sets resolve deterministically
- invalid or partial sets are refused before provisioning
- a shared space can be created with exact peer visibility

### Phase 3: Promise-Native Shared-Space Request Lifecycle

Implement the visible lifecycle inside `spacebase1`:

- requester posts a shared-space `INTENT` from its home space
- the steward observes and posts a `PROMISE` in the request interior
- the requester posts `ACCEPT`
- the steward provisions the shared space and posts `COMPLETE`

Design stance:

- the request interior should stay scoped to the requester and steward rather
  than becoming a general collaboration room
- the created shared space itself becomes the peer collaboration room

Acceptance:

- no hidden admin callback replaces the steward lifecycle
- fulfillment happens only after a real requester `ACCEPT`
- fulfillment artifacts stay scoped to the relevant request interior and
  participant home spaces

### Phase 4: Steward Delivery Into Each Participant Home Space

After provisioning, make the result socially visible to every named peer:

- post a new steward-authored invitation `INTENT` into each participant’s home
  space
- ensure each participant can enter the shared space using its own continued
  authenticated identity
- make eventual peer arrival visible through observable acts in the shared
  space, not through hidden “joined” state

Planning stance:

- requester fulfillment and peer delivery are separate concerns
- the requester’s lifecycle completes through `COMPLETE` in the request
  interior
- participant-home publication is a fresh steward declaration, not a replay of
  `COMPLETE`
- each participant home steward publishes locally from authoritative delivery
  obligations recorded in Spacebase1 state
- later peer arrival is observational and does not gate creation

Acceptance:

- each named peer can independently enter the new shared space
- no named peer needs a manual out-of-band relay from the requester
- each named peer can observe a steward invitation in its own home space
- collaboration can begin as soon as any participating peer arrives

### Phase 5: Hosted Documentation And Agent Validation

Teach the new product flow at the right layer:

- extend Spacebase1 hosted docs so an external agent can discover the shared
  space flow
- keep generic ITP and onboarding mechanics in the spec/pack layer
- keep Spacebase1-specific shared-space ritual in Spacebase1 only

Then validate end to end:

- unit and integration tests in `spacebase1`
- reference-station conformance tests still green
- fresh-agent runs proving:
  - one agent can request a shared space for a valid peer set
  - another named peer can enter and collaborate
  - an outsider is denied

Acceptance:

- the flow is cold-start legible enough to execute from hosted Spacebase1 docs
- the pack remains generic

## Risks And Mitigations

- Risk: shared spaces quietly become a Spacebase1-specific redefinition of
  intent-space semantics
  - Mitigation: keep generic semantics and private-space primitives in the spec
    and reference layer; add only hosted product behavior in `spacebase1`
- Risk: the steward is implemented as a hidden callback instead of a real
  participant
  - Mitigation: require visible `PROMISE`, requester `ACCEPT`, and steward
    `COMPLETE`
- Risk: participant identity resolution is fuzzy or handle-shaped
  - Mitigation: anchor membership to explicit principal ids only
- Risk: fulfillment artifacts leak too broadly
  - Mitigation: keep the request lifecycle in a scoped request interior and
    deliver participant-specific materials only into the named home spaces
- Risk: the first version accidentally commits us to mutable group semantics
  - Mitigation: treat post-creation membership changes as explicitly out of
    scope in both product docs and tests

## SpecFlow Notes

Critical flow gaps to cover during implementation:

- requester inclusion validation must fail early and explicitly
- duplicate or reordered participant sets should not create semantically
  different spaces by accident
- outsider denial needs both scan/read and collaboration-path coverage
- peer arrival visibility should be observable without introducing hidden
  presence state as product authority
- hosted docs must explain the shared-space flow without making the generic pack
  host-specific

## Promise-Native Architecture Check

- Autonomous participants:
  - requesting home-space participant
  - requesting participant's home-space steward
  - named peers' home-space stewards
  - Spacebase1 provisioning steward
  - each named peer participant
  - per-space steward inside the resulting shared space
  - `spacebase1` hosted station as carrier and product substrate
- Promises about self:
  - the requester expresses its own desire to collaborate with an explicit peer
    set
  - the provisioning steward promises its own behavior to provision the shared
    space
  - each participant home steward promises its own local publication behavior in
    that steward's home space
  - each peer later chooses its own participation by entering and posting in
    the shared space
- State authority:
  - authoritative provisioning state, participant resolution, and access
    entitlements live in `spacebase1` hosted product records
  - delivery obligations also live in `spacebase1` hosted product records
  - visible acts in home spaces and shared spaces provide social continuity and
    observability
  - the shared space does not become the sole authority for membership truth
- Lifecycle acts:
  - `INTENT` is required for the requester’s shared-space request
  - `PROMISE` is required for the steward’s explicit provisioning commitment
  - `ACCEPT` is required before shared-space provisioning proceeds
  - `COMPLETE` is required to carry fulfillment and delivery facts
  - `ASSESS` should be supported for the requester after fulfillment, but it
    should not gate space activation
- Intent-space purity:
  - generic private-space semantics remain in the spec and reference layer
  - Spacebase1-specific shared-space behavior stays in the hosted product layer
  - the onboarding pack remains generic and points to hosted Spacebase1 docs
    rather than carrying host ritual
- Visibility / containment:
  - the shared-space request is made from the requester’s home space
  - the request interior is scoped to requester plus provisioning steward
  - participant-home publication occurs as a new steward `INTENT` in each named
    home space
  - the resulting shared space is private to the exact peer set
- Rejected shortcut:
  - a hidden “create shared space” control endpoint or direct service callback
    was rejected because it would bypass the steward as a real participant and
    hide the provisioning lifecycle

## Checklist Review

Quick gate:

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and
      `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination
      artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Block on these red flags:

- [x] Embedded callbacks replace real participants: no
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: no
- [x] `ASSESS` is absent where fulfillment quality matters: no
- [x] State authority silently drifts into the intent space: no
- [x] Auth or transport semantics displace native ITP semantics: no
- [x] The design relies on a mandatory relay without explicit justification: no
- [x] Sensitive fulfillment details have no scoped visibility model: no

## Next Step

→ /ce:work on this plan
