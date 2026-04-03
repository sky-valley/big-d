---
date: 2026-04-03
title: Build Spacebase1 Hosted Space Station
status: active
owners:
  - codex
source_requirements: /Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-03-spacebase1-hosted-space-station-requirements.md
---

# Build Spacebase1 Hosted Space Station

## Goal

Add a new hosted product surface, `spacebase1/`, that gives collaborators and
friends a low-friction way to create and claim real hosted intent spaces for
their agents.

Spacebase1 should combine:

- a human web door for creating a prepared space and receiving a generated
  agent handoff prompt
- an agent web door for direct self-service signup through HTTP
- steward-backed hosted spaces
- HTTP-first participation aligned with the spec and the HTTP reference station
- Durable Objects as the hosting substrate

It is a new product, not a revival of the archived Headwaters repo shape.

## Why This Change

The repo now has clean protocol and reference-station foundations:

- `intent-space/` defines the semantics
- `tcp-reference-station/` proves the TCP carrier
- `http-reference-station/` proves the HTTP carrier

What is still missing is the actual hosted product for real collaborators and
friends.

Without Spacebase1, onboarding still requires too much manual setup:

- humans cannot quickly prepare a space for an agent
- agents do not yet have a real hosted commons to self-serve through
- there is no product path that delegates hosting/infra while preserving the
  promise-native stance

Spacebase1 should fill that gap without regressing into:

- HTTP semantics replacing ITP semantics
- hidden product-only control flows
- silent identity minting on behalf of agents

## Scope

In scope:

- add a new hosted product project for Spacebase1
- implement a human web flow that provisions a prepared unbound space
- implement an agent HTTP flow that signs up, enters commons, and requests a
  home space from a steward
- generate a human-facing prompt plus advanced/debug handoff bundle
- issue one-time claim materials for prepared spaces
- ensure every created space gets a steward
- deploy the hosted service on a real internet-facing substrate
- use Durable Objects behind the hosted service
- validate the marketplace pack/skill against the hosted HTTP surface

Out of scope:

- human accounts, login, or dashboards
- rich management UI for existing spaces
- public social commons beyond a provisioning-lobby role
- TCP as a primary onboarding door
- broad admission-policy controls beyond the default one-claimant start
- cleanup/recovery policy beyond leaving room for a later pass

## Desired End State

### 1. Real Hosted Product

Spacebase1 exists as a real internet-facing service, not just another local
reference.

A human can visit it and immediately create a space for an agent.

An agent can visit it directly over HTTP and self-provision through commons.

### 2. Dual Honest Entry Doors

The two entry paths are both first-class, but semantically distinct:

- human-created spaces are provisioned directly by the web product in v1
- agent-created spaces are provisioned through a public commons and steward

Both remain honest about identity:

- webpage creation prepares a space
- the agent later binds it by enrolling with its own key material

### 3. Hosted Spaces Still Feel Like Real Intent Spaces

Every created space includes:

- a steward participant
- one visible service intent explaining the space and steward role

It should not feel like a hidden web-app record with a protocol skin on top.

### 4. HTTP-First Without Losing The Stance

Spacebase1 should reuse the HTTP reference doctrine rather than invent a new
product protocol:

- Welcome Mat-compatible HTTP discovery/signup
- framed ITP and station-support surfaces over HTTP
- HTTP as carrier, not ontology

### 5. Durable Objects As Hosting Substrate

Durable Objects should back the hosted runtime shape:

- public commons/control surface
- provisioned spaces
- claim and bootstrap coordination

without becoming the new agent-facing semantic model.

## Pre-Work Product Definition Gate

Before implementation begins, lock the few remaining product-defining items so
the app and backend do not invent them independently.

Must be pinned first:

- the exact public product surfaces in v1:
  - homepage
  - create-space page/state
  - claim flow
  - commons self-service path
- the visible handoff model:
  - generated prompt contents
  - advanced/debug bundle contents
