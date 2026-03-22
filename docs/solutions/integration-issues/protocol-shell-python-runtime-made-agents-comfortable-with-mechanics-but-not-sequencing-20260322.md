---
title: Protocol-shell Python runtime matched agent mechanics while agents kept thin helpers for sequencing
date: 2026-03-22
category: integration-issues
tags:
  - academy
  - harness
  - python
  - runtime-design
  - protocol-shell
  - agent-preferences
  - dojo
component: academy
component_path: academy/skill-pack/sdk/promise_runtime.py
related_components:
  - academy/scripts/dojo-agent.py
  - academy/skill-pack/sdk/intent_space_sdk.py
  - academy/skill-pack/SKILL.md
  - academy/skill-pack/references/QUICKSTART.md
  - academy/src/harness.ts
related_solutions:
  - docs/solutions/integration-issues/python-pack-runtime-matched-agent-preferences-better-than-ts-wrapper-20260317.md
severity: medium
resolution_type: redesign
status: verified
symptoms: |
  Even after moving from the discarded TypeScript wrapper to an importable
  Python runtime, external agents still tended to generate a thin local
  `dojo_client.py`. The question shifted from "what language/runtime should the
  mechanics surface use?" to "what runtime shape actually feels natural to
  agents?"
root_cause: |
  Agents are comfortable with bash and tool-call loops because those surfaces
  are explicit, inspectable, local in their effects, and sequenced under the
  model's control. The Python runtime already matched the language and
  in-process preference, but it still needed to feel more like a protocol shell:
  explicit posting, visible state snapshots, visible progress artifacts, and
  narrow wait helpers. Even after those improvements, agents still preferred to
  keep workflow sequencing in a thin local helper script rather than inside the
  runtime itself.
verified_by:
  - PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile academy/skill-pack/sdk/promise_runtime.py academy/scripts/dojo-agent.py
  - npm test
  - npm run dojo:harness -- --agents scripted-dojo,codex,claude,pi --trials 1 --output-dir /tmp/dojo-harness-agent-comfort-runtime-rerun
verification_date: 2026-03-22
---

# Protocol-shell Python Runtime Matched Agent Mechanics While Agents Kept Thin Helpers For Sequencing

## Problem

The move from the abandoned TypeScript wrapper to an importable Python runtime
solved the language and in-process mismatch, but we still had an open question:

- what makes a runtime feel as natural to agents as a sequence of bash/tool calls?
- what should the runtime own, and what should the agent still compose locally?

The dojo harness made that visible. Agents were happy to use the runtime for
mechanics, but they still often wrote a thin `dojo_client.py` around it.

## What We Changed

We reshaped the Python runtime into a more explicit protocol shell in:

- [promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

Key additions:

- `session.identity()` exposes the actual local identity material needed for
  registration payloads
- `session.post(...)` makes outgoing actions explicit and visible
- `session.snapshot()` exposes current known state through the runtime itself
- `session.record_step(...)` leaves a visible step trail in
  `.intent-space/state/runtime-steps.ndjson`
- narrow mechanical wait helpers like:
  - `wait_for_intent(...)`
  - `wait_for_promise(...)`
  - `wait_for_decline(...)`
  - `wait_for_complete(...)`
- `sign_challenge(...)` stays on the session, not behind `local_state`

We then aligned the dogfood agent and pack docs to that same surface:

- [dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)
- [SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
- [QUICKSTART.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/references/QUICKSTART.md)
- [REFERENCE.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/references/REFERENCE.md)
- [MICRO_EXAMPLES.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/references/MICRO_EXAMPLES.md)
- [agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)

The pack now explicitly teaches the runtime as a protocol shell rather than as
a magical framework.

## Why This Worked Better

The important learning was not "hide more." It was "match the shape of a good
tool loop."

Agents already demonstrate comfort with bash/tool-call sequences because those
surfaces provide:

- explicit state transitions
- visible inputs and outputs
- local control over sequencing
- inspectable intermediate state
- recoverable failure points

The Python runtime got closer to that by becoming:

- importable
- in-process
- stepwise
- artifact-producing
- visibly stateful

That made the runtime itself comfortable as the mechanics layer.

## What The Agents Still Preferred

Even after this improvement, external agents still usually wrote a thin helper
script around the runtime.

That was not a rejection of the runtime.
It was a signal about what they still want to own:

- procedural sequencing
- their own local scratchpad
- visible orchestration of steps in one file

The runtime covered:

- identity
- connection management
- scans
- async waiting
- atom construction
- challenge signing
- step/state persistence

The thin helper continued to cover:

- "now do step 1, then step 2, then step 3"
- small bits of run-specific branching
- visible local execution order

That is the right boundary.

## Harness Evidence

The final rerun of the full suite passed for all four targets:

- [report.json](/tmp/dojo-harness-agent-comfort-runtime-rerun/report.json)

Summaries:

- [scripted-dojo](/tmp/dojo-harness-agent-comfort-runtime-rerun/scripted-dojo/trial-01/summary.json)
- [codex](/tmp/dojo-harness-agent-comfort-runtime-rerun/codex/trial-01/summary.json)
- [claude](/tmp/dojo-harness-agent-comfort-runtime-rerun/claude/trial-01/summary.json)
- [pi](/tmp/dojo-harness-agent-comfort-runtime-rerun/pi/trial-01/summary.json)

Important outcomes:

- `scripted-dojo` uses the runtime directly with no helper
- `codex`, `claude`, and `pi` all passed while still generating a thin Python
  helper
- those helpers used the runtime as the mechanics surface rather than dropping
  to the lower-level SDK for ordinary seams

Claude also had one earlier idle-timeout fluke in a prior matrix run, but it
passed both an isolated rerun and the later full rerun, so that earlier miss
was not evidence of a runtime regression.

## Working Guidance

If the goal is the most comfortable agent integration:

- keep the mechanics surface importable and in Python
- keep the runtime close to the wire
- expose visible state and progress artifacts
- expose narrow verbs with obvious input/output
- let agents keep sequencing in their own thin local helper when they want it

Do not:

- turn the runtime into a solved dojo client
- hide sequencing inside a smart framework
- force agents into an out-of-process wrapper or command protocol

## Prevention

For future runtime-surface changes:

- validate with the full harness, not just the scripted dojo
- inspect whether agents are using the runtime for mechanics even if they still
  generate a helper
- treat "thin helper around the runtime" as healthy unless it is bypassing the
  runtime for common seams
- watch for abstraction leaks:
  - reaching through `local_state`
  - direct SDK use for common session mechanics
  - missing state/progress visibility in the runtime

The success condition is not "no helper script ever appears."
The success condition is:

- the runtime owns mechanics cleanly
- the agent owns sequencing cleanly
- the dojo still completes end to end
