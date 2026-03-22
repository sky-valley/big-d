---
title: feat: Make the Python runtime feel more natural to agents
type: feat
status: completed
date: 2026-03-20
---

# feat: Make the Python runtime feel more natural to agents

## Overview

Improve the agent-facing Python runtime so it feels closer to the way current
agents naturally work when they sequence bash commands and tool calls.

The goal is not to make the runtime more magical. The goal is to make it more:

- inspectable
- stepwise
- explicit
- composable
- trustworthy as a mechanics surface

The runtime should continue to own protocol mechanics while agents continue to
own workflow reasoning.

## Problem Statement / Motivation

The current Python runtime direction is correct, but it still does not fully
match the working style agents prefer.

Recent dojo runs established:

- agents are comfortable with thin, importable Python surfaces
- they prefer in-process control over wrapper orchestration
- they like one live connection, visible artifacts, explicit steps, and fast
  feedback loops
- they still often author a thin local helper script around the runtime to make
  the sequence and state legible to themselves

This mirrors why agents are comfortable with ordered bash/tool calls:

- each step is explicit
- inputs and outputs are visible
- state transitions are inspectable
- failures are local and recoverable
- the model remains the one composing the plan

The current runtime already improved one important seam:

- `sign_challenge(...)` now lives on the session
- `wait_or_scan(...)` remains the right live-session default

But the runtime still strays from the “protocol shell” ideal in two main ways:

1. state and progress are not exposed clearly enough
2. sequencing ergonomics still push agents to create their own procedural
   scratchpad scripts

## Proposed Solution

Evolve `academy/skill-pack/sdk/promise_runtime.py` into a more explicit,
shell-like protocol workbench while keeping it thin and generic.

The runtime should expose:

- legible session state
- visible recent events
- narrow verbs with obvious I/O
- optional progress/logging helpers
- zero workflow-specific automation

This should make the runtime easier to trust and easier to compose directly,
reducing the need for agents to rebuild thin infrastructure around it.

## Technical Considerations

- Keep the runtime importable and in-process.
- Do not reintroduce a wrapper process or out-of-band orchestration layer.
- Do not encode dojo sequence logic into the runtime.
- Do not mutate `intent-space/` into a workflow engine.
- Prefer the cleanest runtime surface even if that means breaking the current
  pack/runtime API.
- Update the pack docs, examples, dogfood client, and harness expectations
  together rather than carrying backward-compatibility baggage.

## System-Wide Impact

- **Interaction graph**: runtime changes primarily affect the academy pack,
  scripted dojo agent, and harnessed external agents. The tutor and
  `intent-space/` should not need conceptual changes.
- **Error propagation**: clearer runtime methods should reduce “reach through”
  behavior and make timeout / missing-message / wrong-subspace failures easier
  to classify.
- **State lifecycle risks**: new state-inspection helpers must remain read-only
  and must not create hidden session mutations.
- **API surface parity**: the runtime docs, examples, and dojo agent must all
  use the same preferred surface. The SDK should remain the lower-level escape
  hatch, not a parallel primary path.
- **Integration test scenarios**: the harness must confirm that changes do not
  regress dojo completion and must inspect whether agents use the runtime more
  directly afterward.

## Implementation Phases

### Phase 1: Define Protocol-Shell Principles

Write down the runtime ergonomics rule set explicitly.

Deliverables:

- add a short section to the runtime docs explaining why bash/tool-call surfaces
  feel natural to agents
- define runtime principles such as:
  - explicit state transitions
  - visible session state
  - narrow verbs
  - local control of sequencing
  - no hidden orchestration

Success criteria:

- the docs state clearly what the runtime should optimize for
- future runtime additions can be judged against that standard

### Phase 2: Add Session Introspection

Add explicit inspection helpers to `PromiseRuntimeSession`.

Candidate additions:

- `session.snapshot()` or `session.status()`
- `session.identity_info()`
- `session.cursor_state()`
- `session.recent_messages()` or `session.inbox_snapshot()`
- `session.list_artifacts()`

These should surface current known state without requiring agents to read
through lower-level implementation details or inspect the filesystem manually.

Success criteria:

- agents can inspect current runtime state through the runtime itself
- helpers are read-only and predictable

### Phase 3: Add Better Progress Surfaces

Make runtime execution more legible without solving workflows.

Candidate additions:

- structured event logging helpers
- `session.record_step(name, payload)`
- `session.save_step_artifact(name, payload)`
- explicit event snapshots after waits and scans

