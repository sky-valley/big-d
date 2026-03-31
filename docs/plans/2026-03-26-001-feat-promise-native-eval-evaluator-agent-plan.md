---
title: "feat: Add a promise-native evaluator agent to Headwaters evals"
type: feat
status: active
date: 2026-03-26
---

# feat: Add a promise-native evaluator agent to Headwaters evals

## Overview

The current Headwaters eval harness seeds the shared space by launching a small
operator script that posts one `INTENT` into the commons and exits immediately.
That is enough to create something for worker agents to react to, but it leaves
the initiating participant unreal:

- it never stays to observe responses
- it never answers follow-up intents
- it never chooses between competing promises
- it never posts `ACCEPT` or `ASSESS`
- it cannot reveal whether worker agents handle a real counterparty on the
  other end of the work they pick up

This plan replaces the fire-and-forget operator with a long-lived evaluator
agent. The evaluator is not part of the scored worker swarm. Its job is to act
as the requestor behind the seed intent: post the initial ask, stay in the
space, respond to what other agents do, and drive the lifecycle forward where a
real requester would.

In v1, the initial ask itself should stay exactly the same as today. The
evaluator should be fed the current fixed recipe-book task, so the behavioral
change is the live requester workflow rather than a changed seed task.

## Problem Statement / Motivation

The existing eval shape proves only the first half of coordination:

- can worker agents notice a shared intent
- can they discuss it
- can they post sub-intents or promises

It does not prove the second half:

- can a requester agent stay engaged long enough to bind work with `ACCEPT`
- can workers operate correctly when the requester pushes back, clarifies scope,
  or chooses among multiple promises
- can the space sustain a fuller requester/worker loop rather than a one-way
  dropbox
- can agents handle the fact that the originator is also an autonomous
  participant instead of a silent benchmark fixture

That gap matters because the current eval harness makes the collaboration target
artificially passive. A real intent-space environment should allow the party
that posted the original desire to keep participating on its own terms.

## Proposed Solution

Introduce a dedicated evaluator agent that participates as the requester for the
seed task from start to finish.

The evaluator should:

1. join the commons through the same public runtime surface as any other agent
2. post the same initial root `INTENT` content the harness uses today
3. remain connected after posting
4. monitor the root thread and relevant child spaces
5. respond to worker participation by:
   - acknowledging clarifications or follow-up intents
   - deciding whether to `ACCEPT` a worker promise
   - later posting `ASSESS` on completed work claims when it has enough signal
6. leave behind explicit artifacts describing what it saw and why it acted

The evaluator is a special role in the harness, but not a special protocol.
It should use the same promise-native forms the workers are expected to handle.
It should also be launched with the repo’s public agent pack as its procedural
orientation surface so it follows the same observable participation discipline:
observe first, enter the right space, use the runtime as a protocol shell, and
only make requester-side commitments it actually chooses to make.

### Desired evaluator behavior

The first implementation should aim for a bounded requester loop, not a fully
general project manager:

- seed the existing fixed recipe-book project brief
- observe and react within the resulting collaboration subspace
- support at least one clean `PROMISE -> ACCEPT -> COMPLETE -> ASSESS` path
- avoid trying to manage every worker simultaneously
- prefer explicit, inspectable choices over hidden heuristics

This keeps the eval focused on whether the worker agents can interact with a
live counterparty, not on whether the evaluator itself is superhuman.

### Recommended architecture

Add a new evaluator-agent runtime/script rather than trying to stretch the
current one-shot Python operator into a hidden state machine.

Why:

- the current operator exists only to inject and exit
- a long-lived requester needs explicit local state, message watching, and
  lifecycle handling
- the academy tutor already shows the right shape for a durable protocol actor:
  it tracks sessions, validates lifecycle binding, and stays present
- keeping the evaluator separate from worker agents preserves a clean role
  boundary in the harness
- giving the evaluator the public agent pack keeps it closer to the same
  mechanics and conceptual model that external agents use, rather than turning
  it into a harness-only special case

## Technical Considerations

- **Non-scored role:** the evaluator should not count as one of the worker
  agents in the existing eval metrics. Its evidence should still be recorded.
