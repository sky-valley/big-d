---
date: 2026-03-24
topic: agent-pack-evaluation
---

# Agent Pack Evaluation

## Problem Frame

We want to know whether an agent that has only the root-level `agent-pack/` and
an intent-space URL can use the intent space correctly without guided onboarding
or repo-specific help.

This evaluation should use the real Headwaters-backed intent-space backend as the
environment under test. It should not reuse the Headwaters guided walkthrough as
the test flow, because the guided experience has already been validated
separately.

The primary question is zero-shot orientation: can an agent arrive in a quiet
live space, understand how to observe and navigate it from the pack alone, and
behave correctly before any work appears?

After that baseline is established, the evaluation should test whether multiple
real agents can coexist in the same space and whether useful collaboration can
emerge from intents and promises posted in the space itself.

The evaluation should judge the pack by observable behavior in the space, not by
abstract verbal explanation.

## Requirements

- R1. The evaluation must test `agent-pack/` as the unit under test.
- R2. The evaluation must use the real Headwaters-backed intent-space backend.
- R3. The evaluation must not use the Headwaters guided walkthrough as the test
  flow.
- R4. The evaluation must begin with zero-shot orientation as the first gate.
- R5. A zero-shot orientation run must start with only the pack and the
  intent-space URL.
- R6. The initial orientation space must begin quiet, with no seeded visible
  work intent.
- R7. The first hard failure gate must be navigation correctness: the agent must
  demonstrate that it can enter, observe, and navigate the space correctly
  before higher-level behavior is judged.
- R8. The orientation phase must explicitly test for autonomy confusion after
  navigation is established, including whether the agent overreads visible
  content as obligation.
- R9. After the quiet observation period, a root-level intent must be posted
  into the space so the evaluation can observe how the agent reacts once work
  appears.
- R10. The first phase must determine whether the agent understands what to do
  in the space right away from the pack alone, rather than only succeeding after
  repeated trial-and-error or implicit outside help.
- R11. The second phase must place multiple agents in the same shared intent
  space.
- R12. The multi-agent phase must use real pack-using agents for all
  participants, not scripted placeholder participants.
- R13. The main risk under test in the multi-agent phase is isolation: whether
  agents behave as if they are alone even when other participants are present in
  the shared space.
- R14. The multi-agent phase must test whether agents notice and interpret other
  agents only through observable space activity such as scanning, intents, and
  promises.
- R15. The collaboration phase must test whether useful handoffs emerge from
  intents and promises posted in the space, not from hidden orchestration.
- R16. The first collaboration scenario must use a pre-structured seed request
  that suggests likely work slices or dependencies strongly enough to make
  emergence observable.
- R17. The first collaboration scenario should be easier and more structured,
  with later iterations able to progress toward bounded product requests and then
  more abstract build requests.
- R18. The collaboration phase must be able to test a broad build request such
  as "build X" handled by multiple specialized software-engineer agents.
- R19. The collaboration phase must check whether agents specialize voluntarily
  through their own competence boundaries, for example one agent taking backend
  work and another taking frontend work that depends on it.
- R20. The collaboration phase must check whether later promises and follow-on
  intents reflect dependency-aware sequencing rather than isolated parallel
  action.
- R21. The evaluation must preserve the distinction between intent-space
  visibility and promise authority; success must not depend on treating visible
  intents as commands.
- R22. The evaluation should progress in three stages: zero-shot orientation,
  multi-agent coexistence, and collaboration emergence.
- R23. Each stage must produce a clear binary verdict at the stage level.
- R24. The scoring model must remain capability-first: a stage passes when the
  capability is demonstrated even if the path is messy, while mistakes are still
  logged for diagnosis.
- R25. The evaluation must capture full diagnostics for every run, including raw
  agent transcript, raw intent-space event log, and a condensed timeline that
  correlates agent behavior with observed space activity.
- R26. Diagnostics must preserve enough evidence to distinguish navigation
  confusion, autonomy confusion, isolation, and failed collaboration handoff.
- R27. The evaluation must record whether collaboration emerged from the posted
  space artifacts themselves or required outside prompting not contained in the
  pack or the space.

## Success Criteria

- We can tell whether an agent can enter a real Headwaters-backed intent space
  from pack plus URL alone and correctly find its footing before work appears.
- We can tell whether the agent understands that the space is observational and
  navigable without treating visible activity as mandatory work.
- We can tell whether multiple real agents share one space as co-present
  participants rather than acting as isolated singletons.
- We can tell whether a posted root-level intent produces useful promises,
  follow-on intents, and handoffs between specialized agents.
- We can tell whether collaboration emerges from what agents observe in the
  space rather than from hidden orchestration.
- Every stage produces a binary verdict plus enough diagnostic evidence to
  improve the pack.

## Scope Boundaries

- This evaluation does not reuse the Headwaters guided walkthrough.
- This evaluation does not primarily judge agents by verbal comprehension or
  interviews.
- The first collaboration pass does not start with the most abstract build
  request; it starts with a pre-structured request and can later move toward
  less scaffolding.
- The first iteration does not require scripted fake participants in the
  multi-agent phase.
- The evaluation should not collapse the distinction between visible intent and
  authoritative promise state.

## Key Decisions

- Headwaters backend only: use the real Headwaters-backed space as the live
  environment.
- No guided path: guided Headwaters onboarding is out of scope for this test.
- Zero-shot first: orientation in a quiet space is the first gate.
- Quiet-then-intent sequence: the agent first joins an empty-feeling space and
  only later sees a root-level intent appear.
- Navigation before autonomy: if the agent cannot correctly enter, read, and
  navigate the space, the run fails before autonomy is judged.
- Multi-agent evidence should be real: use real agents with the pack rather than
  scripted stand-ins.
- Isolation is the main multi-agent failure mode: the key question is whether
  agents notice and respond to shared-space activity as co-present participants.
- Collaboration is judged by emergent handoff: the strongest signal is that one
  agent's promise or work creates the next sensible step for another agent
  without explicit external assignment.
- Structured-first collaboration ladder: start with a pre-structured request,
  then later remove scaffolding toward more abstract requests.
- Capability-first grading: preserve binary verdicts while still capturing all
  mistakes and confusion patterns.

## Dependencies / Assumptions

- A controllable Headwaters-backed intent space can be prepared for repeated
  runs.
- We can launch multiple real agents against the same live space.
- We can capture enough transcript and event-log evidence to correlate what
  agents observed with the promises and intents they posted.
- We can stage the delayed root-level intent injection in a repeatable way after
  the initial quiet observation period.

## Outstanding Questions

### Resolve Before Planning

- None currently.

### Deferred to Planning

- [Affects R7][Technical] What concrete signals prove navigation correctness in a
  quiet shared space without drifting into overfitted mechanics checks?
- [Affects R10][Needs research] How should the evaluator distinguish genuine
  immediate understanding from eventual recovery after confusion?
- [Affects R13][Technical] How should the multi-agent stage determine that
  agents were effectively isolated rather than simply exercising appropriate
  restraint?
- [Affects R16][Product] What exact pre-structured build request best reveals
  emergent specialization and dependency-aware handoff?
- [Affects R20][Technical] What observable sequence should count as sufficient
  collaboration emergence for binary pass/fail scoring?
- [Affects R25][Needs research] What transcript and event-log normalization is
  needed across different agent runtimes to compare collaboration quality
  honestly?

## Next Steps

→ /prompts:ce-plan for structured implementation planning
