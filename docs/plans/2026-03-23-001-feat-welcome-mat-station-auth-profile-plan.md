---
title: "feat: Welcome Mat station auth profile"
type: feat
status: completed
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md
---

# feat: Welcome Mat station auth profile

## Overview

Replace the academy station's custom registration ritual with a canonical Welcome Mat discovery and signup flow, then define a general intent-space station auth profile for post-enrollment ITP participation.

This plan carries forward the origin decisions exactly:
- Welcome Mat becomes the canonical discovery and signup surface for stations (see origin: `docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md`)
- ITP remains the live participation protocol, not a pure HTTP API replacement (see origin: `docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md`)
- post-enrollment auth is a Welcome-Mat-aligned station profile adapted honestly to ITP rather than pretending raw RFC 9449 applies unchanged on TCP+NDJSON (see origin: `docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md`)
- academy is the first proving implementation, but the profile itself must be general and upstream-socializable (see origin: `docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md`)

## Problem Statement

The current academy onboarding path still relies on a custom registration subspace and a tutor-managed proof-of-possession challenge:
- registration lives in `registration` and is taught throughout the pack (`academy/skill-pack/SKILL.md`, `academy/skill-pack/references/*`)
- tutor verifies `publicKeyPem` plus a signed challenge inside that subspace (`academy/src/tutor.ts`)
- harness grading and contract examples depend on that same ritual (`academy/src/harness.ts`, `academy/contracts/registration-*.json`)

That shape succeeded as a first proving ground, but it now creates unnecessary fragmentation at first contact. Welcome Mat already supplies a real external pattern for:
- machine-readable discovery via `/.well-known/welcome.md`
- self-generated key identity
- explicit terms retrieval and signed consent
- proof-of-possession signup over HTTP

The risk is overcorrecting in the wrong direction. If we simply replace the station with HTTP APIs or pretend DPoP is unchanged on raw TCP, we would muddy the core reason ITP exists: clean promise-native wire semantics and spatial coordination without HTTP state machinery colonizing the protocol.

So the problem is not “how do we bolt Welcome Mat onto academy?” It is:

How do we adopt Welcome Mat canonically for station discovery and signup, while defining a clean station auth profile for ITP participation that preserves intent-space semantics and can be explained upstream as a principled extension rather than a local fork?

## Proposed Solution

Introduce a two-boundary model:

1. **HTTP enrollment boundary**
   - publish `/.well-known/welcome.md`
   - serve station terms and signup endpoints
   - validate Welcome Mat enrollment using self-generated key identity, ToS signature, and proof-of-possession

2. **ITP participation boundary**
   - keep the station on ITP/TCP(+TLS)
   - require a station auth envelope/profile for connection setup and live participation
   - bind ongoing participation to the enrolled key and station-issued or approved token model

After successful signup, the service returns the station endpoint, tutorial space, and ritual greeting contract. The agent then enters the dojo by posting the ritual greeting in `tutorial` as its first live station act.

This preserves the clean split:
- Welcome Mat governs discovery and enrollment
- ITP governs participation and coordination
- auth remains a boundary layer, not a semantic payload model

## Technical Approach

### Architecture

Define and implement a new **Intent-Space Station Auth Profile** with these layers:

#### Layer 1: Welcome Mat HTTP surface

Add an academy HTTP discovery and signup surface that includes:
- `GET /.well-known/welcome.md`
- `GET /tos`
- `POST /api/signup`

The welcome file should describe:
- service name and description
- cryptographic requirements
- terms and signup endpoints
- post-signup handoff details for station participation
- tutorial handoff contract

The signup endpoint should:
- validate Welcome Mat-style proof-of-possession and consent artifacts
- derive or approve the station identity handle
- return the canonical enrollment result for station use

#### Layer 2: Station auth profile

Define a general station profile document under `intent-space/` or `docs/` that specifies:
- what enrollment artifact is carried from HTTP signup to station participation
- what is authenticated at connection/session setup
- what is optionally or mandatorily proven per message
- how freshness and replay resistance work on ITP
- how scope binding works in spatial terms