- the minimum steward behavior and visible service-intent surfaces
- the initial claim semantics for prepared spaces:
  - one-time token
  - one successful permanent bind
  - post-claim locked state

Implementation should not improvise those in code.

## Implementation Strategy

### Phase 0. Product And Flow Addendum

Write a short product addendum under `docs/` that pins:

- exact human flow:
  - arrive
  - create immediately
  - receive prompt
  - optionally inspect advanced/debug bundle
- exact agent claim flow for human-created spaces:
  - install/update skill
  - use claim URL + claim token
  - enroll with own key material
  - bind and enter prepared space
- exact agent self-service flow:
  - arrive over HTTP
  - sign up
  - enter commons
  - ask steward for home space
  - connect directly to provisioned space
- minimum visible service intents for commons and spawned spaces

Deliverable:

- no product-critical behavior is left for implementation to invent

### Phase 1. Create The Spacebase1 Project Skeleton

Add a new sibling project, likely `spacebase1/`, with:

- runnable local dev mode
- clear README and local guidance
- project structure for web UI, HTTP surfaces, and Durable Object runtime
- explicit references back to:
  - `intent-space/`
  - `http-reference-station/`
  - marketplace skill/pack

This project should read as:

- hosted product built on the references

not as:

- another spec
- another generic reference station

Deliverable:

- a runnable project shell with the correct conceptual boundary

### Phase 2. Build The HTTP Hosted Control Surface

Implement the top-level product-facing HTTP surfaces:

- homepage with service explanation and immediate create flow
- create-space action for humans
- claim entry surface for prepared spaces
- public commons entry surface for agents

Keep these aligned with the HTTP reference station doctrine:

- Welcome Mat-compatible discovery/signup
- framed message carriage where appropriate
- no REST semantic rewrite of ITP

Deliverable:

- humans and agents can both enter the hosted system over HTTP

### Phase 3. Implement Durable Object Runtime Shape

Define and build the Durable Object backing model.

Likely decomposition:

- one commons/control object
- one object per provisioned space
- one product-level coordinator if needed for create/claim/bootstrap records

Rules:

- DOs are hosting/runtime primitives, not the agent-facing conceptual model
- hosted spaces remain real intent spaces
- direct space participation remains possible after provisioning/binding

Deliverable:

- hosted spaces are provisioned and run as durable isolated units

### Phase 4. Human-Created Prepared Space Flow

Implement the human door:

- immediate space creation
- optional intended-agent label or generated friendly placeholder
- unbound prepared-space state
- one-time claim URL + claim token
- generated prompt as the primary handoff artifact
- advanced/debug structured bundle

Important constraints:

- do not pre-bind agent identity
- do not silently mint agent keys or principal identity
- default admission stays one claimant only

Deliverable:

- a human can create a space and hand the generated prompt to an agent

### Phase 5. Commons + Steward Self-Service Flow

Implement the agent door:

- agent signs up over HTTP using installed skill
- agent enters commons
- commons steward accepts or handles the provisioning request
- steward provisions one home space
- agent receives direct connection details/materials and moves into that space

Keep this phase explicit about participant roles:

- the steward is a participant, not a hidden callback
- the commons is a provisioning lobby, not a catch-all chatroom

Deliverable:

- an agent can self-serve a home space without a human first creating one

### Phase 6. Per-Space Steward Presence

Ensure every created space includes a steward participant and one visible
service intent.

This phase should define:

- the steward’s minimal initial behavior in a spawned space
- the visible promise/service declaration
- what the steward can and cannot provision in v1

Deliverable:

- each new space feels intentional and self-explanatory without a noisy
  starter bundle

### Phase 7. Agent Handoff And Pack Validation

Use the marketplace skill/pack as the canonical mechanics surface for agents.

Validate:

- human-generated prompt is sufficient for an external agent to install/update
  the skill and claim a prepared space
- direct agent self-service works using the installed skill against Spacebase1
- the pack remains generic enough and does not need product-specific magic
  beyond explicit instructions/materials

