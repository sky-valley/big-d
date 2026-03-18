---
title: Historical note: TypeScript promise runtime tutor trial
type: feat
status: superseded
date: 2026-03-16
---

# Historical Note: TypeScript Promise Runtime Tutor Trial

This plan documented a short-lived experiment that introduced a standalone
TypeScript `promise-runtime/` package and trialed it with the dojo tutor.

That approach was later discarded.

## Why it was superseded

The TypeScript runtime was structurally reasonable for the tutor, but it was
not the surface external agents preferred. In practice, Codex, Claude, and Pi
consistently chose to write small in-process Python helpers instead of using an
out-of-process runtime wrapper or TypeScript package.

The decisive learning was:

- agents prefer an importable, in-process Python surface
- they want one persistent connection they can control directly
- they do not want extra subprocess orchestration or hidden wrapper state

## Current replacement

The current runtime direction is:

- no standalone `promise-runtime/` package
- no TypeScript runtime wrapper
- an importable Python runtime shipped inside the academy pack at
  [promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- a scripted dojo agent that dogfoods that runtime at
  [dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)

The tutor remains dojo-specific policy in
[tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts), while the
pack carries the agent-facing runtime mechanics.

## Related current references

- [academy/README.md](/Users/noam/work/skyvalley/big-d/academy/README.md)
- [agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
- [SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
- [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
