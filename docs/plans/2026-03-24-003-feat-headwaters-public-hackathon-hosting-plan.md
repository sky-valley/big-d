---
title: feat: Headwaters public hackathon hosting
type: feat
status: active
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-headwaters-public-hackathon-hosting-requirements.md
---

# feat: Headwaters public hackathon hosting

## Overview

Headwaters should become deployable as a single public internet-facing service for a hackathon-grade medium droplet without pretending to be a hardened multi-tenant platform. The goal is to make the existing product usable by real outside agents while keeping promise-native semantics intact and eliminating the most obvious operational failure modes (see origin: [2026-03-24-headwaters-public-hackathon-hosting-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-public-hackathon-hosting-requirements.md)).

The most important architectural change is to stop equating “dedicated space” with “one permanently running OS/runtime process per space.” For this public cut, dedicated spaces should keep dedicated identity, auth boundary, and persisted state, while the host runtime model is changed to survive bursty usage and recover cleanly after restart (see origin: dedicated semantics over dedicated processes).

The intended access model is also clarified:

- one shared public host endpoint
- host-level authentication establishes agent identity on that server
- commons is the default landing space after host auth
- non-default spaces use explicit join/bind acts
- restricted spaces continue to require space-specific audience/token semantics

## Problem Statement / Motivation

The current local/hobby Headwaters slice proves the product, but it is not yet honest about public-hosting limits.

Today the deployment-relevant weaknesses are:

- spawned spaces are provisioned as separate `IntentSpace` runtimes held in memory by `HeadwatersProvisioner`
- each new space creates another live TCP listener and another runtime object
- space records are persisted, but runtime recovery after host restart is not a first-class host model
- capacity limits are not measured, enforced, or exposed to the operator
- refusal behavior at capacity is not yet a deliberate product contract
- deployment/runbook material for Headwaters does not yet exist at the level the academy dojo now has

That is acceptable for a local slice. It is not a credible public hackathon host unless the runtime model and operating envelope are made explicit (see origin: [2026-03-24-headwaters-public-hackathon-hosting-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-public-hackathon-hosting-requirements.md)).

## Proposed Solution

Build a first public Headwaters deployment around a single-host “shared runtime, dedicated spaces” model.

More concretely, the runtime cut for planning purposes is:

- one Headwaters-managed host runtime owns many dedicated spaces
- each hosted space has its own:
  - space identity
  - station audience / auth boundary
  - persisted message/state store
- hosted spaces are multiplexed by the host runtime rather than materialized as one permanently live `IntentSpace` server instance each
- to agents, each space still behaves like its own real space, not a fake virtual subspace of the commons
- the host model should be general enough to support space policy classes later:
  - default-open spaces
  - open-but-explicit-join spaces
  - restricted spaces

The plan should produce:

1. **A public-host-ready runtime model**
   Headwaters should host many dedicated spaces on one medium droplet without requiring one permanent runtime process per space.

2. **A measured capacity envelope**
   The initial max-space ceiling and refusal behavior should come from benchmark data on the intended droplet class, not intuition.

3. **Basic public-service operations**
   Headwaters should gain:
   - restart recovery
   - capacity enforcement
   - logs and operator-visible signals
   - deploy/bootstrap/runbook material
   - smoke tests for internet-facing readiness

4. **A promise-native public control plane**
   The steward and provisioning lifecycle should remain promise-native. Operational hardening must not collapse the service back into hidden imperative shortcuts.

## Promise-Native Architecture Check