- **Agent-pack orientation:** the evaluator should be prompted to use
  `agent-pack/SKILL.md` and its normal reference flow as its first source of
  procedural truth, not a bespoke hidden workflow embedded only in eval code.
- **Seed-task stability:** the evaluator should continue using the current fixed
  recipe-book intent so any before/after comparison isolates the effect of a
  live requester rather than task drift.
- **Lifecycle honesty:** the evaluator should only post `ACCEPT` and `ASSESS`
  where it truly stands in the requester role. It should not simulate worker
  behavior or auto-complete tasks it did not do.
- **State tracking:** the evaluator needs local state for:
  - the root intent it posted
  - which worker promises it has seen
  - which promise, if any, it has accepted
  - which completions are awaiting assessment
- **Concurrency policy:** multiple workers may promise on the same root intent.
  The evaluator needs an explicit policy for whether it:
  - accepts one and leaves others unbound
  - accepts multiple parallel slices
  - asks for clarification first through follow-up intents
- **Assessment policy:** `ASSESS` must remain a judgment, not a timer-based
  reflex. The evaluator needs a bounded rubric for what counts as enough signal
  to assess `FULFILLED` versus `BROKEN`.
- **Artifact visibility:** the run artifacts should clearly separate evaluator
  actions from worker actions so the resulting timeline is understandable.

## System-Wide Impact

- **Interaction graph:** harness starts Headwaters, launches evaluator, the
  evaluator posts the root `INTENT`, worker agents enter and promise or discuss,
  the evaluator chooses whether to respond with clarification, `ACCEPT`, or
  eventual `ASSESS`, and the shared transcript now contains both sides of the
  requester/worker exchange.
- **Error propagation:** evaluator mistakes become explicit protocol behavior in
  the transcript rather than hidden harness omissions. A missed `ACCEPT` or bad
  `ASSESS` is now observable and debuggable.
- **State lifecycle risks:** if the evaluator crashes after posting the root
  intent but before handling replies, the run can strand live worker promises.
  The evaluator therefore needs bounded restart or at least honest failure
  artifacts.
- **API surface parity:** harness launch configuration, timeline generation,
  summaries, and report rendering all need first-class evaluator metadata.
- **Integration test scenarios:** runs now need to cover not just worker
  response to an intent, but evaluator response to `PROMISE`, `COMPLETE`, and
  clarification traffic.

## Implementation Phases

### Phase 1: Model the evaluator as a first-class harness participant

Replace the one-shot operator role with a durable evaluator role in the harness.

**Files:**

| File | Change |
|------|--------|
| `evals/src/harness.ts` | Add evaluator launch, lifecycle tracking, and artifact wiring |
| `evals/scripts/headwaters-agent-pack-eval.ts` | Extend CLI/config parsing for evaluator mode if needed |
| `evals/src/prompts/headwaters-agent-pack.ts` or new evaluator prompt file | Add evaluator prompt framing that explicitly loads the public agent pack |
| `evals/src/harness.test.ts` | Cover evaluator participation metadata and non-scored treatment |

**Acceptance criteria:**
- [ ] The harness launches an evaluator participant separately from worker agents
- [ ] Evaluator artifacts are captured under the run directory like worker artifacts
- [ ] Existing worker-agent lists remain focused on the swarm, not the evaluator
- [ ] The evaluator is explicitly instructed to use the public agent pack before acting
- [ ] The evaluator is seeded with the same fixed task content the harness uses today

### Phase 2: Implement a promise-native evaluator loop

Create a dedicated evaluator script/runtime that can remain in the space and act
as a requester.

**Files:**

| File | Change |
|------|--------|
| `evals/scripts/headwaters_eval_operator.py` or new evaluator file under `evals/scripts/` | Replace the post-and-exit flow with a stateful evaluator loop |
| `agent-pack/sdk/promise_runtime.py` or `headwaters/skill-pack/sdk/promise_runtime.py` | Add helper coverage only if the evaluator loop truly needs a missing mechanical primitive |
| `evals/src/harness.ts` | Thread evaluator prompt/config and shutdown handling |

