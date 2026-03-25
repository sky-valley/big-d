---
date: 2026-03-25
topic: multi-agent-swarm-eval
---

# Multi-Agent Swarm Evaluation

## Problem Frame

The current evals harness tests 2 agents in a shared intent space — enough to
verify basic coexistence and simple collaboration. But 2 agents can't reveal
whether emergent coordination actually scales: whether agents self-organize work
division, avoid duplication, form dependency chains deeper than a single handoff,
and behave like participants in a real multi-agent swarm rather than isolated
pairs.

We want a 10-agent evaluation pipeline that answers the question the 2-agent
case can't: does the intent-space coordination model produce meaningful emergent
behavior when there are many concurrent participants?

The primary signal is emergent coordination at scale — agents dividing work,
claiming non-overlapping slices, and forming dependency-aware sequences. A
secondary signal is whether this looks like a realistic swarm scenario (many
agents arriving, observing, and self-selecting work). Space stress tolerance and
pack robustness across diverse agent instances are useful diagnostics but not the
main evaluation target.

Automated scoring stays lightweight. The real assessment comes from the tester
reading agent stdout logs to observe how agents think, react to each other, and
self-organize. The harness is primarily an orchestration and evidence-capture
tool at this scale, not an automated judge.

## Requirements

- R1. The harness must support running up to 10 agents in a single trial against
  a shared Headwaters intent space.
- R2. The agent mix must be fully configurable via CLI (e.g.
  `--agents claude,claude,claude,codex,codex,codex,...`). Any combination of
  supported agent types should work.
- R3. Multiple agents of the same type must each get their own isolated workspace
  and log directory, disambiguated by instance index (e.g. `agents/claude-01/`,
  `agents/claude-02/`).
- R4. Agent launches must support configurable staggering via a `--stagger-ms`
  flag. Default is 0 (all simultaneous). When set, each successive agent launch
  is delayed by that interval.
- R5. Each agent's stdout log must be preserved as a full, untruncated file that
  the tester can read to assess the agent's reasoning and behavior.
- R6. The harness must produce a consolidated timeline view that interleaves key
  events from all agents chronologically — enrollment, scans, intents posted,
  promises made — correlated with agent identity. This is the first artifact the
  tester looks at.
- R7. Per-agent log files must remain available alongside the timeline for deep
  dives into individual agent behavior.
- R8. The existing three-stage scoring (orientation, coexistence, collaboration)
  must adapt its thresholds to be meaningful for N agents rather than hardcoded
  for 2.
- R9. The collaboration verdict must check that more than one agent engaged with
  the posted intent — the same basic signal as today, scaled to N.
- R10. The orientation and coexistence verdicts must report per-agent results
  (which agents passed, which failed) in addition to the stage-level verdict, so
  the tester can spot patterns across agent types or launch order.
- R11. The harness must handle the resource reality of 10 concurrent agent
  processes — each agent process and its workspace must be isolated enough that
  failures in one do not cascade to others.

## Success Criteria

- A tester can run a 10-agent trial with a configurable mix of Claude and Codex
  sessions against a single shared Headwaters intent space.
- The tester can open the consolidated timeline and see, at a glance, how agents
  arrived, what they observed, and how work was divided.
- The tester can drill into any individual agent's full stdout log to understand
  that agent's reasoning in detail.
- The harness correctly reports which agents passed orientation, which achieved
  coexistence, and which contributed to collaboration — not just stage-level
  binary verdicts.
- Staggered launches work, so the tester can observe how late-arriving agents
  handle an already-active space.

## Scope Boundaries

- This does not change the existing 2-agent eval — it augments the harness to
  support larger runs. Existing `--agents claude,codex` invocations work as
  before.
- The automated scoring stays simple. Sophisticated automated assessment of
  coordination quality (e.g. measuring work overlap, dependency chain depth) is
  out of scope for this iteration. The tester reads the logs.
- This does not add new agent types. The supported set remains claude, codex, pi,
  and scripted-headwaters.
- This does not change the prompt, the observation period, or the intent
  injection mechanism.

## Key Decisions

- **Configurable mix, not fixed**: The agent composition is a per-run CLI
  decision, not a hardcoded scenario.
- **Instance-indexed directories**: Duplicate agent types get `<type>-<index>`
  directories to avoid collision.
- **Configurable stagger**: Default simultaneous, with optional delay between
  launches for late-arrival scenarios.
- **Simple automated scoring + human review**: The harness captures evidence; the
  tester assesses coordination quality from the logs.
- **Timeline as primary output**: A consolidated chronological view of all agent
  activity is the first thing the tester looks at, with per-agent logs available
  for deep dives.
- **Per-agent verdict reporting**: Stage verdicts include per-agent breakdowns,
  not just aggregate pass/fail.

## Dependencies / Assumptions

- The Headwaters intent space can handle 10 concurrent agent connections without
  degrading. If it can't, that's a useful finding — but the harness should not
  mask it.
- The machine running the eval has enough resources for 10 concurrent
  Claude/Codex CLI processes. The stagger flag provides a pressure-relief valve.
- The intent-space database captures enough per-actor evidence to distinguish all
  10 agents' contributions via their handles.

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R6][Technical] What events should the consolidated timeline extract
  from the intent-space DB and agent logs, and what format makes the timeline
  scannable for 10 agents?
- [Affects R8][Technical] What coexistence threshold is meaningful for N agents?
  (e.g. "at least N/2 agents demonstrated presence" vs "all agents")
- [Affects R11][Technical] Should each agent instance get its own Claude
  session-id / Codex workspace isolation, or is the current per-directory
  isolation sufficient at 10 agents?
- [Affects R4][Needs research] What stagger interval produces interesting
  late-arrival dynamics without making the trial unreasonably long?

## Next Steps

-> `/ce:plan` for structured implementation planning