Deliverable:

- the new hosted product is actually usable by agents, not just humans

### Phase 8. Internet Deployment And Operational Hardening

Deploy Spacebase1 as a real hosted service.

This phase should cover:

- Cloudflare deployment shape
- secrets and auth material handling
- public origin and routing
- environment defaults
- basic operational verification for create, claim, signup, commons, and space
  entry flows

Deliverable:

- Spacebase1 is reachable on the internet and usable by collaborators/friends

## Key Technical Decisions To Preserve

- Spacebase1 is HTTP-first and Welcome Mat-compatible over HTTP.
- HTTP remains a carrier/profile, not the semantic center.
- Durable Objects host the product runtime but do not become the conceptual API
  for agents.
- Human-created spaces are prepared, not pre-bound.
- Agent identity must be bound through the agent’s own key material and signup.
- Every created space gets a steward.
- Commons is a provisioning lobby in v1.
- Human direct create and agent commons self-service may differ in v1.
- The generated prompt is the primary human handoff artifact; the structured
  bundle is secondary and advanced/debug oriented.

## File And Surface Targets

Primary additions:

- `spacebase1/` (new hosted product project)

Likely touch points:

- [`intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
- [`http-reference-station/`](/Users/noam/work/skyvalley/big-d/http-reference-station)
- [`README.md`](/Users/noam/work/skyvalley/big-d/README.md)
- [`AGENTS.md`](/Users/noam/work/skyvalley/big-d/AGENTS.md)
- marketplace pack docs and validation paths as downstream consumers

Possible selective reuse:

- HTTP auth and framing doctrine from [`http-reference-station/`](/Users/noam/work/skyvalley/big-d/http-reference-station)
- store and service-intent patterns from the reference stations

## Validation

### Human Flow

- a human can load the homepage
- create a new space with minimal friction
- receive a generated prompt
- inspect the advanced/debug bundle if desired
- hand the prompt to an agent successfully

### Prepared Space Claim

- an agent can use the claim URL + one-time token
- the agent enrolls with its own key material
- the first successful claim permanently binds the space
- later claim attempts fail cleanly

### Agent Self-Service

- an agent can sign up over HTTP
- enter commons
- request one home space from the steward
- connect directly to that new space

### Hosted Space Behavior

- every created space has steward presence
- every created space has one visible service intent
- claimed spaces begin with claimant-only admission in v1
- the product does not rely on a hidden relay for normal participation after
  binding/provisioning

### Deployment

- the deployed service is reachable publicly
- claim, signup, commons, and spawned-space flows work against the real hosted
  service

## Risks And Mitigations

### Risk: The web app becomes the semantic center instead of the protocol

Mitigation:

- keep `intent-space/` as the normative source
- build Spacebase1 on top of the HTTP reference doctrine
- avoid REST/resource semantics replacing ITP semantics

### Risk: Prepared-space claims silently mint identity instead of binding real agent keys

Mitigation:

- require claimants to enroll with their own key material
- keep claim materials limited to bootstrap/authorization, not identity
- test binding behavior with the real skill/pack

### Risk: Steward behavior turns into hidden product automation

Mitigation:

- make the steward a real participant with visible service declarations
- keep human direct-create behavior explicit as a product exception in v1
- keep commons provisioning and per-space steward behavior narrow and inspectable

### Risk: Durable Object convenience distorts the product model

Mitigation:

- treat DOs as hosting substrate only
- keep product docs and agent-facing docs framed in intent-space terms
- preserve direct space participation after provisioning

### Risk: Frictionless human create leads to abandoned prepared spaces

Mitigation:

- accept immediate create in v1
- design the model to support later cleanup/expiry rules
- keep cleanup policy explicitly deferred rather than half-implemented

## Promise-Native Architecture Check

### Autonomous Participants

The autonomous participants are:

- human collaborators creating prepared spaces
- external agents claiming prepared spaces
- external agents entering commons and requesting a home space
- commons steward participant handling provisioning requests
- per-space steward participants present in created spaces
- the hosted station runtime maintaining shared visibility and containment

The plan avoids describing “the system” as a vague social actor where a real
participant should exist.

### Promises About Self

Promise-bearing acts remain about participant behavior:

- agents promise their own work inside spaces
- stewards promise what provisioning or support they themselves will do
- the hosted product may provision directly for humans in v1, but that is a
  product exception at the create edge, not a reason to hide steward promises
  once the space exists

The plan rejects “the steward auto-creates everything invisibly when it sees
traffic” as the primary model.

### State Authority

Authority is split explicitly:

- hosted runtime authority:
  - prepared-space records
  - claim-token validity
  - space provisioning records
  - admission/binding state
- intent-space visibility:
  - visible service intents
  - public `INTENT` / `PROMISE` / `COMPLETE` / `ASSESS` acts inside spaces
- local promise authority:
  - promise lifecycle truth for individual agents remains local and is not
    magically centralized by the hosted service

The space remains observational for promise lifecycles even though the hosted
product has authoritative records for provisioning and claim state.

### Required Lifecycle Acts

This product has two layers of lifecycle:

- hosted onboarding/provisioning lifecycle
- ordinary promise lifecycle inside spaces

For onboarding/provisioning:

- human direct-create in v1 does not require a public `PROMISE` chain on the
  wire because the webpage is the explicit create surface
- commons self-service should still use a real participant-facing lifecycle:
  - `INTENT` to request a home space
  - steward `PROMISE` to provision it
  - `COMPLETE` when direct connection materials are ready
  - `ASSESS` matters if the product wants explicit fulfillment-quality feedback,
    and the plan keeps room for it rather than assuming silent success

For ordinary work inside created spaces:

- no shortcut removes `PROMISE`, `ACCEPT`, `COMPLETE`, or `ASSESS` where the
  participants need them

### Intent-Space Purity

The design preserves intent-space purity by:

- keeping HTTP as a carrier/profile rather than ontology
- aligning with `intent-space/` and `http-reference-station/`
- using Durable Objects only as substrate
- avoiding a hidden web-app-only command model for normal participation

### Visibility / Containment

Visibility is intentionally scoped:

- commons exposes provisioning-lobby intents and steward declarations
- prepared human-created spaces are not publicly socialized through commons by
  default
- each claimed/provisioned space has its own interior with steward presence
- sensitive claim/bootstrap materials stay in the product handoff path, not as
  public space messages

### Rejected Shortcut

Rejected shortcuts include:

- pre-binding a human-created space to an invented agent identity before the
  agent shows up
- making the web app the only real control plane and reducing stewards to fake
  branding
- using Durable Objects as the agent-facing conceptual API
- forcing all provisioning through hidden backend callbacks with no real
  participant/steward surface

## Checklist Review

Quick gate:

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Block on these red flags:

- [ ] Embedded callbacks replace real participants
- [ ] “Promise-native” is claimed but the lifecycle is shortcut or hidden
- [ ] `ASSESS` is absent where fulfillment quality matters
- [ ] State authority silently drifts into the intent space
- [ ] Auth or transport semantics displace native ITP semantics
- [ ] The design relies on a mandatory relay without explicit justification
- [ ] Sensitive fulfillment details have no scoped visibility model

Result:

- pass; safe to proceed to implementation once the Phase 0 addendum is written

## Next Step

After this plan, implementation should begin with the Phase 0 product addendum
before code changes for the hosted service itself.

## Current Execution Slice

Completed in this first slice:

- Phase 0 product addendum
- Phase 1 project skeleton
- first product/control-surface slice for:
  - homepage
  - immediate prepared-space creation
  - generated handoff prompt
  - advanced/debug bundle
  - Durable Objects-backed prepared-space records and steward seeding

Deferred to later slices:

- real HTTP signup for commons
- proof-of-possession claim binding
- commons steward provisioning flow
- deployed public internet instance
