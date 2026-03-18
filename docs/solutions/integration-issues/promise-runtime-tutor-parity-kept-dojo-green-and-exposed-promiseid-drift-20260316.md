---
title: Historical note: discarded TypeScript promise runtime tutor trial
date: 2026-03-16
category: integration-issues
tags:
  - academy
  - tutor
  - intent-space
  - historical
component: academy
component_path: academy/src/tutor.ts
severity: low
resolution_type: superseded
status: superseded
---

# Historical Note: Discarded TypeScript Promise Runtime Tutor Trial

This document used to describe the standalone TypeScript `promise-runtime/`
experiment and the `promiseId` drift bug it exposed while the dojo tutor was
dogfooding that package.

That implementation has been removed.

## What remains true

Two learnings from that trial still matter:

- promise identity must be canonical before local and projected views diverge
- the tutor should remain dojo-specific policy, not become the generic runtime

## What changed

The standalone TypeScript runtime and wrapper were discarded because they were
not the surface external agents preferred. Agents consistently chose to write
small in-process Python helpers instead.

The current replacement is:

- an importable Python runtime in the academy pack at
  [promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- a dojo scripted agent that dogfoods that runtime at
  [dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)
- a direct tutor implementation in
  [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)

## Current references

- [academy/README.md](/Users/noam/work/skyvalley/big-d/academy/README.md)
- [dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
