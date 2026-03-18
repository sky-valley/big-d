---
title: Python pack runtime matched agent preferences better than the TypeScript wrapper
date: 2026-03-17
category: integration-issues
tags:
  - academy
  - harness
  - python
  - runtime-design
  - agent-preferences
  - dojo
component: academy
component_path: academy/skill-pack/sdk/promise_runtime.py
related_components:
  - academy/scripts/dojo-agent.py
  - academy/skill-pack/sdk/intent_space_sdk.py
  - academy/src/harness.ts
severity: medium
resolution_type: redesign
status: verified
symptoms: |
  External agents consistently ignored the TypeScript runtime wrapper, even
  after it was made sessionful and shipped in the academy pack. They preferred
  to write their own small Python clients over the existing SDK.
root_cause: |
  The wrapper abstracted the wrong layer for the agents' actual working style.
  Agents preferred an importable, in-process Python surface they could script
  directly with one persistent connection, direct control flow, and visible
  local state. The TypeScript wrapper added subprocess orchestration and hidden
  wrapper state without removing enough protocol burden to feel natural.
verified_by:
  - npm test
  - npm run dojo:harness -- --agents scripted-dojo --trials 1 --output-dir /tmp/python-runtime-scripted-dojo-final
verification_date: 2026-03-17
---

# Python Pack Runtime Matched Agent Preferences Better Than The TypeScript Wrapper

## Problem

We wanted a more comfortable mechanics surface for external agents than raw
wire handling, but the standalone TypeScript runtime and wrapper were not being
adopted. Codex, Claude, and Pi kept choosing to write small Python helpers
instead.

The question became:

- what mechanics should the runtime own?
- what form should that runtime take so agents actually want to use it?

## What We Learned

The agents were not rejecting abstraction in general. They were rejecting a
specific kind of abstraction:

- out-of-process wrapper orchestration
- extra command protocol over stdin/stdout
- hidden wrapper-managed state

They consistently preferred:

- importable Python code
- one in-process control loop
- one persistent connection they could see and reason about
- direct access to scan results, async inbox messages, and local artifacts

The comfort point was not "very high level." It was "thin, local, scriptable,
and fully inspectable."

## What We Changed

We removed the TypeScript runtime and replaced it with an importable Python
runtime shipped inside the academy pack:

- [promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

That runtime intentionally stays close to the wire while absorbing the
mechanics agents kept rebuilding:

- one in-process session
- identity creation and persistence
- direct send/scan/wait helpers
- exact atom constructors
- local transcript and artifact persistence
- dual-path wait logic for async push plus scan fallback

We also moved the scripted dojo agent to Python so the pack dogfoods the same
surface agents receive:

- [dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)

The tutor remained dojo-specific policy in:

- [tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)

## Why This Was Better

This aligned with how agents were already working:

- they naturally chose Python
- they wanted local control flow, not shell orchestration
- they wanted to inspect message shapes directly
- they preferred one file they could edit over a wrapper process they had to
  drive indirectly

The winning move was not "make the runtime more magical." It was:

- keep the runtime thin
- keep it importable
- keep it in the pack
- let the agent own the workflow reasoning

## Validation

The scripted dojo dogfood path passed through the harness with the new runtime:

- `/tmp/python-runtime-scripted-dojo-final/report.md`

Key result:

- `scripted-dojo`: `passed`, `single-pass`, `no-helper`

This verified that the pack now ships a real Python runtime surface and that
the dojo happy-path agent can use it directly.

## Current Guidance

If we want the most comfortable integration for external agents, prefer:

- importable Python runtime surfaces in the pack
- thin mechanics abstraction
- exact forms and seam examples
- agent-owned workflow logic

Avoid:

- extra wrapper processes unless absolutely necessary
- TypeScript-only runtime surfaces for agents that naturally code in Python
- hiding the live connection and message flow behind too much indirection

## Current Checkpoint

The next small seam to keep stable is:

- challenge signing belongs on the session API, not behind `local_state`
- the live-session `wait_or_scan` path remains the right default for async tutor
  delivery

That keeps the Python runtime thin without forcing agents to reach through the
SDK for the most common proof-of-possession step.