The profile should not claim to be literal RFC 9449 over TCP. Instead it should explicitly say:
- Welcome Mat / DPoP informs identity and proof philosophy
- ITP uses a station-native proof envelope bound to station host, target space, ITP act/message, freshness data, and token reference

#### Layer 3: Academy tutorial handoff

Successful signup must hand the agent to the dojo without reviving the old registration ritual.

The first live act becomes:
- connect/authenticate to station
- post ritual greeting in `tutorial`

The tutor should then begin at the tutorial phase, not at registration verification.

### Implementation Phases

#### Phase 1: Define the profile and handoff contract

Deliverables:
- a general station auth profile spec document
- academy-specific handoff contract from signup to tutorial
- terminology chosen for upstream discussion

Tasks:
- write the station auth profile document with concrete field definitions and validation rules
- decide exact token model:
  - preserve agent self-signed token unchanged
  - or return station-issued token while still binding it to the enrolled key
- define connection/session auth fields
- define per-message proof fields
- define tutorial handoff response shape
- decide where the spec lives so it is clearly general, not academy-only

Success criteria:
- the profile is implementable without inventing behavior later
- the profile keeps intent-space semantics auth-agnostic
- the profile is explainable upstream in one page of clear language

#### Phase 2: Replace academy registration with Welcome Mat signup

Deliverables:
- welcome mat endpoints in academy HTTP surface
- tutor no longer owns registration verification
- pack no longer teaches the `registration` ritual

Tasks:
- add `/.well-known/welcome.md`, `/tos`, and `/api/signup`
- implement signup validation and enrollment result generation
- remove registration challenge/response handling from `academy/src/tutor.ts`
- remove `registration`-phase assumptions from `academy/src/harness.ts`
- remove or repurpose `academy/src/station-contract.ts` registration constants
- update academy contracts and examples to start at tutorial after signup

Success criteria:
- academy no longer depends on the custom registration subspace
- an enrolled agent can begin at tutorial directly
- all active docs teach the new canonical path

#### Phase 3: Add station auth enforcement to ITP participation

Deliverables:
- authenticated station connection/session setup
- station-side proof validation for live participation
- runtime and SDK support for the new profile

Tasks:
- extend `intent-space/src/client.ts` and server-side space handling to support the new auth envelope
- define where auth verification happens relative to the service-intent introduction
- add Python SDK/runtime support so agents can:
  - discover Welcome Mat
  - fetch terms
  - enroll
  - store resulting auth artifacts
  - connect and speak ITP with station auth
- keep the runtime mechanical and shell-like; do not encode dojo workflow

Success criteria:
- live station participation is bound to enrolled identity
- replay/freshness checks exist in the station profile
- the Python runtime remains the preferred mechanics surface for agents

#### Phase 4: Re-teach, dogfood, and validate

Deliverables:
- updated pack and dojo agent
- passing tutor/unit/integration tests
- passing full agent harness matrix
- upstream explanation draft for Jer/Extro

Tasks:
- rewrite `academy/agent-setup.md`, `academy/README.md`, and `academy/skill-pack/*`
- update `academy/scripts/dojo-agent.py` to dogfood the new path
- update tests in `academy/tests/`
- rerun local dojo and full harness matrix:
  - `scripted-dojo`
  - `codex`
  - `claude`
  - `pi`
- write a short upstream note comparing:
  - Welcome Mat core
  - station auth profile extension
  - why ITP participation still stays off pure HTTP

Success criteria:
- the dojo still completes end-to-end
- the pack teaches only the new canonical path
- the resulting design is strong enough to share upstream

## Alternative Approaches Considered

### 1. Keep the current custom registration ritual and only mention Welcome Mat

Rejected because it preserves fragmentation and undermines the stated goal of canonical alignment.

### 2. Use Welcome Mat for signup only, but keep the current unauthenticated station wire

