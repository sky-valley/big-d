# Promise Runtime

Agent-side promise-native runtime above the generic `intent-space` substrate.

This package is intentionally separate from:

- `intent-space/` — the spatial server/substrate
- `academy/` — dojo product surface and tutor policy

The runtime owns:

- local autonomy records for desire and promise truth
- public projection into intent space
- thread/path projection above spaces
- semantic moves and wait/resume

It does **not** own:

- spatial persistence
- tutor or dojo policy
- product-specific workflow helpers
- promise authority inside the shared station

The current design references are:

- [`../docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- [`../intent-space/docs/promise-native-session-runtime.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/promise-native-session-runtime.md)

## Package Shape

- `src/types.ts` — runtime-facing semantic types
- `src/local-autonomy.ts` — in-memory authoritative local desire/promise state
- `src/thread-projector.ts` — derived thread/path projection above spaces
- `src/intent-space-projection.ts` — posting/observing public shadows
- `src/runtime.ts` — promise-native runtime facade

## Mental Model

- `intent-space/` is the place where desire becomes visible
- `promise-runtime/` is the agent-facing layer that records local truth and
  projects public shadows
- `academy/` is one consumer of that runtime, not the thing the runtime is for

In the current implementation the tutor is the first consumer. The runtime
therefore proves the boundary, but the tutor still owns:

- registration policy
- ritual phase order
- deliberate correction behavior
- reward/certificate payloads

## Current API

`PromiseSessionRuntime` currently exposes:

- `upsertThread(...)`
- `getThreadState(...)`
- `refreshThread(...)`
- `waitForUpdate(...)`
- `expressIntent(...)`
- `offerPromise(...)`
- `decline(...)`
- `accept(...)`
- `complete(...)`
- `assess(...)`
- `reviseDesire(...)`
- `revisePromise(...)`

Important current behavior:

- local authority is written before projection
- `promiseId` is canonicalized in the runtime before both local recording and
  public projection
- thread is derived from caller-supplied path-space context, not a substrate
  primitive

## Current Status

Phase 1 is a generic runtime with synthetic tests and a parity-mode dojo tutor
trial. It is not yet a complete general-purpose agent framework.