This should let the runtime itself become the visible execution trace, reducing
the need for the agent helper script to serve as the only procedural log.

Success criteria:

- runtime usage leaves a clearer execution trail
- agents can see what happened after each operation without custom logging glue

### Phase 4: Tighten Sequencing Ergonomics Without Solving The Workflow

Add a few narrowly scoped helper methods only if they remain mechanical rather
than workflow-prescriptive.

Candidate additions:

- `wait_for_intent(...)`
- `wait_for_promise(...)`
- `wait_for_decline(...)`
- `wait_for_complete(...)`

These should be thin predicate wrappers around existing live-session behavior,
not hidden state machines.

Success criteria:

- common protocol waits become easier to express
- helpers do not encode dojo-specific branching or tutorial semantics

### Phase 5: Align Pack And Dogfood Surfaces

Update all active pack docs and the scripted dojo agent to use the improved
runtime surface consistently.

Files likely affected:

- `academy/skill-pack/sdk/promise_runtime.py`
- `academy/skill-pack/SKILL.md`
- `academy/skill-pack/references/QUICKSTART.md`
- `academy/skill-pack/references/REFERENCE.md`
- `academy/skill-pack/references/MICRO_EXAMPLES.md`
- `academy/scripts/dojo-agent.py`

Success criteria:

- the pack teaches one clear primary mechanics surface
- examples match the current runtime API exactly

### Phase 6: Re-run Agent Harness And Compare Disposition

Run the full dojo harness again with:

- `scripted-dojo`
- `codex`
- `claude`
- `pi`

Measure:

- completion
- helper generation vs direct runtime usage
- whether interviews mention the runtime as sufficient
- whether agents still feel the need to build a helper purely for visibility

Success criteria:

- no regression in dojo completion
- at least one external agent uses the runtime more directly than before, or
  gives a clearer reason for still needing a helper

## Alternative Approaches Considered

### 1. Add more workflow logic to the runtime

Rejected because it would turn the runtime into a solved dojo client and blur
the boundary between mechanics and reasoning.

### 2. Reintroduce a wrapper or REPL process

Rejected because recent experiments already showed agents prefer importable
Python over out-of-process orchestration.

### 3. Leave the runtime as-is

Rejected because the current shape is good but not yet maximally comfortable.
The agents’ continued use of thin helper scripts shows there is still room to
improve the mechanics surface.

## Acceptance Criteria

- [x] The runtime docs explicitly define the “protocol shell” design principles.
- [x] `PromiseRuntimeSession` exposes at least one clear state-inspection method.
- [x] The runtime exposes explicit progress/logging helpers or equivalent
      inspectable step artifacts.
- [x] Any new sequencing helpers remain mechanical and non-dojo-specific.
- [x] The scripted dojo agent uses the improved runtime surface consistently.
- [x] The active academy pack docs match the improved runtime API exactly.
- [x] Full dojo harness runs still pass for `scripted-dojo`, `codex`, `claude`,
      and `pi`.
- [x] Post-run interviews or behavior provide better evidence that the runtime
      is becoming more natural to agents.

## Success Metrics

- fewer or smaller runtime abstraction leaks in agent-generated helpers
- fewer direct drops to `intent_space_sdk.py` for common mechanics
- clearer agent interview language that the runtime was sufficient for the
  mechanics surface
- no regression in completion or reliability

## Dependencies & Risks

Dependencies:

- current Python runtime in `academy/skill-pack/sdk/promise_runtime.py`
- current dojo harness and interview capture in `academy/src/harness.ts`
- current pack docs and dogfood client

Risks:

- breaking the runtime surface without updating every active teaching/example
  path could create fresh drift
- adding too many helpers could turn the runtime into a workflow framework
- adding too much hidden state could reduce trust rather than increase comfort
- doc changes without dogfooding could create another drift cycle

Mitigations:

- treat this as a coordinated surface rewrite, not an incremental patch series
- evaluate every helper against the “bash is comfy” criteria
- keep helpers narrow and explicit
- update docs and dogfood client in the same change
- validate through the harness immediately

## Sources & References

- [python-pack-runtime-matched-agent-preferences-better-than-ts-wrapper-20260317.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/python-pack-runtime-matched-agent-preferences-better-than-ts-wrapper-20260317.md)
- [academy/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- [academy/scripts/dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)
- [academy/src/harness.ts](/Users/noam/work/skyvalley/big-d/academy/src/harness.ts)
- [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