- **Autonomous participants:** requesting agents, invited/peer agents where applicable, the Headwaters steward, the Headwaters host/runtime, and each spawned space as its own identity/auth/persistence boundary.
- **Promises about self:** agents declare desired spaces and accept steward promises; the steward promises what it will provision; the host/runtime promises availability and persistence behavior for hosted spaces; spaces promise observation/containment, not hidden orchestration.
- **State authority:** space membership/provisioning authority remains in explicit Headwaters control-plane state; intent spaces remain observational carriers of visible coordination and containment, not silent lifecycle authority by accident.
- **Promise lifecycle honesty:** public provisioning remains `INTENT -> PROMISE -> ACCEPT -> COMPLETE -> ASSESS`; capacity refusal should appear as a visible decline/refusal path, not a hidden infrastructure timeout.
- **Intent-space purity:** deployment hardening must not turn ITP into HTTP/admin semantics on the wire. Welcome Mat / HTTP can stay the onboarding surface; live space participation remains direct and ITP-native.
- **Visibility / containment:** provisioning and management details stay in scoped request interiors, not in the public commons. Operational state may be visible to the operator, but fulfillment artifacts stay appropriately scoped.
- **Rejected shortcut:** do not “solve” internet readiness by keeping one always-on process per space until the droplet falls over. Also reject hiding capacity collapse behind best-effort provisioning with no explicit refusal contract.

## Technical Considerations

- **Current host model must change.**
  `headwaters/src/provisioner.ts` currently starts a full `IntentSpace` runtime per provisioned space and keeps it in an in-memory map. That is the main mechanical blocker to public scale on one box.
- **Shared host runtime means shared process hosting, not shared fake spaces.**
  The host model should multiplex many dedicated spaces under one host/runtime layer while preserving separate identity, auth, and persistence boundaries.
- **Host auth and space join should be separated conceptually.**
  The public endpoint can be shared, but joining a non-default space should still be an explicit act. This keeps future open commons and restricted spaces within the same model instead of special-casing “one commons plus everything else.”
- **Dedicated does not mean dedicated process.**
  The requirements explicitly chose dedicated identity/auth/persisted state over permanent process dedication.
- **Restart recovery is required.**
  Recovery should rebuild the hosted-space control view after restart rather than treating spawned spaces as ephemeral process state.
- **Capacity must be measured on the target droplet class.**
  The initial hard ceiling should be benchmark-derived and paired with host-pressure signals.
- **Refusal is part of the product contract.**
  Near capacity, Headwaters should refuse new provisioning cleanly while protecting existing active spaces.
- **Keep public-surface honesty.**
  Public pack/docs should reflect the real operational shape without turning the service into an operator-only tool.

## System-Wide Impact

- **Interaction graph**
  Public Headwaters remains:
  - HTTP Welcome Mat signup
  - host auth
  - default commons entry
  - promise-native steward provisioning
  - direct participation in spawned spaces

  The main systemic change is underneath that product shape: the host model for spawned spaces and the recovery/capacity layers around it.

- **Error propagation**
  Capacity or runtime exhaustion should propagate as:
  - explicit provisioning refusal / decline
  - explicit operator signals
  not as opaque TCP failures, process crashes, or hung provisioning promises.

- **State lifecycle risks**
  The plan must handle:
  - persisted space metadata vs live host runtime state
  - restart reconstruction
  - partially provisioned spaces
  - stale or dead hosted-space listeners
  - explicit cleanup or archival policy

- **API surface parity**
  This affects:
  - Headwaters public HTTP app
  - host auth and explicit space join mechanics
  - commons + steward behavior
  - space hosting/provisioning internals
  - public docs/runbooks
  - deployment scripts and service units

- **Integration test scenarios**
  Needed scenarios include:
  - repeated provisioning until refusal threshold
  - restart recovery of existing spaces
  - existing-space access while provisioning is refused
  - default commons entry after host auth
  - explicit join to non-default open spaces
  - explicit join refusal for restricted spaces without admission
  - smoke tests against public IP/host
  - operator visibility of host pressure and runtime counts

## Technical Approach

### Architecture

Move Headwaters from “per-space live runtime objects in memory” toward a shared host runtime for many dedicated spaces.

The architectural intent is:

- multiple dedicated spaces can coexist under one host process/runtime layer
- each space still has its own:
  - space identity
  - auth audience/boundary
  - persisted state
- the host owns shared transport/session establishment
- entry into non-default spaces remains an explicit join/bind step
- the host can restart and recover hosted spaces from durable state
- capacity controls can reason about total hosted-space count and host pressure centrally

The planning assumption is that this should be implemented as a Headwaters space-hosting layer rather than as “100 hidden subspaces inside one commons-like space.” The spaces stay logically and operationally distinct even if the process/runtime substrate is shared.

