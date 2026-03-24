---
date: 2026-03-23
topic: agent-pack-evaluation
---

# Agent Pack Evaluation

## Problem Frame

We have a new root-level `agent-pack/` for intent space and want to know whether
it is actually helpful to agents on its own terms.

This evaluation should test the pack only, not broader repo behavior or unrelated
agent capabilities. The goal is to learn whether the pack improves observable
agent behavior in intent space, identify where it fails, and generate clear
evidence for iterative improvements.

The evaluation should not reward eloquent explanation in the abstract. It should
judge the pack by whether agents can behave competently in intent space after
using it.

## Requirements

- R1. The evaluation must test only the new `agent-pack/` as the unit under
  test.
- R2. The evaluation must focus on agent actions and behavior in intent space,
  not on verbal comprehension checks.
- R3. The evaluation must use several small independent scenarios before a final
  combined sequence.
- R4. The first iteration must start with three small scenarios.
- R5. The first small scenario must test whether an agent can connect to an
  existing intent space, observe it, and distinguish relevant from irrelevant
  intents.
- R6. The second small scenario must test whether an agent can post a valid
  intent.
- R7. The third small scenario must test selective participation: the agent
  should engage only with tasks it is qualified for rather than trying to do
  everything it sees.
- R8. The selective-participation scenario must include two cases:
  `3A` one qualified intent among irrelevant or unqualified intents, and `3B`
  multiple qualified intents so we can observe whether the agent returns after
  finishing one and optionally takes another.
- R9. The final combined sequence must place a purpose-scoped agent into a mixed
  environment containing relevant, irrelevant, and potentially misleading
  intents.
- R10. The final combined sequence must exercise, in combination, mechanics,
  autonomy, promise-boundary correctness, and child-space navigation.
- R11. Scenario scoring must be binary at the primary verdict level.
- R12. The scoring model must be capability-first: a scenario passes when the
  capability is demonstrated, even if the path is messy, while errors and
  mistakes are still logged for diagnosis.
- R13. The evaluation must capture full diagnostics for every test, including
  what stage of the test the agent is in, what it appears to think, and what
  errors or failures occur.
- R14. Diagnostic capture must persist enough evidence to analyze why an agent
  did not take a second qualified task in scenario `3B`, including whether that
  was a deliberate choice, confusion, drift, or loss of context.
- R15. The first iteration should emphasize mechanics and autonomy over richer
  persona design or comparative baseline methodology.
- R16. The mandatory artifact set for the first iteration must stay lean:
  raw agent transcript, raw intent-space event log, condensed scenario timeline,
  and condensed free-form error log.
- R17. The condensed scenario timeline must place agent thoughts or reasoning
  snippets at the relevant moment in the sequence when that evidence is
  available from the agent runtime.
- R18. The final combined sequence must record two separate binary outcomes:
  whether the agent completed one qualified task and returned to the space, and
  whether it then completed another qualified task after returning.

## Success Criteria

- We can tell whether the pack enables an agent to connect, observe, and post in
  intent space.
- We can tell whether the pack helps an agent participate selectively rather than
  acting on everything visible.
- We can tell whether an agent can operate in a mixed environment without
  collapsing into overreach, confusion, or false obligation.
- Every scenario produces a clear binary verdict plus enough diagnostic evidence
  to improve the pack.
- Iterating on the pack produces comparable changes in scenario outcomes and
  error patterns over time.
- The final combined sequence yields two distinct comparable outcomes: `did one
  task and return` and `did another qualified task after returning`.

## Scope Boundaries

- This evaluation does not include a separate verbal comprehension phase.
- The first iteration does not require a formal baseline comparison against an
  older pack or degraded variant.
- The first iteration does not need a highly detailed persona model as long as
  the final mixed environment creates a meaningful relevance boundary.
- The first iteration does not optimize for elegant task execution; it optimizes
  for demonstrated capability plus diagnostic visibility.

## Key Decisions

- Behavioral-only evaluation: the pack is judged by what agents do in intent
  space, not by how well they explain it.
- Mixed structure: use small independent scenarios first, then a final combined
  sequence.
- Three-scenario first cut: keep the initial suite small enough to iterate
  quickly.
- Binary scoring: keep the primary outcome crisp and comparable.
- Capability-first grading: allow messy success, but preserve all mistakes for
  later analysis.
- Lean diagnostic capture: keep raw transcript and space logs, then add only a
  condensed scenario timeline and a condensed free-form error log.
- Reasoning should be attached to the relevant step: when the agent runtime
  exposes thoughts or self-report, place that evidence at the appropriate moment
  in the condensed timeline rather than building a separate thought artifact.
- Selective participation as the autonomy core: the main autonomy question is
  whether the agent acts only where it is qualified.
- Two final-sequence binaries: measure both return-after-one-task and
  completion-of-another-task-after-return.

## Dependencies / Assumptions

- A controlled intent-space environment can be prepared with specific relevant,
  irrelevant, and nested intents.
- We can capture enough agent transcript or trace data to infer stage and
  reasoning during the tests.
- We can observe intent-space state transitions well enough to correlate agent
  behavior with scenario progress and failure points.

## Outstanding Questions

### Resolve Before Planning

- None currently.

### Deferred to Planning

- [Affects R5][Technical] How should relevance be encoded in scenario 1 so the
  evaluator can determine whether the agent distinguished relevant from
  irrelevant intents correctly?
- [Affects R8][Technical] How should scenario `3B` determine that the agent has
  "finished one task" before observing whether it returns for another?
- [Affects R13][Needs research] What is the best way to capture "what it thinks"
  across different agent runtimes without overfitting to one CLI?
- [Affects R9][Technical] How should the mixed final environment be seeded so it
  tests autonomy, promise boundaries, and nested navigation without becoming too
  ambiguous to score?

## Next Steps

→ /prompts:ce-plan for structured implementation planning

## Post-Run Agent Feedback

After each run, ask the agent for brief feedback on the experience.

This should focus on:

- what in the `agent-pack/` was helpful
- what was confusing, missing, or misleading
- what should be improved first, if anything

This feedback is secondary to the behavioral evidence and should be used as
additional qualitative input for improving the pack.
