---
title: feat: Headwaters promise-native steward
type: feat
status: completed
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md
---

# feat: Headwaters promise-native steward

## Overview

Headwaters should stop provisioning spaces through an embedded `onStoredMessage` service callback and instead model provisioning as a real promise-governed interaction with a separate steward agent process. The steward should scan the commons, decide whether to promise, require explicit `ACCEPT`, provision the dedicated space itself, and `COMPLETE` with the fulfillment artifact inside a private request subspace. The requester should then inspect the result and `ASSESS` it to close the lifecycle.

This plan preserves the current successful product shape:

- Welcome Mat signup stays the front door
- Headwaters commons stays the initial rendezvous point
- spawned spaces remain real separately provisioned intent spaces with direct participation
- the public Python runtime pack remains the preferred mechanics surface

But it changes the core control-plane semantics to match the repo’s architectural stance (see origin: [2026-03-24-headwaters-promise-native-steward-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md)).

## Problem Statement / Motivation

The current Headwaters implementation proved the product slice, but it also exposed a philosophical mismatch:

- the steward is not a truly separate participant
- space creation is not currently governed by the promise lifecycle

Instead, the commons station calls embedded provisioning logic directly when it stores a matching request intent. That is expedient, but it weakens autonomy and makes the steward pattern less reusable.

The requirements doc makes the intended correction explicit:

- provisioning must become a real promise flow with `PROMISE`, `ACCEPT`, `COMPLETE`, and requester `ASSESS`
- the steward must run as a separate autonomous agent process
- provisioning details must remain private to the requester/steward subspace
- private request subspaces should be a general policy capability, not a provisioning-only hack

Those decisions are the basis of this plan (see origin: [2026-03-24-headwaters-promise-native-steward-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md)).

## Proposed Solution

Replace the embedded steward callback with three explicit layers:

1. **Generic station support for private subspace participant policy**
   Headwaters needs a way to mark an intent interior as visible only to a declared participant set. Provisioning requests will be the first user of that capability, but the capability itself should live below Headwaters-specific product logic.

2. **Separate Headwaters steward agent runtime**
   A dedicated steward process joins the commons like any other participant, scans for provisioning requests it can see, decides whether to promise, waits for explicit `ACCEPT`, provisions the space, then posts `COMPLETE` with the fulfillment artifact. The requester then `ASSESS`es the fulfilled result in the same private request subspace.

3. **Updated runtime/docs/eval loop around the new promise flow**
   The public Python pack and the Headwaters onboarding docs must remain applicable. The eval loop should test the new flow from fresh-agent prompts, not only repo-local dogfood scripts.

## Technical Considerations

- **Keep `intent-space/` generic.**
  Private subspace participant policy should be implemented as a generic station capability, not as a Headwaters-only special case.
- **Keep Headwaters Welcome Mat unchanged where possible.**
  Signup and commons auth are already working and should remain the front door.
- **Keep the public pack small.**
  The public pack should stay runtime + SDK, not grow a new public solved client.
- **Preserve direct spawned-space participation.**
  The steward should provision and hand off, but not become a relay.
- **Accept an explicit privileged agent.**
  In v1, the steward will be a separate but privileged service agent that both reasons and provisions directly.

## System-Wide Impact

- **Interaction graph**
  Signup still goes: HTTP Welcome Mat -> commons token -> station auth. The changed path begins after commons entry: provisioning `INTENT` in commons -> private request subspace -> steward `PROMISE` -> requester `ACCEPT` -> steward provisions via `HeadwatersProvisioner` or successor -> steward `COMPLETE` -> requester inspects the fulfillment artifact -> requester `ASSESS` -> requester reconnects to spawned space.

- **Error propagation**
  Errors move from embedded callback exceptions to agent-visible protocol outcomes. Provisioning failures should resolve as visible declines or failed promise fulfillment in the private request subspace, rather than only server-side exceptions. Successful fulfillment is not fully closed until the requester `ASSESS`es it.

- **State lifecycle risks**
  Today, provisioned spaces live in memory plus `space.json`. Splitting the steward into a separate process increases the need for explicit durable state and restart recovery for:
  - active provisioning requests
  - accepted but incomplete steward promises
  - already provisioned spaces and ownership