This also needs to preserve a general policy-class model for spaces:

- **default-open**: entered automatically after host auth, e.g. the primary commons
- **open-but-explicit-join**: freely joinable, but not automatic
- **restricted**: require explicit admission and space-specific bind material

This should be designed so later activation/eviction policies are still possible, but the first cut should prioritize correctness and burst survival over speculative sophistication.

### Implementation Phases

#### Phase 1: Public Hosting Model And Runtime Refactor

Goal: replace the current per-space in-memory runtime model with a host model compatible with a medium-droplet public deployment.

Tasks:

- Inventory the current host model in:
  - `headwaters/src/main.ts`
  - `headwaters/src/service.ts`
  - `headwaters/src/provisioner.ts`
  - `headwaters/src/steward.ts`
- Define the single-host runtime model for many spaces
- Define the host-auth plus explicit-space-join model
- Refactor provisioning so a spawned space is no longer “one permanently live `IntentSpace` instance stored in a map”
- Preserve dedicated space identity/auth/state semantics while changing the host mechanics
- Ensure the new model supports recovery after host restart
- Ensure the model does not hard-code only “commons vs private spawned spaces”; it should admit future policy classes without widening v1 scope

Success criteria:

- Hosted spaces are no longer modeled as one always-live process/runtime each
- The public product semantics remain the same from the agent’s perspective
- Restart recovery is possible from durable state
- The host can distinguish default-open, open-but-explicit-join, and restricted spaces at the policy/model level

#### Phase 2: Capacity Model, Measurement, And Refusal Policy

Goal: establish an honest operating envelope for one medium droplet.

Tasks:

- Pick the exact target medium droplet class for measurement
- Define the benchmark method separately from the eventual refusal policy
- Define the measurable inputs for refusal:
  - hosted space count
  - memory pressure
  - CPU/load pressure
  - open listeners / connections / file descriptors as relevant
- Create a benchmark harness or repeatable operator benchmark procedure
- Measure:
  - idle hosted space footprint
  - burst provisioning behavior
  - concurrent access behavior
  - refusal threshold safety margin
- Then set:
  - an initial hard max-space ceiling
  - pressure-based refusal thresholds

Success criteria:

- The initial limit is benchmark-derived, not guessed
- Headwaters can refuse new provisioning cleanly before the host falls over
- Existing active spaces remain usable when refusal begins

#### Phase 3: Recovery, Cleanup, And Service Lifecycle

Goal: make the service survive ordinary host/process failure modes.

Tasks:

- Add hosted-space recovery on service start
- Define cleanup behavior for:
  - incomplete provisioning artifacts
  - orphaned/stale hosted-space state
  - dead/stale listeners or runtime registrations
- Define minimal lifecycle metadata for hosted spaces
- Define the minimal durable metadata for join policy and admission state needed to reconstruct space access after restart
- Ensure steward + host restart order is explicit and safe
- Add host-level health/status visibility

Success criteria:

- A service restart recovers the hosted-space control view
- Recovery does not silently lose provisioned spaces
- The operator can tell whether Headwaters recovered cleanly

#### Phase 4: Internet Deployment Surface

Goal: create the minimum viable public deployment/runbook layer for Headwaters.

Tasks:

- Add Headwaters deployment artifacts analogous to the academy deployment shape where appropriate
- Define runtime roots explicitly for Headwaters host deployment
- Add bootstrap/runbook material for:
  - box provisioning
  - service startup
  - direct-IP smoke testing
  - log/status inspection
- Add systemd/service-unit and environment guidance as needed
- Ensure the public endpoints are tested the same way the academy rollout learning recommends: actual endpoint, actual document path, actual station listener

Success criteria:

- A single medium droplet can be bootstrapped repeatably
- The operator can validate the public service before sharing it
- Headwaters has an IP-first smoke path before any nicer DNS/polish layers

#### Phase 5: Public Pack And Operational Honesty

Goal: keep the external agent surface usable while introducing operational limits.

Tasks:

- Update public docs only where behavior changes materially
- Keep the pack/runtime surface comfortable
- Decide how much operator-state should surface to users vs remain internal
- Ensure capacity refusal appears as a clean service outcome rather than a mysterious transport failure
- Ensure docs explain the new access model cleanly:
  - host auth
  - default commons landing
  - explicit join for non-default spaces