Rejected because the user explicitly wants full adoption rather than partial interoperability theater, and because it leaves station identity as a weaker second-class concern.

### 3. Move the entire station to HTTP APIs

Rejected because it would blur or erase the value of a promise-native spatial wire protocol and collapse participation into HTTP state patterns.

### 4. Claim raw RFC 9449 DPoP applies unchanged to TCP+NDJSON

Rejected because it is mechanically dishonest. DPoP v1 binds proofs to HTTP method and URL; the correct move is a derived station profile, not terminology slippage.

## System-Wide Impact

### Interaction Graph

Current:
- agent reads academy pack
- agent connects to station
- agent posts registration intent in `registration`
- tutor posts challenge in registration child subspace
- agent posts signed challenge response
- tutor verifies and acknowledges
- agent enters tutorial

Planned:
- agent fetches `/.well-known/welcome.md`
- agent fetches `/tos`
- agent signs ToS and generates proof artifacts
- agent posts `/api/signup`
- academy enrollment service validates and returns station participation artifacts plus tutorial handoff
- agent connects/authenticates to station
- agent posts ritual greeting in `tutorial`
- tutor begins tutorial directly

This moves registration responsibility:
- from tutor + station transcript
- to HTTP enrollment boundary + station auth validator

### Error & Failure Propagation

New failure points:
- welcome file missing or malformed
- terms retrieval mismatch or stale cache
- signup validation failure
- token/profile mismatch between HTTP enrollment and ITP connection
- per-message proof rejected due to freshness, scope, or token mismatch

Plan implications:
- academy must preserve enough structured failure details for agents and harness analysis
- station auth failures must be explicit and legible, not generic disconnects
- harness classification must distinguish:
  - signup failure
  - station-auth failure
  - tutorial failure

### State Lifecycle Risks

Critical lifecycle transitions:
- enrollment record creation
- token issuance or approval
- station session establishment
- tutorial state creation

Partial failure risks:
- successful signup but unusable station session artifact
- valid station session but failed tutorial handoff
- duplicate or replayed signup attempts
- stale ToS invalidating station participation unexpectedly

Mitigations to include:
- idempotent re-consent/re-signup semantics keyed by enrolled identity
- explicit enrollment success payload contract
- clear separation between enrollment state and tutorial state
- replay/freshness handling in the station auth profile

### API Surface Parity

Surfaces that must change together:
- academy HTTP onboarding surface
- academy pack docs and examples
- Python runtime / SDK mechanics
- dojo dogfood agent
- tutor logic
- harness prompts and grading logic
- station implementation / client runtime

This cannot be landed as a docs-only or tutor-only change. It is a coordinated cutover.

### Integration Test Scenarios

1. Fresh agent discovers `/.well-known/welcome.md`, signs up, authenticates to station, and completes the dojo.
2. Agent signs up successfully but attempts station participation with invalid or stale auth proof and gets a clear failure.
3. Agent reconnects after enrollment and can resume participation without repeating the tutorial unless the product explicitly requires it.
4. ToS changes invalidate old enrollment artifacts correctly and trigger a clean re-consent path.
5. Replay or duplicate signup/material use is rejected without corrupting tutorial state.

## Acceptance Criteria

### Functional Requirements

- [x] `/.well-known/welcome.md` exists and is the canonical first-contact discovery surface for academy/station.
- [x] Academy serves a Welcome Mat-compatible terms and signup flow.
- [x] The current custom registration ritual is removed from the canonical path.
- [x] Successful enrollment returns a clean handoff to station participation plus tutorial entry instructions.
- [x] ITP participation requires the new station auth profile.
- [x] Tutor begins at tutorial greeting / ritual handling rather than registration verification.
- [x] The Python runtime and dogfood dojo agent support the new flow end-to-end.
- [x] The full external agent harness still passes on the new canonical path.

### Non-Functional Requirements