- **API surface parity**
  The new model affects:
  - Headwaters commons behavior
  - Headwaters onboarding docs
  - the public Python runtime examples/expected sequencing
  - the Claude eval loop prompt and interview framing

- **Integration test scenarios**
  The test surface needs to cover:
  - successful provisioning through full promise lifecycle
  - request subspace privacy enforcement
  - rejected or ignored provisioning requests
  - restart/recovery expectations for already provisioned spaces
  - fresh-agent usability of the public pack against the new flow

## Implementation Phases

### Phase 1: Generic Private Subspace Policy In The Station

Goal: make request interiors private to a declared participant set without collapsing the generic station design.

Tasks:

- Add a generic way for an intent to declare private participant policy at creation time
- Extend station read/write enforcement so only allowed participants can scan/post within that intent’s interior
- Keep public-root visibility and private-interior visibility distinct
- Define the minimal persisted representation for this policy
- Ensure auth and `senderId` identity checks still compose cleanly with private subspace rules

Files likely involved:

- `intent-space/src/space.ts`
- `intent-space/src/store.ts`
- `intent-space/src/types.ts`
- `intent-space/src/client.ts`
- `intent-space/tests/*`

Success criteria:

- A request intent can be posted publicly while its interior subspace is private
- The steward and requester can interact inside that subspace
- Non-participants cannot scan or post inside that subspace

### Phase 2: Separate Promise-Native Steward Agent

Goal: move provisioning control from embedded service hook to an autonomous steward process.

Tasks:

- Remove the embedded `onStoredMessage` provisioning path from Headwaters commons handling
- Implement a separate steward runtime/process that:
  - connects to the commons
  - scans for provisioning intents matching the payload contract
  - posts `PROMISE`
  - waits for explicit `ACCEPT`
  - provisions the space directly
  - posts `COMPLETE` with endpoint/audience/token in the private subspace
- Teach and validate the requester-side `ASSESS` step as part of the same provisioning lifecycle
- Decide and implement the minimal durable state needed for restart and replay safety
- Preserve the existing `HeadwatersProvisioner` logic or refactor it behind the steward process boundary

Files likely involved:

- `headwaters/src/service.ts`
- `headwaters/src/provisioner.ts`
- `headwaters/src/main.ts`
- `headwaters/src/contract.ts`
- new steward runtime files under `headwaters/src/` or `headwaters/scripts/`

Success criteria:

- The steward is a real separate participant on the wire
- Provisioning uses `PROMISE` -> `ACCEPT` -> `COMPLETE` -> `ASSESS`
- The spawned space is still directly usable after fulfillment

### Phase 3: Public Pack, Docs, And Harness Alignment

Goal: keep the public agent surface honest and verifiable after the promise-flow cutover.

Tasks:

- Update `headwaters/agent-setup.md` to teach the new provisioning lifecycle:
  - provisioning request intent
  - steward promise
  - explicit accept
  - complete payload as fulfillment artifact
  - requester assess after inspecting the result
- Update `headwaters/README.md` and root/living docs only where behavior actually changes
- Ensure the public Python runtime remains applicable without requiring a public solved client
- Add or adjust runtime helpers only if the promise-flow ergonomics clearly require them; keep the runtime mechanics-focused
- Update `headwaters/scripts/headwaters-claude-eval-loop.sh` so the prompt and interview test the new flow explicitly
- Preserve fresh-agent testing of the public pack, not just local script success

Files likely involved:

- `headwaters/agent-setup.md`
- `headwaters/README.md`
- `headwaters/scripts/headwaters-claude-eval-loop.sh`
- `headwaters/skill-pack/sdk/promise_runtime.py`
- `headwaters/skill-pack/sdk/intent_space_sdk.py`
- `README.md`

Success criteria:

- A fresh agent can still complete the Headwaters flow using the public pack
- The eval loop now validates promise-native provisioning rather than the old direct-reply shortcut
- The docs remain runtime-first and honest about the control flow

### Phase 4: Validation And Regression Coverage

Goal: prove both the protocol semantics and the fresh-agent usability of the new model.

Tasks:

- Replace the current direct-reply Headwaters tests with full promise-flow tests
- Add privacy tests for request subspaces
- Validate the local dogfood path still works
- Rerun the Claude evaluation loop and inspect interview output
- Confirm the public pack is still sufficient without growing a public reference client

Validation targets:

- `cd headwaters && npm test`
- `cd academy && npm test`
- `bash headwaters/scripts/headwaters-claude-eval-loop.sh /Users/noam/work/skyvalley/big-d`

Acceptance gate:

- The plan is not done until the eval loop proves that the current public pack and setup docs still let a fresh agent complete the promise-native provisioning flow.

## Alternative Approaches Considered

### 1. Keep the embedded steward callback and just add `PROMISE`/`COMPLETE`

Rejected because it would preserve the main architectural smell: the steward would still not be a separate autonomous participant (see origin: separate steward agent, not embedded handler).

### 2. Use promise flow only for shared spaces, keep home-space creation lightweight

Rejected in brainstorming. The user chose a full promise flow for all space creation, including home spaces, with explicit `ACCEPT`.

### 3. Split steward coordination and provisioning into two service agents immediately

Deferred. This may become useful later, but the origin decision was to let the steward fulfill directly in v1 to keep responsibility and capability aligned.

## Acceptance Criteria

- [x] Dedicated-space creation uses a real promise lifecycle: provisioning `INTENT`, steward `PROMISE`, requester `ACCEPT`, steward `COMPLETE`, requester `ASSESS`
- [x] The steward runs as a separate process/participant and is no longer implemented as an embedded stored-message callback
- [x] Provisioning request interiors are private to the participant set declared at request creation
- [x] The steward’s `COMPLETE` payload carries the spawned-space fulfillment artifact
- [x] Spawned spaces remain real dedicated spaces with direct participation after fulfillment
- [x] The public Python runtime pack remains usable for the new flow without adding a public solved client
- [x] `headwaters/scripts/headwaters-claude-eval-loop.sh` is updated to test the new flow and still completes with the public pack
- [x] Headwaters docs reflect the promise-native steward model accurately
- [x] Existing Welcome Mat signup and commons auth behavior remain intact unless explicitly improved

## Success Metrics

- Fresh-agent runs describe Headwaters as an autonomous managed space service rather than an infrastructure shortcut
- The first provisioning friction no longer stems from missing promise-flow semantics or hidden service behavior
- The public pack continues to be enough for agents to author their own thin orchestration
- The steward pattern is now reusable for later management behaviors without reopening the “embedded callback” design
- Fresh-agent runs successfully recognize provisioning as unfinished until they explicitly `ASSESS`

## Dependencies & Risks

### Dependencies

- Origin requirements doc: [2026-03-24-headwaters-promise-native-steward-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md)
- Existing Headwaters spawned-space/auth foundations:
  - [headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
- Existing public-pack/fresh-agent learnings:
  - [headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md)
  - [headwaters-did-not-need-a-public-reference-agent-once-the-runtime-pack-was-honest-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-did-not-need-a-public-reference-agent-once-the-runtime-pack-was-honest-20260323.md)

### Risks

- Private subspace policy may accidentally turn into Headwaters-only logic if not cut carefully
- Splitting the steward into a separate process may expose restart/replay problems that were hidden in-process
- Promise-flow ergonomics may increase agent friction if docs/runtime examples are not updated in lockstep
- Existing tests may overfit the old direct steward reply path and need significant replacement rather than patching

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md) — carried forward decisions:
  - separate steward agent
  - full provisioning promise lifecycle with explicit `ACCEPT`
  - private request subspaces as a general policy
  - steward fulfills directly in v1
- Similar implementation:
  - [headwaters/src/service.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/service.ts)
  - [headwaters/src/provisioner.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/provisioner.ts)
  - [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)
  - [headwaters/scripts/headwaters-claude-eval-loop.sh](/Users/noam/work/skyvalley/big-d/headwaters/scripts/headwaters-claude-eval-loop.sh)
- Institutional learnings:
  - [docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
  - [docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md)
  - [docs/solutions/integration-issues/headwaters-did-not-need-a-public-reference-agent-once-the-runtime-pack-was-honest-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-did-not-need-a-public-reference-agent-once-the-runtime-pack-was-honest-20260323.md)