**Acceptance criteria:**
- [ ] The evaluator posts the root `INTENT` and stays connected
- [ ] The evaluator can notice worker `PROMISE` and `COMPLETE` messages in the relevant thread
- [ ] The evaluator can post at least `ACCEPT` and `ASSESS` in response to worker activity
- [ ] The evaluator leaves explicit local state and reasoning artifacts
- [ ] The evaluator can complete this loop while following the agent-pack procedure rather than a private harness shortcut

### Phase 3: Preserve evaluator autonomy while capturing what it chose

Do not hardcode requester decision policy beyond the protocol and pack
guardrails. The evaluator should stay free to decide how to respond to worker
activity on its own terms.

**Files:**

| File | Change |
|------|--------|
| `evals/scripts/*evaluator*` | Remove or avoid harness-authored decision policy beyond protocol constraints |
| `evals/src/harness.test.ts` | Cover autonomy-preserving scenarios without assuming one acceptance strategy |
| `evals/src/harness.ts` | Surface evaluator decisions in reports and summaries as observed behavior |

**Acceptance criteria:**
- [ ] The evaluator is not forced into a fixed acceptance or assessment strategy by the harness
- [ ] The evaluator remains constrained by normal protocol validity and agent-pack procedure
- [ ] The run artifacts make it clear what the evaluator actually chose to do

### Phase 4: Update evidence and reporting around the fuller lifecycle

Make the eval outputs legible now that the requester also participates.

**Files:**

| File | Change |
|------|--------|
| `evals/src/harness.ts` | Extend report/timeline generation to show evaluator decisions |
| `evals/src/harness.test.ts` | Cover evaluator-aware timeline/report rendering |

**Acceptance criteria:**
- [ ] Reports show the evaluator’s root intent, accepted promise(s), and assessments
- [ ] Timelines distinguish evaluator actions from worker actions
- [ ] Failed or incomplete requester loops are visible in artifacts

## Alternative Approaches Considered

### Keep the current operator and just make its seed prompt nondeterministic

Rejected because the core problem is not prompt variety. The real missing piece
is that the initiating participant disappears before the promise workflow can
happen.

### Change the seed task at the same time as the evaluator change

Rejected for v1 because it would confound the result. Keeping the current fixed
recipe-book task makes it easier to judge what changed when the requester stays
alive.

### Count the evaluator as one of the worker agents

Rejected because it muddies the purpose of the run. The evaluator is the
requester-side counterparty, not another candidate worker.

### Embed evaluator behavior directly into the harness with no explicit agent script

Rejected because it would recreate the same architectural smell already solved
elsewhere in the repo: hidden control logic masquerading as a participant
instead of a real actor with explicit protocol behavior and local artifacts.

## Acceptance Criteria

### Functional Requirements

- [ ] The eval run includes a requester-side evaluator that posts the root
      intent and remains in the space
- [ ] The root intent content remains the current fixed recipe-book task
- [ ] The evaluator can observe and respond to worker promises and completions
- [ ] The evaluator can post `ACCEPT` and `ASSESS` where appropriate
- [ ] Worker agents can interact with a live requester rather than a vanished
      seed actor

### Non-Functional Requirements

- [ ] The evaluator is excluded from worker scoring paths
- [ ] Evaluator decisions are inspectable in local artifacts and reports
- [ ] The evaluator uses the same promise/runtime surface as other agents where
      practical
- [ ] The evaluator is launched with the public agent pack as its participation guide
- [ ] No hidden callback path becomes the semantic center of the workflow

### Quality Gates

- [ ] Unit or scenario tests cover the evaluator seeing `PROMISE`, posting
      `ACCEPT`, seeing `COMPLETE`, and posting `ASSESS`
- [ ] At least one smoke run demonstrates a closed requester/worker lifecycle
- [ ] Documentation or runbook notes explain the evaluator’s role and limits

## Success Metrics

- Eval transcripts show both sides of the requester/worker interaction rather
  than only worker-side speculation
- The same seed task can be compared before and after the evaluator-agent change
  because the task content itself did not change
- At least one run demonstrates a real `PROMISE -> ACCEPT -> COMPLETE -> ASSESS`
  path involving the evaluator
- Reviewers can tell whether workers handled a live requester well or poorly
- The evaluator exposes coordination failure modes that were invisible when the
  seed actor exited immediately

## Dependencies & Risks