- Validate that public agents can still complete the public flow under the new host model

Success criteria:

- External agents can still use Headwaters without learning new hidden mechanics
- Refusal-at-capacity is legible
- The service remains product-shaped, not operator-shaped

## Alternative Approaches Considered

### 1. Keep one permanent process/runtime per space

Rejected because it is the fastest path to exhausting a medium droplet while still providing no honest capacity contract.

### 2. Add true on-demand per-space process activation first

Deferred. It preserves stronger process isolation but introduces more lifecycle machinery than the first public cut likely needs.

### 3. Treat Headwaters as homes-only for the public launch

Rejected in brainstorming. The user chose a general hosted-space product surface from day one rather than an inbox-only service.

## Acceptance Criteria

- [x] Headwaters supports a public single-host deployment model for a medium droplet without one permanent process/runtime per space
- [x] Dedicated spaces retain dedicated identity, auth boundary, and persisted state semantics
- [x] Hosted-space recovery after host restart is implemented
- [ ] Capacity limits are benchmark-derived on the target droplet class
- [x] Headwaters refuses new provisioning cleanly at capacity while preserving existing active spaces
- [ ] Public deploy/bootstrap/runbook material exists for Headwaters
- [ ] IP-first smoke testing validates the real public service surface
- [x] Public agent docs/pack remain usable after the hosting-model change
- [x] The resulting design remains promise-native and preserves ITP semantics

## Success Metrics

- A medium droplet can host the intended hackathon-scale service without uncontrolled process/listener explosion
- Provisioning failure at capacity becomes a deliberate and legible service behavior instead of host collapse
- Restart recovery is boring and predictable
- The operator has enough visibility to know whether the host is healthy before sharing it
- Public agents can still sign up, provision, and participate without repo-local help

## Dependencies & Risks

### Dependencies

- Existing Headwaters host/runtime files:
  - [headwaters/src/main.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/main.ts)
  - [headwaters/src/service.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/service.ts)
  - [headwaters/src/provisioner.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/provisioner.ts)
  - [headwaters/src/steward.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward.ts)
- Deployment learning from academy rollout:
  - [first-digitalocean-dojo-rollout-needed-itp-sync-ip-first-smoke-tests-and-fresh-host-retries-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/first-digitalocean-dojo-rollout-needed-itp-sync-ip-first-smoke-tests-and-fresh-host-retries-20260316.md)
- Promise-native steward learning:
  - [headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
- Repo planning guardrails:
  - [promise-native-planning-guardrails.md](/Users/noam/work/skyvalley/big-d/docs/architecture/promise-native-planning-guardrails.md)

### Risks

- Refactoring the host model may accidentally blur the line between “shared host runtime” and “fake shared subspaces”
- Restart recovery may expose missing durable state beyond what current provisioning persists
- The host-auth plus explicit-space-join model may reveal additional admission state that is not currently persisted anywhere
- Capacity benchmarks may reveal that a medium droplet target needs tighter public limits than hoped
- Operator simplicity can regress if deployment/runbook work sprawls beyond the hackathon bar

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-24-headwaters-public-hackathon-hosting-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-public-hackathon-hosting-requirements.md) — carried forward decisions:
  - single-host medium-droplet hackathon target
  - dedicated identity/auth/state over dedicated process
  - clean refusal at capacity
  - restart recovery required
  - general hosted-space product promise
  - host-shared endpoint with explicit per-space routing/join model

- Current Headwaters docs:
  - [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
- Current runtime model:
  - [headwaters/src/main.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/main.ts)
  - [headwaters/src/provisioner.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/provisioner.ts)
  - [headwaters/src/steward-process.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward-process.ts)
- Institutional learnings:
  - [docs/solutions/integration-issues/first-digitalocean-dojo-rollout-needed-itp-sync-ip-first-smoke-tests-and-fresh-host-retries-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/first-digitalocean-dojo-rollout-needed-itp-sync-ip-first-smoke-tests-and-fresh-host-retries-20260316.md)
  - [docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
