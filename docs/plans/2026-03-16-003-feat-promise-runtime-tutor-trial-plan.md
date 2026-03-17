---
title: feat: Build promise-native agent runtime and trial dojo tutor adoption
type: feat
status: completed
date: 2026-03-16
---

# feat: Build promise-native agent runtime and trial dojo tutor adoption

## Overview

Build a real promise-native agent runtime as a separate package above the
generic `intent-space` server, then trial that runtime with the dojo tutor as
its first consumer.

The runtime must **not** be designed as dojo-specific infrastructure and must
**not** be embedded into `intent-space/`. `intent-space/` remains the generic
body-of-desire server. The new runtime is an agent-side consumer/runtime for
acting in that space.

The dojo tutor is the first proving ground, not the design center.

## Problem Statement / Motivation

We have now converged on the right abstraction boundary:

- space is primitive
- thread is a derived path through spaces
- intent is born locally, then published socially
- promise truth remains local
- the model should reason over projected negotiation state, not wire protocol

The current dojo tutor in [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts) still hardcodes a fixed journey with hand-written state maps and heuristics. That was fine for phase-1 ritual validation, but it is the wrong long-term boundary.

If the tutor is going to become a real agent participant, we need a generic
runtime that:

- owns transport, waiting, projection, and correlation mechanics
- keeps local desire/promise authority separate from public space projection
- projects thread/path state for reasoning
- can be reused beyond the dojo

The dojo tutor is a good first user because it already exercises:

- registration
- revision/decline guidance
- promise issuance
- acceptance
- assessment

But the runtime must be built to serve **agents acting on space in general**, not
just this one ritual.

## Current Foundation

This plan is grounded in the latest distilled design work, not the older
brainstorm documents.

Primary design references:

- [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- [promise-native-session-runtime.md](/Users/noam/work/skyvalley/big-d/intent-space/docs/promise-native-session-runtime.md)
- [promise_session_runtime.py](/Users/noam/work/skyvalley/big-d/intent-space/sketches/promise_session_runtime.py)

Key decisions already made and carried forward directly:

- keep `intent-space/` spatial and generic
- keep local autonomy authoritative
- treat public space messages as projections/shadows
- treat thread as a runtime/path projection, not a substrate primitive
- split desire revision from promise revision
- do not force lineage metadata into the substrate yet

## Proposed Solution

Create a new top-level runtime package, tentatively:

- `promise-runtime/`

This package will implement the real runtime boundary described in the sketch:

- `LocalAutonomyAdapter`
- `IntentSpaceProjectionAdapter`
- `ThreadPathProjector`
- `PromiseSessionRuntime`

The runtime should be implemented in TypeScript first so the dojo tutor can
consume it directly without cross-language glue.

### High-level scope

1. **Build the generic runtime**
   - no dojo assumptions in core interfaces
   - no tutor-specific state machine in the core package
   - no changes that turn `intent-space/` into workflow or promise authority

2. **Trial the runtime with the dojo tutor**
   - adapt the tutor to use the runtime
   - keep current ritual behavior intact at first
   - identify what generic abstractions are still missing

3. **Do not prematurely “build it for the tutor”**
   - tutor-specific policies stay in `academy/`
   - generic runtime stays reusable
   - if tutor reveals missing abstractions, add them only when they generalize

## Technical Approach

### Package placement

Add a new top-level package:

- [promise-runtime/package.json](/Users/noam/work/skyvalley/big-d/promise-runtime/package.json)

Why:

- `intent-space/` should remain the server/substrate
- `academy/` should remain dojo/onboarding/product surface
- the runtime is agent-side logic that can serve multiple consumers

This package should depend on:

- `intent-space/` client types and client behavior
- `itp/` protocol helpers

It should not depend on `academy/`.

### Runtime boundaries

The runtime should explicitly separate:

#### 1. Local autonomy

Owns:

- local desire records
- local promise records
- accepts / declines / assessments
- revision lineage at the local level

#### 2. Intent space projection

Owns:

- publishing public shadows into spaces
- observing public events from spaces
- waiting/resuming on new events

#### 3. Thread/path projection

Owns:

- deriving one semantic path across one or more spaces
- summarizing pending decisions
- summarizing open commitments
- presenting allowed moves to the caller/model

### Tutor integration approach

The current tutor should not be rewritten in one jump.

Instead:

#### Step 1: adapter-backed parity mode

Wrap current tutor behavior around the runtime while preserving the current
ritual contract:

- registration challenge flow still works
- tutorial greeting gate still works
- deliberate correction still works
- promise / accept / complete / assess still works

This gives us runtime validation without a product rewrite.

#### Step 2: identify remaining heuristics

Once parity mode works, inspect what parts of the tutor are still
tutor-specific heuristics:

- session TTL cleanup
- deliberate correction policy
- ritual-specific path transitions
- final dojo reward behavior

These should stay in `academy/` unless they become obviously general.

#### Step 3: optional second-phase tutor agentification

Only after parity mode is stable should we consider rewriting the tutor as a
more agent-like participant whose behavior is driven through the runtime rather
than mostly hand-coded branching.

That is explicitly a later decision, not a prerequisite for phase 1.

## Implementation Phases

### Phase 1: Carve Out the Runtime Package

Create:

- [promise-runtime/package.json](/Users/noam/work/skyvalley/big-d/promise-runtime/package.json)
- [promise-runtime/tsconfig.json](/Users/noam/work/skyvalley/big-d/promise-runtime/tsconfig.json)
- [promise-runtime/src/](/Users/noam/work/skyvalley/big-d/promise-runtime/src/)
- [promise-runtime/tests/](/Users/noam/work/skyvalley/big-d/promise-runtime/tests/)
- [promise-runtime/README.md](/Users/noam/work/skyvalley/big-d/promise-runtime/README.md)

Tasks:

- translate the current Python sketch into TypeScript interfaces and types
- keep the sketch and docs as design artifacts
- decide what minimal runtime surface is truly generic
- ensure imports stay explicit with `.ts` extensions

Deliverable:

- a compileable, testable standalone runtime package with no academy coupling

### Phase 2: Implement the Core Runtime

Build:

- `LocalAutonomyAdapter`
- `IntentSpaceProjectionAdapter`
- `ThreadPathProjector`
- `PromiseSessionRuntime`

Include:

- typed semantic moves:
  - `express_intent`
  - `offer_promise`
  - `accept`
  - `decline`
  - `assess`
  - `revise_desire`
  - `revise_promise`
- wait/resume support
- state projection
- explicit separation between desire refs, authority refs, and projection refs

Deliverable:

- generic runtime tested against synthetic fixtures without tutor involvement

### Phase 3: Build a Non-Tutor Harness for the Runtime

Before touching the dojo tutor deeply, prove the runtime independently.

Add a minimal synthetic consumer in `promise-runtime/tests/` that exercises:

- local intent recording then public projection
- promise publication and observation
- desire revision
- promise revision
- accept / assess flow
- path derivation across multiple spaces

Deliverable:

- runtime confidence that does not depend on dojo-specific ritual logic

### Phase 4: Trial Runtime Adoption in the Dojo Tutor

Refactor [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts) to consume the runtime in parity mode.

Scope:

- replace direct `IntentSpaceClient`-driven branching where appropriate
- preserve the current station contract in [station-contract.ts](/Users/noam/work/skyvalley/big-d/academy/src/station-contract.ts)
- keep dojo-specific policy in `academy/`
- avoid generic runtime changes that exist only to satisfy one tutor branch

Deliverable:

- tutor still passes existing dojo tests while now depending on the runtime

### Phase 5: Trial and Evaluate

Run:

- tutor tests
- dojo happy-path
- one-pass harness runs

Evaluate:

- what runtime interfaces were enough
- what tutor heuristics remain
- what abstractions generalized cleanly
- what should remain academy-specific

Deliverable:

- clear go/no-go on deeper tutor agentification

## Alternative Approaches Considered

### 1. Put the runtime inside `intent-space/`

Rejected.

Why:

- `intent-space/` should stay the generic server/substrate
- embedding the runtime there risks turning the server into an agent runtime or
  promise authority
- it weakens the body-of-desire/body-of-commitment split

### 2. Build the runtime directly inside `academy/`

Rejected.

Why:

- that would make the dojo tutor the design center
- it would almost certainly produce dojo-shaped abstractions instead of general
  agent-runtime abstractions

### 3. Rewrite the tutor first, then extract a runtime later

Rejected.

Why:

- extraction after a tutor-driven implementation will likely freeze the wrong
  boundaries
- we want to test the runtime with the tutor, not derive the runtime from the
  tutor’s current heuristics

## System-Wide Impact

### Interaction Graph

The intended chain is:

1. agent/tutor issues a semantic move through `promise-runtime`
2. `LocalAutonomyAdapter` records local desire or promise state
3. `IntentSpaceProjectionAdapter` publishes a projection into the relevant space
4. `intent-space/` persists and echoes that projection
5. runtime observes new projected events
6. `ThreadPathProjector` derives updated thread/path state
7. tutor or other agent consumes that projected state and chooses the next move

For dojo parity mode specifically:

1. registration intent arrives
2. tutor runtime projects challenge response path
3. visitor responds
4. runtime derives tutorial path state
5. academy-specific policy decides whether to decline, promise, complete, or assess

### Error & Failure Propagation

Potential failure layers:

- local autonomy write fails
- projection publish fails
- projection observation is stale or duplicated
- path projector derives the wrong semantic state
- tutor policy consumes correct state incorrectly

The plan must preserve evidence at each layer so failures stay separable.

### State Lifecycle Risks

Risks:

- duplicated public projections for one local act
- local state written but projection not published
- projection received twice and interpreted as two authored acts
- incorrect path correlation across spaces
- stale tutor sessions surviving after runtime adoption

Mitigation:

- idempotency tests in the runtime package
- explicit desire vs authority vs projection refs
- synthetic multi-space path tests before tutor trial
- keep tutor TTL/session cleanup local to `academy/` initially

### API Surface Parity

Current relevant surfaces:

- [intent-space/src/client.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/client.ts)
- [academy/src/tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
- [academy/scripts/dojo-agent.ts](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.ts)

The new runtime should become the higher-level consumer API for agents, without
removing the raw client from `intent-space/`.

### Integration Test Scenarios

1. Local desire recorded, then projection published, then observed back through
   the runtime without losing authorship distinction.
2. A derived thread path spans multiple spaces and still yields one coherent
   pending decision.
3. Promise revision and desire revision remain distinct in the runtime and do
   not collapse into one generic mutate path.
4. Dojo tutor still completes the fixed ritual with the runtime in parity mode.
5. Projection duplicates or reconnects do not produce duplicate semantic moves.

## Acceptance Criteria

### Runtime

- [x] A new standalone `promise-runtime/` package exists and compiles.
- [x] The runtime package has no dependency on `academy/`.
- [x] The runtime keeps `intent-space/` generic and does not add promise
      authority there.
- [x] The runtime exposes typed semantic moves and wait/resume behavior.
- [x] The runtime models desire refs, authority refs, projection refs, and
      path spaces explicitly.
- [x] Synthetic runtime tests pass without tutor involvement.

### Tutor Trial

- [x] The dojo tutor can consume the runtime in parity mode.
- [x] Existing tutor behavior and ritual contract remain intact during the
      first trial.
- [x] Existing tutor tests still pass after adoption.
- [x] At least one dojo happy-path run succeeds with the tutor using the runtime.

### Separation

- [x] Runtime abstractions remain generic after tutor adoption.
- [x] Tutor-specific policies stay in `academy/`.
- [x] The plan outcome includes a clear list of what generalized and what did
      not.

## Outcome

The first pass succeeded.

What generalized cleanly:

- a standalone `promise-runtime/` package
- local autonomy records for desire/promise truth
- public projection into `intent-space`
- derived thread/path projection above spaces
- typed semantic moves for intent, promise, decline, accept, complete, assess,
  revise-desire, and revise-promise

What remained academy-specific:

- registration proof-of-possession policy
- deliberate first-decline tutorial behavior
- ritual-specific path transitions
- dojo reward/certificate payloads
- tutor TTL/session cleanup

Validation completed:

- `npm run typecheck` in `promise-runtime/`
- `npm test` in `promise-runtime/`
- `npm test` in `academy/`
- `npm run dojo:happy` in `academy/` against a managed local station+tutor stack

## Success Metrics

- Runtime package can be exercised independently of dojo.
- Tutor adoption reduces direct hardcoded wire/protocol handling in
  [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts).
- No new logic in `intent-space/` causes it to act like a promise engine.
- The resulting abstraction still reads as reusable for future non-dojo agents.

## Dependencies & Risks

### Dependencies

- current `intent-space` client behavior
- current `itp` message factory helpers
- current dojo tutor tests as parity guardrails

### Risks

- runtime overfits to dojo semantics
- path projection becomes too magical or under-specified
- local autonomy model becomes muddled by mixed desire/promise records
- tutor parity mode becomes an awkward hybrid that hides real abstraction gaps

## Risk Analysis & Mitigation

### Risk: tutor drives the abstraction

Mitigation:

- build the runtime package and synthetic tests first
- do not let tutor be the first and only proof of correctness

### Risk: `intent-space/` absorbs runtime concerns

Mitigation:

- require all runtime code to live outside `intent-space/`
- treat changes to `intent-space/` as protocol/substrate changes only

### Risk: revision semantics stay muddy

Mitigation:

- keep separate `revise_desire` and `revise_promise` operations from day one
- defer substrate lineage metadata until real runtime need appears

## Resource Requirements

- one focused implementation pass across:
  - `promise-runtime/`
  - `academy/src/tutor.ts`
  - runtime tests and tutor tests

No infrastructure changes required.

## Future Considerations

- exposing the runtime through MCP later, if it helps interoperability
- adding explicit lineage metadata only if runtime inference proves insufficient
- using the runtime for non-dojo agents beyond the tutor

## Documentation Plan

Update or create:

- [promise-runtime/README.md](/Users/noam/work/skyvalley/big-d/promise-runtime/README.md)
- [intent-space/README.md](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [intent-space/INTENT-SPACE.md](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [academy/README.md](/Users/noam/work/skyvalley/big-d/academy/README.md)
- a follow-up solution doc once runtime + tutor trial yields real learnings

## Sources & References

### Current Design Foundation

- [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- [promise-native-session-runtime.md](/Users/noam/work/skyvalley/big-d/intent-space/docs/promise-native-session-runtime.md)
- [promise_session_runtime.py](/Users/noam/work/skyvalley/big-d/intent-space/sketches/promise_session_runtime.py)

### Existing Runtime Consumers / Constraints

- [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
- [station-contract.ts](/Users/noam/work/skyvalley/big-d/academy/src/station-contract.ts)
- [test-tutor.ts](/Users/noam/work/skyvalley/big-d/academy/tests/test-tutor.ts)

### Institutional Learnings

- [sdk-only-dojo-pack-worked-after-fixing-stale-local-stack-launcher-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/sdk-only-dojo-pack-worked-after-fixing-stale-local-stack-launcher-20260316.md)
- [protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
- [promise-theory-informed-architecture.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-theory-informed-architecture.md)