- A naive evaluator may accept or assess too aggressively, creating fake signal
  instead of a meaningful requester role.
- A too-passive evaluator may stay alive but still fail to exercise the
  workflow, leaving the run only marginally better than today.
- Because the evaluator is intentionally autonomous, runs may be harder to
  compare unless artifacts capture its choices clearly.
- Long-lived evaluator state increases crash and timeout complexity compared with
  the current one-shot operator.

## Open Questions

- How much evaluator-specific framing is useful before it starts turning into
  hidden policy rather than agent autonomy?
- What should count as sufficient evidence for `ASSESS` in this eval context if
  we want the evaluator to judge freely but still leave interpretable artifacts?
- Do we want a minimum observation window before the evaluator exits, or should
  that also remain agent-chosen?

## Promise-Native Architecture Check

- **Autonomous participants:** the evaluator agent is the requester-side actor;
  worker agents remain autonomous responders; Headwaters commons is the shared
  observation and posting surface; the harness only orchestrates process
  startup, logging, and teardown.
- **Promises about self:** workers promise their own work; the evaluator only
  posts requester-side acts it actually owns, such as choosing to `ACCEPT` a
  promise or judging a claimed completion via `ASSESS`.
- **State authority:** evaluator local state is authoritative for its requester
  bookkeeping; posted ITP messages are authoritative for shared visible acts;
  the intent space remains observational and containment-oriented rather than an
  implicit hidden state machine for evaluator policy.
- **Lifecycle acts required and why:** this workflow explicitly needs `INTENT`
  from the evaluator, worker `PROMISE`, evaluator `ACCEPT`, worker `COMPLETE`,
  and evaluator `ASSESS` if the goal is to test a fuller requester/worker loop.
  `DECLINE` remains available when either side chooses not to continue.
- **Intent-space purity:** the evaluator participates through normal protocol
  messages, not a private harness side-channel. The harness should not auto-bind
  promises or auto-assess outside the evaluator actor, and the evaluator should
  learn its participation procedure from the same public agent pack that other
  agents can use.
- **Visibility / containment:** the root request remains visible in commons; the
  evaluator should react inside the relevant request thread or subspace rather
  than scattering lifecycle messages into unrelated spaces; evaluator-local
  reasoning stays in artifacts, not in hidden protocol extensions.
- **Rejected shortcut:** do not keep the current fire-and-forget operator and
  bolt on fake `ACCEPT`/`ASSESS` decisions inside the harness. That would look
  promise-native in the transcript while still bypassing a real requester
  participant.

## Sources & References

- Current eval harness:
  [`evals/src/harness.ts`](/Users/julestalbourdet/Documents/sky_valley/big-d/evals/src/harness.ts:154)
- Current operator script:
  [`evals/scripts/headwaters_eval_operator.py`](/Users/julestalbourdet/Documents/sky_valley/big-d/evals/scripts/headwaters_eval_operator.py:1)
- Tutor-style long-lived protocol actor:
  [`academy/src/tutor.ts`](/Users/julestalbourdet/Documents/sky_valley/big-d/academy/src/tutor.ts:1)
- Tutor harness lifecycle detection:
  [`academy/src/harness.ts`](/Users/julestalbourdet/Documents/sky_valley/big-d/academy/src/harness.ts:760)
- Promise runtime wait helpers:
  [`agent-pack/sdk/promise_runtime.py`](/Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/sdk/promise_runtime.py:1)
- Agent pack orientation:
  [`agent-pack/SKILL.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/SKILL.md:1)
- Agent pack quickstart:
  [`agent-pack/references/QUICKSTART.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/references/QUICKSTART.md:1)
- Agent pack collaboration model:
  [`agent-pack/references/COLLABORATION.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/references/COLLABORATION.md:1)
- Promise-native steward plan:
  [`docs/plans/2026-03-24-001-feat-headwaters-promise-native-steward-plan.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/plans/2026-03-24-001-feat-headwaters-promise-native-steward-plan.md:1)
- Guardrails:
  [`docs/architecture/promise-native-planning-guardrails.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/architecture/promise-native-planning-guardrails.md:1)
- Checklist:
  [`docs/checklists/promise-native-plan-review.md`](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/checklists/promise-native-plan-review.md:1)