- [x] Intent-space core semantics remain unchanged and auth-agnostic.
- [x] The station auth profile is explicit about where it follows Welcome Mat and where it extends beyond HTTP DPoP.
- [x] Auth failures are explicit and diagnosable for agents.
- [x] The new surface remains agent-comfortable and shell-like rather than framework-heavy.

### Quality Gates

- [x] Unit tests cover signup validation and station auth checks.
- [x] Integration tests cover HTTP enrollment to ITP tutorial handoff.
- [x] Harness classifications distinguish signup, station auth, and tutorial failures.
- [x] Active docs and examples contain no stale registration-subspace instructions.
- [x] Upstream explanation draft is written and coherent.

## Success Metrics

- External agents can enroll and complete the dojo without the current registration ritual.
- The pack no longer needs registration challenge/response examples.
- Dogfood path uses the same canonical flow as external agents.
- The resulting architecture can be described succinctly as:
  - Welcome Mat for discovery/signup
  - station auth profile for ITP participation
  - dojo as first proving ground

## Dependencies & Prerequisites

- `academy` HTTP surface can host new discovery and signup endpoints.
- `intent-space` can accept a new auth boundary without changing its core semantics.
- Python runtime remains the canonical agent mechanics surface.
- Welcome Mat v1 conventions remain stable enough for adoption.

## Risk Analysis & Mitigation

- **Risk: auth layer leaks into protocol semantics**
  - Mitigation: keep all auth language and validation in a separate station profile and boundary layer docs.

- **Risk: replay/freshness model becomes too weak or too complex**
  - Mitigation: decide the station proof envelope first and test explicit failure cases before tutorial cutover.

- **Risk: agents become less comfortable with the new surface**
  - Mitigation: keep the Python runtime shell-like, visible, and mechanical; dogfood with `dojo-agent.py` and rerun the full matrix.

- **Risk: upstream alignment language is muddy**
  - Mitigation: use precise terminology: “Welcome Mat-aligned station auth profile for ITP,” not “plain DPoP over TCP.”

- **Risk: coordinated cutover leaves stale docs or contracts behind**
  - Mitigation: treat this as a clean break with a full stale-reference sweep and no backward-compatibility baggage.

## Documentation Plan

Update or replace:
- `academy/README.md`
- `academy/agent-setup.md`
- `academy/skill-pack/SKILL.md`
- `academy/skill-pack/references/QUICKSTART.md`
- `academy/skill-pack/references/REFERENCE.md`
- `academy/skill-pack/references/FORMS.md`
- `academy/skill-pack/references/MICRO_EXAMPLES.md`
- academy contract examples currently teaching registration challenge flow
- `docs/runbooks/dojo-agent-evaluation-harness.md`
- intent-space/station profile docs describing the new auth boundary

Add:
- general station auth profile spec
- Welcome Mat alignment notes and upstream explanation draft

Remove:
- stale registration ritual docs, examples, contracts, and harness assumptions

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-23-welcome-mat-station-auth-profile-requirements.md)
  - Carried-forward decisions:
    - Welcome Mat is canonical for station discovery and signup
    - ITP remains the live participation protocol
    - station auth is a Welcome-Mat-aligned ITP profile, not fake raw DPoP

### Internal References

- [intent-space/INTENT-SPACE.md](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [academy/src/tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
- [academy/src/harness.ts](/Users/noam/work/skyvalley/big-d/academy/src/harness.ts)
- [academy/src/station-contract.ts](/Users/noam/work/skyvalley/big-d/academy/src/station-contract.ts)
- [academy/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- [intent-space/src/client.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/client.ts)
- [docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
- [docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)

### External References

- Welcome Mat well-known example: https://welcome-m.at/.well-known/welcome.md
- Welcome Mat spec: https://welcome-m.at/spec/
- RFC 9449 (DPoP): https://www.rfc-archive.org/getrfc?rfc=9449
- RFC 7638 (JWK Thumbprint): https://datatracker.ietf.org/doc/html/rfc7638
