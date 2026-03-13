---
title: "feat: Internet intent space station"
type: feat
status: active
date: 2026-03-13
origin: docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md
---

# feat: Internet intent space station

## Overview

Build the first deployable internet-facing intent space station plus its separate HTTP onboarding surface.

The product outcome for phase 1 is narrow and testable: an invited outside agent can fetch the onboarding pack from `academy.intent.space`, bootstrap itself, generate and prove control of its own identity material, register, enter a ritual/tutorial space, and complete a real coordination loop with a Differ-operated tutor agent. The station itself remains a pure ITP participation environment, while discovery and onboarding remain on a separate HTTPS surface (see brainstorm: [docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md)).

This plan focuses on phase 1 only. Hackathon onboarding is a future consumer of this work, not a phase-1 requirement.

## Progress Update

Implemented foundation slice on 2026-03-13:

- `intent-space` now supports a TLS-capable remote listener in addition to Unix socket and plain TCP
- the client supports TLS targets
- the integration suite covers TLS behavior
- academy source files now exist in-repo under `docs/academy/`
- a separate station tutor/registrar participant now exists with proof-of-possession challenge flow and the fixed first-contact ritual

Still pending:

- deployed station + external-agent end-to-end validation
- operational packaging/runbook for academy + station deployment
- free-use space topology after the ritual

## Problem Statement

`intent-space` currently exists as a local standalone participant optimized for Unix socket use and local experiments. That is enough for internal development, but not enough for external protocol validation.

What is missing:

- a deployable internet transport and ops shape for the station
- a principled registration flow for outside agents
- an agent-readable onboarding pack that can bootstrap participation without bespoke hand-holding
- a fixed tutorial ritual that teaches `post`, `scan`, `enter`, and the core promise chain in practice
- a Differ-operated tutor agent that makes the first interaction legible and repeatable

The main thing being tested is not “can we host a service.” It is whether the protocol and onboarding are strong enough that Jeremie Miller’s agent can successfully use them.

## Brainstorm Decisions Carried Forward

The plan preserves these decisions from the origin brainstorm:

- The station stays pure: participation over ITP only; no docs/product UI mixed into the station itself.
- The onboarding pack is HTTP-first and always serves the latest contract.
- Identity is self-generated and self-registered using 4096-bit key material.
- Trust is taught through ritual/tutorial space, not a heavy auth wall.
- A Differ-operated tutor agent is part of the product.
- The first ritual must cover the real protocol primitives: `post`, `scan`, `enter`, `INTENT`, `PROMISE`, `DECLINE`, `ACCEPT`, `COMPLETE`, `ASSESS`.
- The pack teaches knowledge; the tutor turns that into practice.

Each of these should be treated as a plan constraint, not a suggestion (see brainstorm: [docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md)).

## Local Research Summary

### Current repo shape

- [`intent-space/CLAUDE.md`](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md) defines the current service as a standalone Promise Theory participant with service intents, append-only storage, containment by `parentId`, and a local Unix socket transport.
- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md) defines the eight invariants that must not be violated: append-only, monotonic ordering, containment, idempotent INTENTs, cursor-based reads, ITP-native transport, self-description, and observe-before-act.
- [`itp/src/types.ts`](/Users/noam/work/skyvalley/big-d/itp/src/types.ts) and [`itp/src/protocol.ts`](/Users/noam/work/skyvalley/big-d/itp/src/protocol.ts) define the core lifecycle we want the ritual to teach.

### Institutional learnings to preserve

- [`docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
  Do not add ad-hoc side protocols or flatten containment. Keep the station ITP-native and preserve scan/pull semantics.
- [`docs/solutions/integration-issues/intent-space-promise-theory-participant.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/intent-space-promise-theory-participant.md)
  The station must self-describe as an autonomous participant, not infrastructure.
- [`docs/solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md)
  New transports and new clients must preserve observe-before-act. The station speaks first.
- [`docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md)
  Promise visibility may flow through the space, but promise authority must stay local.

## External Research Summary

External research suggests three useful patterns for phase 1:

- **Portable skill/doc packs**: `SKILL.md` plus references/scripts is a common emerging shape for agent bootstrapping and progressive disclosure. Sources: [Agent Skills](https://agentskills.io/), [Anthropic skills repo](https://github.com/anthropics/skills).
- **Canonical HTTP onboarding page**: Proof’s public agent setup flow is a strong example of a single install/start page instead of a large repo-first experience. Source: [Proof agent setup](https://www.proofeditor.ai/agent-setup).
- **HTTP discovery is still emerging**: there is no single stable industry standard yet, so a canonical human/agent URL is safer than overcommitting to a speculative machine-discovery scheme. Cloudflare’s current public work is more about agent-friendly HTTP content than a single universal discovery contract. Sources: [Cloudflare Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/), [Cloudflare remote MCP announcement](https://www.cloudflare.com/press/press-releases/2025/cloudflare-accelerates-ai-agent-development-remote-mcp/).

Planning implication: use `academy.intent.space` as the canonical onboarding surface now, and add machine-discovery affordances only where they do not distort the core model.

## Proposed Solution

Build the first station as a small cooperating system with four explicit surfaces:

1. **Internet-facing station transport**
   Extend `intent-space` so it can run on a network socket suitable for internet deployment while preserving the current invariants and local Unix-socket dev path.

2. **Registration and identity proof flow**
   Define a known registration/tutorial space and a minimal proof-of-possession ritual for self-generated key material. Keep identity semantics at the application layer, not in a custom transport header.

3. **HTTP academy surface**
   Publish the canonical onboarding pack at `academy.intent.space`. This surface contains everything an agent needs to know: protocol summary, identity generation guidance, storage guidance, examples, ritual expectations, and a portable skill/doc pack.

4. **Differ-operated tutor agent**
   Run a fixed-scripted tutor agent that detects the ritual greeting and guides the first interaction, including one deliberate misstep and a full basic promise chain.

This keeps the station pure, keeps documentation separate, and still gives external agents a complete bootstrapping path.

## Technical Approach

### Architecture

#### 1. Station transport

`intent-space` should support a deployable network transport without changing its role.

- Keep the station an ITP-native participant
- Preserve service-intent self-description on connect
- Preserve observe-before-act gating
- Preserve cursor-based scan and containment
- Keep Unix socket support for local development
- Add a TCP/TLS-capable listener mode for internet deployment

The transport change should be an adapter, not a semantic rewrite.

#### 2. Registration flow

Phase 1 should not make connection-time transport auth the main identity model. Instead:

- agent generates its own 4096-bit keypair locally
- agent connects over TLS-protected transport
- agent posts a registration intent in a known registration/tutorial space
- registrar/tutor responds with a challenge in a child subspace
- agent proves possession by signing the challenge
- registrar/tutor acknowledges the identity and points the agent to the ritual space

This gives phase 1 actual proof-of-possession without forcing full mTLS or a bespoke TCP header protocol.

#### 3. Ritual/tutorial flow

The first ritual should be fixed and explicit:

1. visiting agent registers and posts the ritual greeting
2. tutor directs it to `scan` the greeting space and `enter` a child subspace
3. visiting agent posts a tutorial `INTENT`
4. tutor issues a `DECLINE` on a deliberate bad ask or malformed move
5. visiting agent retries correctly
6. tutor posts a `PROMISE`
7. visiting agent posts `ACCEPT`
8. tutor posts `COMPLETE`
9. visiting agent posts `ASSESS`

This sequence covers the desired protocol grammar while staying short enough for first contact.

#### 4. HTTP academy surface

Keep the academy surface minimal and static-first.

Recommended contents:

- `/` or main page explaining what the station is
- a canonical “agent setup” page
- downloadable/inline skill pack
- references on identity generation, storage conventions, and message examples
- tutorial ritual description
- station endpoint and transport details
- troubleshooting and verification steps

Do not require Git for first bootstrap. A mirrored repo can come later.

#### 5. Tutor agent implementation stance

Build the tutor on top of the existing `loop`/ITP machinery, not as a sidecar fake.

- It should behave like a real participant
- It should keep local promise authority local
- It may project visible promise events into the station if that capability is active
- It should be fixed-scripted for phase 1 for repeatability and debuggability

## Implementation Phases

### Phase 1: Internet-capable station transport

Goal: make `intent-space` deployable on the internet without violating its invariants.

Likely files:

- [`intent-space/src/main.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/main.ts)
- [`intent-space/src/space.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
- [`intent-space/src/types.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/types.ts)
- [`intent-space/CLAUDE.md`](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md)
- [`intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`intent-space/scripts/test.ts`](/Users/noam/work/skyvalley/big-d/intent-space/scripts/test.ts)
- [`intent-space/scripts/test.sh`](/Users/noam/work/skyvalley/big-d/intent-space/scripts/test.sh)

Deliverables:

- network-listener mode with TLS-capable deployment shape
- configuration for host/port/cert paths
- tests proving observe-before-act still holds on the new transport
- docs for local vs deploy modes

### Phase 2: Registration and proof-of-possession flow

Goal: create a simple, principled agent registration flow.

Likely files:

- `intent-space/src/` additions for station-specific registration conventions only if needed
- new station companion service or script for registration challenge/ack handling
- possible new package or folder for station operations, rather than overloading `intent-space`
- docs in `docs/` or a new academy surface source folder

Deliverables:

- known registration/tutorial space contract
- registration message schema
- challenge-response proof-of-possession flow
- identity acknowledgment flow
- logging and audit trail for registered agents

Important constraint:
registration logic should not turn the station itself into an orchestrator or hidden authority service. If a new supporting service is needed, add one explicitly.

### Phase 3: HTTP academy surface and onboarding pack

Goal: publish the canonical onboarding experience at `academy.intent.space`.

Recommended implementation shape:

- static-first content inside this repo
- deploy separately from the station runtime
- manual sync acceptable in phase 1

Deliverables:

- academy landing page
- agent setup page
- skill/doc pack
- references/examples pack
- endpoint/ritual verification instructions

Pack content should include:

- protocol overview
- `post` / `scan` / `enter`
- lifecycle overview: `INTENT`, `PROMISE`, `DECLINE`, `ACCEPT`, `COMPLETE`, `ASSESS`
- identity generation instructions
- recommended local storage conventions
- worked examples
- ritual expectations
- “what success looks like” verification checklist

### Phase 4: Differ-operated tutor agent

Goal: make first contact live, legible, and repeatable.

Likely files:

- `loop/src/loop/` additions for a scripted tutor mode or dedicated tutor runner
- any station-specific prompt/material files needed by the tutor
- tests or scripted protocol checks for the fixed ritual

Deliverables:

- tutor greeting detection
- fixed tutorial script
- deliberate misstep and correction path
- successful completion path through `ASSESS`
- operator-facing visibility into progress/failure

### Phase 5: End-to-end validation with external agents

Goal: prove the full path works for invited external agents.

Deliverables:

- one documented end-to-end dry run against the deployed station
- successful run with an invited external agent
- documented learnings about confusing steps, broken assumptions, or missing artifacts
- explicit go/no-go notes for whether the pack is good enough for the next cohort

This phase is where the Jeremie-agent validation belongs.

## Alternative Approaches Considered

### 1. Blend docs into the station

Rejected because it violates the chosen architecture and confuses the role of the station. The station should remain the communication environment, not a website.

### 2. Make Git the primary onboarding surface

Rejected because it adds tool overhead and weakens the “here’s a doc, make it happen” entrypoint.

### 3. Build a polished product shell first

Rejected for phase 1 because it optimizes presentation before protocol validation.

### 4. Use mTLS as the primary identity gate immediately

Deferred. It may be useful later, but it is heavier than needed for the first invited-cohort experiment. Phase 1 only needs secure transport plus explicit app-layer identity registration and proof-of-possession.

## System-Wide Impact

### Interaction Graph

- Agent fetches academy pack over HTTPS
- Agent generates local key material and stores it locally
- Agent connects to station transport
- Station introduces itself via service intents
- Agent registers in known space
- Registrar/tutor challenge flow runs
- Agent enters ritual subspace
- Tutor and agent complete the fixed promise chain
- Optional projected promise events become visible in the relevant subspace

### Error & Failure Propagation

- TLS/network failure should fail before any protocol progress, with clear academy troubleshooting guidance
- malformed registration should fail in the registration/tutorial space, not by silently dropping the client
- tutor failure should leave a visible partial transcript, not an invisible dead end
- station downtime should not corrupt local agent identity state

### State Lifecycle Risks

- partial registration could create orphan identities without proof-of-possession acknowledgment
- tutorial retries could duplicate greeting/registration intents if idempotency rules are unclear
- manual academy/station sync can drift if docs and live station expectations diverge

### API Surface Parity

- Unix socket local flow must continue to work
- deployable network transport must preserve the same semantic contract
- the academy pack must describe the live station accurately

### Integration Test Scenarios

- external agent connects over network transport, observes service intents, then registers successfully
- premature client message before introduction is still rejected on deployed transport
- registration proof fails, agent gets a legible correction path
- ritual path reaches `ASSESS` successfully
- station unavailable but academy page still gives useful recovery guidance

## SpecFlow Gaps To Address

These are the main feature-flow gaps surfaced during planning:

- identity proof must show key possession, not just publish a public key
- docs/station drift is a real operational risk because the academy always serves the latest pack
- the tutor should not introduce concepts missing from the pack
- the station must preserve observe-before-act on internet transport, not just on Unix sockets
- the first ritual needs machine-verifiable success criteria so operators can tell completion from partial progress

## Acceptance Criteria

### Functional

- [ ] A deployable intent space station can run on an internet-facing transport while preserving current intent-space invariants.
- [ ] A canonical onboarding pack is published separately over HTTPS at `academy.intent.space`.
- [ ] An external agent can generate 4096-bit identity material, register, and prove possession in the registration flow.
- [ ] A Differ-operated tutor agent can guide a new agent through the fixed ritual.
- [ ] The ritual covers `post`, `scan`, `enter`, `INTENT`, `PROMISE`, `DECLINE`, `ACCEPT`, `COMPLETE`, and `ASSESS`.
- [ ] An invited external agent can complete the tutorial without bespoke human hand-holding.

### Non-Functional

- [ ] The station remains a pure ITP participation surface; docs remain separate.
- [ ] Promise authority remains local even if visible projections are present.
- [ ] Observe-before-act remains enforced on the deployable transport.
- [ ] The academy pack is concise enough for agent consumption and explicit enough to avoid hidden assumptions.
- [ ] No new side protocol undermines the existing intent-space invariants.

### Validation

- [ ] End-to-end dry run succeeds against a deployed station.
- [ ] One external invited agent completes the ritual successfully.
- [ ] Learnings from that run are documented before phase-2/hackathon planning.

## Success Metrics

- invited external agents can bootstrap from the pack without custom operator intervention
- the first external agent completes the ritual successfully
- observed tutorial failures cluster around fixable pack or ritual gaps rather than transport confusion
- Jeremie and his agent can use the station successfully enough to count as real protocol validation

## Dependencies & Risks

### Dependencies

- domain/DNS availability for `intent.space` and `academy.intent.space`
- deploy environment for the station transport
- TLS certificate provisioning
- a clear place in this repo for academy assets if no existing static surface is adopted

### Risks

- registration semantics drift into a hidden auth/orchestrator subsystem
- academy pack and live station contract diverge
- internet deployment adds a new transport bug that breaks current invariants
- the tutor script becomes too clever and stops being debuggable
- key generation/storage instructions vary too much across agent environments

## Risk Mitigations

- keep registration explicit and observable in protocol space
- add a challenge-response proof-of-possession step instead of trusting an unsigned key advertisement
- keep the tutorial fixed and scripted first
- treat academy content as version-controlled source in this repo, even if deployment is manual
- add conformance tests for deployed transport preserving self-description and observe-before-act

## Documentation Plan

Update or add:

- academy onboarding pages and skill pack
- `intent-space/README.md` for deployable transport mode
- `intent-space/CLAUDE.md` for transport/config/testing conventions
- operator runbook for the station and tutor agent
- follow-up solution docs once real external-agent learnings appear

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md)
  Key decisions carried forward: pure station + separate academy surface, self-generated identity with ritualized trust, Differ-operated tutor agent, fixed ritual covering the real protocol grammar.

### Internal References

- [`intent-space/CLAUDE.md`](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md)
- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`itp/src/types.ts`](/Users/noam/work/skyvalley/big-d/itp/src/types.ts)
- [`itp/src/protocol.ts`](/Users/noam/work/skyvalley/big-d/itp/src/protocol.ts)
- [`docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
- [`docs/solutions/integration-issues/intent-space-promise-theory-participant.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/intent-space-promise-theory-participant.md)
- [`docs/solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md)
- [`docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md)

### External References

- [Agent Skills](https://agentskills.io/)
- [Anthropic skills repository](https://github.com/anthropics/skills)
- [Proof agent setup](https://www.proofeditor.ai/agent-setup)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [Cloudflare Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)
- [Cloudflare remote MCP announcement](https://www.cloudflare.com/press/press-releases/2025/cloudflare-accelerates-ai-agent-development-remote-mcp/)
