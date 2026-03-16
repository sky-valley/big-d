---
title: "feat: Deploy friend dojo"
type: feat
status: active
date: 2026-03-16
origin: docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md
---

# feat: Deploy friend dojo

## Overview

Deploy a small, invite-only internet dojo that outside friends can use with their agents.

The goal is narrower than “launch intent.space publicly.” The goal is:

- publish the academy at `academy.intent.space`
- run a TLS-backed station + tutor on the internet
- let invited friends point their agents at the pack and complete the dojo
- gather real external learnings before moving toward broader free use or hackathon onboarding

This is the shortest phase between today’s local proof and real outside validation.

## Current Reality

Local protocol and onboarding are no longer the main blocker.

What is already proven locally:

- the station supports deployable TCP/TLS transport
- the tutor handles registration, proof-of-possession, and the ritual
- the academy pack exists and is now trimmed around the effective agent interface
- Codex, Claude, and Pi can all complete the dojo and same-session interview in one pass
- after the latest pack cleanup, all three can do so without generating helper files in the workspace

Recent proof points:

- [docs/runbooks/internet-intent-space-station.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/internet-intent-space-station.md)
- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
- `/tmp/dojo-harness-interview-onepass-cleanup/report.json`

So the question is no longer “does the dojo concept work?”

The question is “what still stops us from running a small friend-facing deployment safely and legibly?”

## What Is Actually Stopping Us

### 1. No deployed academy surface yet

The pack exists in `docs/academy/`, but it is not yet being served as the real `academy.intent.space` onboarding surface.

Without that:

- friends have no canonical URL
- the short tester prompt points to a future surface, not a live one
- we cannot verify that live HTTP content matches the current repo state

### 2. No deployed TLS station/tutor runtime yet

The station and tutor work locally, but there is no real deployed service topology yet:

- no chosen host or VM/container target
- no service supervision
- no actual certificate and DNS wiring
- no live station endpoint to hand to invited friends

### 3. No friend-safe operating model yet

Phase 1 does not need full public-hardening, but it still needs a basic operating stance:

- who is invited
- where they connect
- what happens if a stranger shows up
- what logs/transcripts we keep
- how we restart or rotate the tutor cleanly

Right now the social model exists conceptually, but not yet as an operator checklist.

### 4. No deployed smoke-test checklist yet

We have strong local validation, but no “deploy and verify” checklist that ends with:

- academy page reachable
- station reachable over TLS
- registration works from a clean external machine
- final tutorial acknowledgment visible

This is still an ops gap, not a protocol gap.

### 5. No external feedback loop yet

Once the first friends arrive, we need a defined way to collect:

- their agent transcript
- local `.intent-space/` artifacts
- whether they passed cleanly or with confusion
- what confused them most

The post-dojo interview exists locally in the harness, but the deployed friend flow still needs a lightweight counterpart.

## What Is Not Stopping Us

These should not be treated as blockers anymore:

- raw protocol viability
- self-generated identity + challenge-response
- tutor ritual shape
- academy pack basic sufficiency
- whether real skill-native agents can do it

Those are now good enough to move forward.

## Proposed Solution

Run a very small production-shaped deployment with four explicit pieces:

1. **Academy HTTPS surface**
   Publish `docs/academy/` at `academy.intent.space`.

2. **Station runtime**
   Run `intent-space` as a long-lived TLS service on a stable host.

3. **Tutor runtime**
   Run `npm run tutor` as a separate long-lived process against that station.

4. **Invite-only operator workflow**
   Keep access socially constrained at first, but run the system like a real service with restart, logs, validation, and a clear feedback request.

This keeps the architecture intact while giving friends a real target to use.

## Deployment Topology

### Public surfaces

- `https://academy.intent.space`
  Human/agent-readable onboarding pack

- `academy.intent.space:<dojo-port>` or equivalent host/port
  TLS-backed station endpoint

### Runtime split

- academy served statically
- station process supervised separately
- tutor process supervised separately

### Identity/trust model

- TLS protects transport
- identity remains app-layer registration
- tutorial remains the soft gate
- no heavy auth wall for the first cohort

## Implementation Phases

### Phase 1: Publish the academy

Goal: make the canonical onboarding surface real.

Tasks:

- choose where `academy.intent.space` is hosted
- publish current `docs/academy/` content there
- ensure the live academy includes:
  - `agent-setup.md`
  - `skill-pack/SKILL.md`
  - `skill-pack/references/QUICKSTART.md`
  - `skill-pack/references/FORMS.md`
  - `contracts/*.json`
  - `skill-pack/scripts/reference_dojo_client.py`

Deliverable:

- `https://academy.intent.space` is real and serves the current pack

### Phase 2: Deploy the station

Goal: run the station as a stable TLS service.

Tasks:

- choose the host
- provision DNS + certificate
- choose the external station host/port shape
- run `npm start` in `intent-space/` with:
  - `INTENT_SPACE_TLS_PORT`
  - `INTENT_SPACE_TLS_CERT`
  - `INTENT_SPACE_TLS_KEY`
  - `DIFFER_INTENT_SPACE_DIR`
- ensure the process restarts cleanly on failure

Deliverable:

- a stable TLS station endpoint that speaks the same semantics as local

### Phase 3: Deploy the tutor

Goal: keep the tutor as a separate participant and make it durable.

Tasks:

- run `npm run tutor` against the deployed station
- give it its own persistent data/log area
- make restart behavior explicit
- ensure the tutor can be stopped/restarted without changing station semantics

Deliverable:

- live registration + ritual path available on the deployed station

### Phase 4: Friend-ready operator workflow

Goal: make the first invited-friends loop runnable without improvisation.

Tasks:

- create a tiny operator checklist:
  - academy reachable
  - station reachable
  - tutor connected
  - registration challenge appears
  - ritual reaches `ASSESS`
- define the invite handoff:
  - academy URL
  - station endpoint if not discoverable
  - short tester prompt
- define what to ask back from friends:
  - transcript
  - `.intent-space/` state
  - pass/fail note
  - what confused their agent most

Deliverable:

- one repeatable “invite a friend” workflow

### Phase 5: External smoke run

Goal: verify the deployed dojo before inviting the first real friend.

Tasks:

- run the deployed dojo once from a clean machine
- complete registration + ritual
- verify final acknowledgment and reward
- confirm the academy surface and live station still align

Deliverable:

- one successful deployed dry run

### Phase 6: First friend cohort

Goal: run the first small-circle validation.

Tasks:

- invite a tiny number of friends
- start with Jeremie’s agent as the anchor validation
- collect transcripts and friction points
- record what still blocks broader free use

Deliverable:

- first real external validation of the station

## Operational Minimum

This does not need full platform engineering yet.

It does need:

- supervised station process
- supervised tutor process
- TLS certs
- DNS
- persistent logs
- a restart procedure
- a short smoke test

Anything beyond that is optional for the first cohort.

## Acceptance Criteria

### Functional

- [ ] `academy.intent.space` serves the live dojo pack
- [ ] the station is reachable over TLS from outside the local machine
- [ ] the tutor is connected and responding
- [ ] an invited agent can register and complete the dojo against the deployed service
- [ ] the short tester prompt is sufficient for first-contact onboarding

### Operational

- [ ] station restart procedure is documented
- [ ] tutor restart procedure is documented
- [ ] a smoke test can verify academy + station + tutor together
- [ ] the operator knows what artifacts to ask from friends after a run

### Validation

- [ ] one deployed dry run succeeds before inviting friends
- [ ] one invited friend completes the dojo
- [ ] learnings are documented before moving to broader free use

## Risks

### 1. Academy/station drift

The live academy could diverge from the actual deployed station behavior.

Mitigation:

- treat `docs/academy/` as the publish source
- republish from repo deliberately
- always smoke-test after a publish

### 2. Duplicate tutor or stale runtime state

We already saw locally that duplicate managed sessions can create fake “protocol noise.”

Mitigation:

- one supervised tutor process only
- explicit process ownership
- explicit deploy smoke test

### 3. Soft-gate trust model is enough for friends, not for the open internet

This deployment is okay for a small circle, but not a true semi-public launch.

Mitigation:

- keep the cohort invite-only for now
- defer real admission control to the next phase

### 4. External latency or network differences expose assumptions hidden by localhost

Mitigation:

- dry-run from a clean external environment before inviting friends
- preserve transcripts for diagnosis

## Recommended Sequence

This is the shortest sensible order:

1. publish academy
2. deploy station
3. deploy tutor
4. run deployed smoke test
5. invite Jeremie
6. invite a few more friends
7. document friction before any broader opening

## CTO Readout

Very little is stopping us now, but the remaining blockers are real.

The biggest gap is no longer protocol design. It is deployment discipline:

- make the academy real
- make the station real
- make the tutor durable
- define a tiny operator workflow
- run one clean external smoke test

That is enough to launch a small friend dojo.

## Sources

- [docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md)
- [docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
- [docs/runbooks/internet-intent-space-station.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/internet-intent-space-station.md)
- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
- [docs/academy/README.md](/Users/noam/work/skyvalley/big-d/docs/academy/README.md)
- [docs/academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/docs/academy/agent-setup.md)
