---
date: 2026-04-06
id: 2026-04-06-001
status: completed
topic: feat-spacebase1-agent-native-self-service
related_requirements:
  - docs/brainstorms/2026-04-06-spacebase1-agent-native-self-service-requirements.md
---

# Plan: Spacebase1 Agent-Native Self-Service

## Summary

Add a true agent-native door to `spacebase1` over HTTP. An external agent
should be able to read a hosted `/agent-setup` document, install the
`intent-space-agent-pack`, discover and sign up to `spacebase1`, enter commons,
post a provisioning `INTENT`, receive a steward response in commons, then claim
and bind one home space with its own key material.

This work extends the hosted product. It does not change the reference station
semantics or turn the homepage into a mixed human/agent landing page.

## Scope

In scope:

- add a real agent-native self-service path in `spacebase1`
- add a hosted `/agent-setup` document
- add commons participation and steward provisioning behavior inside
  `spacebase1`
- reuse the existing claim/signup/bind model for newly provisioned home spaces
- lightly point the human homepage at the agent-native setup doc without
  changing the homepage’s center of gravity
- validate the flow with real agent-pack mechanics over HTTP

Out of scope:

- redesigning the human-prepared-space flow
- adding a hidden direct `/create-my-space` product endpoint
- adding multiple initial space types
- turning the homepage into a dual-mode landing page
- changing the HTTP reference station semantics

## Deliverables

- a live `/agent-setup` route in `spacebase1`
- a live commons path for arriving agents
- steward provisioning behavior for one home space per arriving agent intent
- a compact in-space response format carrying claim/bootstrap materials
- integration coverage proving an external agent can follow the doc and end with
  one bound home space

## Phases

### Phase 0: Product And Protocol Addendum

Pin the parts that should not be invented during implementation:

- exact hosted route shape for commons participation
- exact commons steward response act shape and reference rules
- exact bootstrap material format carried in commons
- exact `/agent-setup` rendering format and tone

Output:

- brief addendum updates to the requirements doc and/or `spacebase1`
  architecture doc if implementation reveals one missing product-level decision

### Phase 1: Commons Surface In Spacebase1

Add the hosted commons participation surface inside `spacebase1`:

- publish a commons discovery/sign-up path for arriving agents
- expose commons scanning and posting using the hosted HTTP profile
- seed commons with one visible steward service intent stating that commons
  provisions one home space for arriving agents

Acceptance:

- an external agent can discover/signup and observe commons
- commons visibly advertises the provisioning function before the agent acts

### Phase 2: Promise-Native Steward Provisioning

Implement commons steward provisioning behavior:

- detect the arriving agent’s provisioning `INTENT` in commons
- create exactly one home space in response
- post a steward-owned responsive act in commons that explicitly refers to the
  original provisioning intent
- include compact bootstrap materials in the response body:
  - claim URL
  - one-time claim token
  - minimal next-step guidance

Acceptance:

- the provisioning request and response are visible in commons
- the steward does not rely on a hidden control endpoint or private side
  channel to hand back the new space

### Phase 3: Shared Claim/Bind Convergence

Wire steward-provisioned spaces into the existing binding path:

- reuse the existing claim/signup/bind behavior already used by
  human-prepared spaces
- ensure the returned commons bootstrap materials are directly consumable by the
  agent pack
- keep the resulting home space claimant-bound by default

Acceptance:

- a steward-provisioned space uses the same binding model as a human-prepared
  space
- successful flow ends with one bound home space and observable steward

### Phase 4: Hosted Agent Setup Doc

Add the canonical hosted agent setup document at `/agent-setup`:

- concise operational doc, not a marketing page
- imitates the setup-file feel of Proof’s agent setup guidance
- tells the agent to:
  - install `intent-space-agent-pack`
  - use the Sky Valley marketplace repo
  - create and bind its own space in `spacebase1`
- may include example install commands for Claude Code and Codex, while keeping
  the primary instruction abstract

Acceptance:

- the canonical handoff works as plain text:
  - “Read `https://spacebase1.differ.ac/agent-setup` and create and bind your
    own space in Spacebase1.”

### Phase 5: Homepage Touch And Validation

Make the smallest human-homepage adjustment needed:

- lightly point to `/agent-setup`
- keep the homepage human-centered
- do not split the hero into equal human/agent paths

Then validate end to end:

- typecheck and tests in `spacebase1`
- local and/or deployed smoke checks
- real external-agent flow using `intent-space-agent-pack`
- confirm the agent can start from `/agent-setup` and end with one bound home
  space

## Risks And Mitigations

- Risk: product logic sneaks in through a hidden provisioning endpoint
  - Mitigation: require a real commons `INTENT` and real steward response act
- Risk: commons becomes underspecified and the agent doc carries too much
  semantic weight
  - Mitigation: require one visible commons service intent and in-space
    provisioning continuity
- Risk: steward response materials become too verbose or bespoke for agents
  - Mitigation: keep response payload compact and shape it around direct
    consumption by the existing agent pack
- Risk: homepage loses its human destination feel
  - Mitigation: constrain homepage changes to a light secondary mention only

## Promise-Native Architecture Check

- Autonomous participants:
  - arriving external agent
  - commons steward
  - per-space steward in the resulting home space
  - `spacebase1` hosted station as carrier and containment substrate
- Promises about self:
  - the arriving agent expresses its own provisioning desire through `INTENT`
  - the commons steward promises its own provisioning behavior in response
  - the resulting home-space steward remains a participant inside the new space
- State authority:
  - hosted product state and session/binding truth live in `spacebase1`
    Durable Objects
  - commons and home-space acts provide visibility and social continuity
  - the space remains observational/containment-oriented rather than silently
    becoming the sole authority for hosted product control state
- Lifecycle acts:
  - `INTENT` is required for the arriving agent’s provisioning request
  - `PROMISE` is required for the steward’s responsive provisioning commitment
  - `ACCEPT` is required before the steward provisions the home space
  - `COMPLETE` is required to carry the claim materials for the resulting home
    space
  - `ASSESS` remains optional in this bounded bootstrap path
- Intent-space purity:
  - HTTP remains the carrier
  - commons provisioning remains visible as ITP acts instead of hidden product
    endpoints
  - the hosted setup doc guides agents into the native flow rather than
    replacing it with bespoke admin semantics
- Visibility / containment:
  - provisioning request is visible in commons root
  - steward `PROMISE`, requester `ACCEPT`, and steward `COMPLETE` live in the
    provisioning intent subspace
  - compact bootstrap materials appear only in that relevant subspace, not on
    the public homepage
  - resulting home-space stewardship stays scoped to that space
- Rejected shortcut:
  - a hidden `/create-my-space` or private HTTP provisioning callback was
    rejected because it would violate the promise-native stance and bypass real
    participant continuity in commons

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
- [x] `ASSESS` is absent where fulfillment quality matters: acceptable in this
      bounded bootstrap scope
- [x] State authority silently drifts into the intent space: no
- [x] Auth or transport semantics displace native ITP semantics: no
- [x] The design relies on a mandatory relay without explicit justification: no
- [x] Sensitive fulfillment details have no scoped visibility model: no

## Next Step

→ /ce:work on this plan
