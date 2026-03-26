---
date: 2026-03-25
topic: agent-profiled-swarm-eval
---

# Agent-Profiled Swarm Evaluation

## Problem Frame

The current multi-agent eval pipeline launches all agents into the shared space
with the same starting prompt shape. That is good for testing baseline
co-presence, but it does not resemble a believable swarm of differentiated
participants. If every agent joins as a blank, undifferentiated coding session,
the evaluation cannot tell whether the coordination model still works when the
participants arrive with distinct strengths and working styles.

This change should make swarm runs feel more like a real team: some agents
arrive inclined toward engineering, some toward creative work, some toward
frontend or backend concerns, and each profile carries a distinct personality
frame. The goal is better realism in the evaluation, not open-ended prompt
customization.

## Requirements

- R1. The eval harness must support a fixed built-in set of agent profiles for
  swarm runs.
- R2. Each built-in profile must define both a capability frame and a
  personality frame so that profiled agents join as distinct teammates rather
  than identical sessions with different labels.
- R3. Profile assignment must be deterministic by launch order within a run.
- R4. The harness must not require the operator to specify a per-agent custom
  profile text for normal profiled runs.
- R5. When the run contains more agents than unique built-in specialist
  profiles, the harness must reuse profiles in a way that biases additional
  agents toward generalist-style participation rather than evenly repeating the
  specialist set.
- R6. Profiled agents must still participate in the same shared Headwaters eval
  flow as today. This feature changes how they are framed at join time, not the
  shared-space evaluation model itself.
- R7. The harness must record which built-in profile each launched agent
  received.
- R8. Trial artifacts and human-readable evaluation outputs must surface the
  assigned profile for each agent so the tester can interpret behavior in that
  context.
- R9. Existing non-profiled baseline eval behavior must remain available so
  profiled runs can be compared against unprofiled runs.

## Success Criteria

- A tester can run a swarm trial and see agents enter with distinct built-in
  teammate identities rather than a uniform starting frame.
- The assigned profile for every agent is visible in the run artifacts and main
  evaluation outputs.
- Runs with more agents than specialist profiles still preserve a believable
  participant mix by favoring generalist overflow rather than mechanically
  cloning specialists.
- The harness still supports baseline runs without profiles for comparison.

## Scope Boundaries

- This does not introduce free-form per-agent system prompt authoring.
- This does not require model-specific profile sets. The built-in profiles are a
  harness-level concept, not a Claude-only or Codex-only feature.
- This does not change the underlying Headwaters participation flow, scoring
  model, or shared-space protocol.
- This does not require the exact order of repeated overflow profiles to matter
  once the skill mix is equivalent.

## Key Decisions

- **Built-in profiles, not custom prompting**: the goal is realistic,
  repeatable swarm composition rather than unconstrained prompt experimentation.
- **Profiles define skills and personality together**: a profile should shape
  both what work an agent gravitates toward and how it behaves as a participant.
- **Launch-order assignment**: profile selection should be deterministic without
  extra operator ceremony.
- **Generalist-biased overflow**: when the run exceeds the specialist roster,
  additional agents should skew toward broadly useful participants rather than
  repeating narrow specialties evenly.
- **Profiles are first-class evaluation metadata**: the harness should expose
  profile assignment in reports and artifacts, not hide it as internal setup.

## Dependencies / Assumptions

- The current swarm harness already has a stable agent launch pipeline where a
  per-agent framing layer can be introduced.
- A small built-in roster is enough to improve realism without making the eval
  matrix difficult to interpret.

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R1][Technical] What exact built-in profile roster best covers the
  intended teammate mix while staying small and legible?
- [Affects R5][Technical] What concrete overflow rule best expresses
  "generalist-biased" reuse for large runs?
- [Affects R8][Technical] Which evaluation artifacts should display profiles:
  timeline only, summary only, per-agent logs metadata, or all of them?
- [Affects R9][Technical] What is the cleanest operator interface for choosing
  profiled versus baseline runs without complicating the common CLI path?

## Next Steps

-> `/prompts:ce-plan` for structured implementation planning
