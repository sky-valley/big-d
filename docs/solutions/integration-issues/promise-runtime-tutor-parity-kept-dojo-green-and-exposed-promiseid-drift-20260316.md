---
title: Promise runtime tutor parity kept dojo green and exposed promiseId drift
date: 2026-03-16
category: integration-issues
tags:
  - promise-runtime
  - academy
  - tutor
  - intent-space
  - runtime-design
  - promise-theory
  - thread-projection
  - local-autonomy
  - dojo
component: academy
component_path: academy/src/tutor.ts
related_components:
  - promise-runtime/src/runtime.ts
  - promise-runtime/src/local-autonomy.ts
  - promise-runtime/src/thread-projector.ts
  - promise-runtime/src/intent-space-projection.ts
  - promise-runtime/tests/test-runtime.ts
  - academy/tests/test-tutor.ts
severity: medium
resolution_type: refactor-and-validation
status: verified
symptoms: |
  The dojo tutor had working ritual behavior but no reusable promise-native
  runtime boundary. Runtime concerns were mixed across packages, the tutor
  still built raw protocol messages directly, and the first attempt to lean on
  runtime-derived promise state exposed identity drift between local authority
  and projected public messages.
root_cause: |
  Agent-side promise mechanics, local authority, projection into intent-space,
  and academy-specific tutor policy were still entangled. The tutor cached
  promise binding locally instead of deriving it from a reusable runtime, and
  the first runtime pass allowed promise identity to diverge because the
  runtime recorded local authority before canonicalizing the projected
  promiseId.
verified_by:
  - promise-runtime/tests/test-runtime.ts
  - academy/tests/test-tutor.ts
  - /tmp/dojo-harness-runtime-matrix/report.json
verification_date: 2026-03-16
---

# Promise Runtime Tutor Parity Kept Dojo Green And Exposed promiseId Drift

## Problem

We needed to turn the runtime sketch into a real package and trial it with the
dojo tutor without collapsing the architecture boundary we had just established.

The intended package split was:

- `intent-space/` stays the generic spatial substrate
- `promise-runtime/` becomes the agent-side promise-native runtime
- `academy/` keeps tutor policy, onboarding, harness, and deploy surface

The tutor already worked, but it still carried too much runtime behavior:

- it built raw ITP messages directly
- it tracked tutorial promise progress in academy-local session state
- it mixed generic promise mechanics with dojo-specific policy

The requirement for this pass was intentionally conservative:

- maximize runtime usage
- keep hardcoded journey safety where model reliability is not trusted
- do not make `intent-space/` a workflow engine
- do not build the runtime “for the tutor”

## What We Changed

### 1. Built a real standalone runtime package

Added `promise-runtime/` as a new top-level package:

- [README.md](/Users/noam/work/skyvalley/big-d/promise-runtime/README.md)
- [package.json](/Users/noam/work/skyvalley/big-d/promise-runtime/package.json)
- [tsconfig.json](/Users/noam/work/skyvalley/big-d/promise-runtime/tsconfig.json)

Core runtime pieces:

- [types.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/types.ts)
  Runtime-facing semantic types for:
  - thread state
  - pending decisions
  - open commitments
  - desire refs
  - authority refs
  - projection refs
  - typed semantic moves

- [local-autonomy.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/local-autonomy.ts)
  In-memory local authoritative records for desire and promise truth.

- [thread-projector.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/thread-projector.ts)
  Derived thread/path projection above one or more spaces.

- [intent-space-projection.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/intent-space-projection.ts)
  Adapter that maps semantic moves into ITP messages and scans/waits across
  path spaces.

- [runtime.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/runtime.ts)
  `PromiseSessionRuntime`, the façade exposing:
  - `expressIntent`
  - `offerPromise`
  - `decline`
  - `accept`
  - `complete`
  - `assess`
  - `reviseDesire`
  - `revisePromise`
  - `refreshThread`
  - `waitForUpdate`

This package does not depend on `academy/`.

### 2. Refactored the tutor into parity mode on top of the runtime

Updated [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts) so
the tutor still owns dojo policy, but no longer hand-builds most outgoing
protocol messages itself.

The tutor now uses the runtime for outgoing semantic acts:

- registration challenge
- registration acknowledgement
- tutorial instruction
- declines with guidance
- promise issuance
- completion
- final acknowledgment/reward emission

The tutor still keeps the hardcoded safety gates in academy:

- registration must succeed before tutorial
- first tutorial decline is deliberate
- the ritual must pass through `PROMISE -> ACCEPT -> COMPLETE -> ASSESS`
- completion/reward only happen after the full path closes

That is the right split for now:

- runtime owns mechanics
- academy owns policy

### 3. Pushed promise binding truth into the runtime

The first parity pass still cached tutorial `promiseId` in academy-local
session state. We then tightened the boundary:

- removed cached tutorial `promiseId` from `TutorialSession`
- made the tutor refresh runtime thread state to determine the active promise
  during `ACCEPT` and `ASSESS`

That means promise binding is now derived from runtime state rather than tutor
memory.

## The Important Bug This Exposed

The stronger boundary immediately found a real bug:

- local authority and projected public messages were not guaranteed to share
  the same generated `promiseId`

Why it happened:

- the runtime recorded local promise authority first
- the projection layer created the outgoing `PROMISE` message separately
- if no explicit `promiseId` was passed in, each layer could generate its own
  identifier

This bug was invisible while the tutor cached the projected `promiseId`
locally. Once the tutor started asking the runtime for the active promise, the
drift became visible and broke completion.

The fix was the correct architectural one:

- canonicalize the `promiseId` in
  [runtime.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/src/runtime.ts)
  before both local recording and projection

That restored one stable lifecycle identity across:

- local authority
- projection refs
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

## Validation

### Package-level validation

- `cd promise-runtime && npm run typecheck`
- `cd promise-runtime && npm test`

Runtime test file:

- [test-runtime.ts](/Users/noam/work/skyvalley/big-d/promise-runtime/tests/test-runtime.ts)

This covers:

- local intent recording then projection
- promise issuance
- desire revision
- promise revision
- accept / complete / assess flow
- path derivation across multiple spaces
- wait timeout behavior

### Tutor parity validation

- `cd academy && npm test`

Tutor test file:

- [test-tutor.ts](/Users/noam/work/skyvalley/big-d/academy/tests/test-tutor.ts)

This verifies:

- tutorial entry is rejected before registration
- malformed registration gets guidance
- registration challenge and signature verification work
- deliberate first decline still happens
- promise issuance still happens after retry
- `ACCEPT` must bind by `promiseId`
- `ASSESS` must bind by `promiseId`
- completion and final acknowledgment still work
- dojo reward and certificate still appear
- registration/tutorial session cleanup still happens

### Live end-to-end validation

Ran a real local dojo happy-path with:

- local academy server
- local `intent-space` station
- local tutor
- real scripted dojo agent

Result: passed after the stronger runtime-backed refactor.

### Full attached harness matrix

Ran an attached local matrix against the updated tutor:

- report: [/tmp/dojo-harness-runtime-matrix/report.json](/tmp/dojo-harness-runtime-matrix/report.json)
- summary: [/tmp/dojo-harness-runtime-matrix/report.md](/tmp/dojo-harness-runtime-matrix/report.md)

Results:

- `scripted-dojo`: passed, `single-pass`, `no-helper`, ~3.1s
- `codex`: passed, `single-pass`, `generated-executed:python`, ~88.6s
- `claude`: passed, `single-pass`, `generated-executed:python`, ~66.7s
- `pi`: passed, `single-pass`, `generated-executed:python`, ~70.6s

This matters because it shows the stronger runtime-backed tutor boundary did
not regress the live dojo.

## What Generalized Cleanly

- a standalone `promise-runtime/` package
- local desire/promise authority records
- public projection into `intent-space`
- derived thread/path projection above spaces
- typed semantic moves and wait/resume behavior
- runtime-derived active promise lookup for lifecycle binding

## What Stayed Academy-Specific

- registration contract constants and payload validation
- RSA challenge verification
- deliberate first-decline tutorial pedagogy
- ritual-specific phase order
- dojo reward and certificate payloads
- tutor TTL/session cleanup
- thread bootstrapping details for registration/tutorial flows

This is the important line:

The generalization is not “move tutor logic into a library.”
It is “move promise-native mechanics into a runtime with adapters.”

## Prevention

### Preserve the core invariant

Local autonomy is authoritative. Projection is evidence.

If a move represents an agent’s own desire or commitment:

1. record it locally first
2. project it publicly second

The shared space must not become the source of truth for:

- promise lifecycle
- completion
- assessment

### Treat identity as a first-class discipline

`promiseId` must be the only lifecycle binding key for:

- `ACCEPT`
- `COMPLETE`
- `ASSESS`
- promise revision

Never silently fall back to:

- `intentId`
- `seq`
- payload text

If projection and authority cannot be correlated by a stable `promiseId`, the
runtime should surface that as drift rather than infer incorrectly.

### Keep package boundaries hard

- `intent-space/` owns containment, append-only posting, and scanning
- `promise-runtime/` owns local authority, projection, wait/resume, and
  thread/path projection
- `academy/` owns ritual policy, registration policy, and tutor choreography

If a new feature mentions:

- tutorial
- registration
- certificate
- reward
- phase progression

it does not belong in `intent-space/`, and it probably does not belong in
`promise-runtime/` either.

### Keep tests separated

Maintain two distinct test suites:

- generic runtime tests below academy
- academy tutor parity tests above the runtime

Also add more explicit invariant coverage over time:

- local-first tests
- identity-correlation tests
- wrong-id tests
- projection-authority drift tests
- non-academy runtime consumer tests

## Cross References

- [Promise-Native Runtime Should Keep Space Primitive and Thread Derived](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- [Promise-Native Session Runtime Sketch](/Users/noam/work/skyvalley/big-d/intent-space/docs/promise-native-session-runtime.md)
- [Intent Space](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [Promise Runtime README](/Users/noam/work/skyvalley/big-d/promise-runtime/README.md)
- [Build promise-native agent runtime and trial dojo tutor adoption](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-16-003-feat-promise-runtime-tutor-trial-plan.md)
- [SDK-only dojo pack worked after fixing stale local stack launcher](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/sdk-only-dojo-pack-worked-after-fixing-stale-local-stack-launcher-20260316.md)
