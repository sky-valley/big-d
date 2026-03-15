---
date: 2026-03-14
topic: dojo-agent-evaluation-harness
---

# Dojo Agent Evaluation Harness

## What We're Building

We need a local evaluation harness that stages the academy + station + tutor dojo and then tests whether real skill-wielding agents can complete the dojo from the published pack with zero manual intervention.

The harness should run three native agent targets:

- Codex CLI
- Claude CLI
- Pi mono / coding agent

Each agent should be launched through its real CLI, given one realistic top-level instruction, and left to figure out the rest from the pack, the academy docs, and the live dojo.

The instruction should stay minimal:

`Use the skill pack at X and complete the dojo.`

The harness is not testing raw protocol purity for its own sake. It is testing whether the pack is sufficient, whether the agent can operationalize it zero-shot, and where it breaks when it cannot.

## Why This Approach

We considered a pure black-box harness and a richer adapter-based harness.

A pure black-box approach is honest, but too brittle operationally. A richer adapter approach would make comparison easier, but risks hiding the real friction by helping the agents too much.

So the right first cut is a hybrid:

- one shared harness core
- one small launch recipe per agent CLI
- no semantic facade that performs protocol work for the agent
- instrumentation outside the agent so failure points are still localized

That keeps the test close to reality while still making it runnable and comparable.

## Key Decisions

- **Local dojo only for v1**: do not design for deployed station targets yet. Use the already working local academy + station + tutor stack.
- **Real native CLIs only**: test Codex CLI, Claude CLI, and Pi mono through their actual runtimes, not through simulated adapters.
- **Single-command test**: the harness should launch each agent with one top-level instruction and no hidden checklist.
- **Three trials per agent**: enough to detect flakiness and context variance, not just one lucky success.
- **Zero manual intervention is the main success criterion**: the agent either boots itself from the pack and completes the dojo, or it does not.
- **Protocol correctness is diagnostic, not the primary score**: success matters more, but transcript analysis should still reveal if success depended on accidental behavior.
- **Scaffolding required is a first-class output**: the harness should reveal whether an agent succeeded from pack-only behavior or needed extra setup, context management, or wrapper help.
- **Failure localization is the main instrumentation goal**: the harness should identify whether the run failed at discovery, skill loading, identity generation, storage, registration, challenge signing, ritual navigation, recovery from decline, promise acceptance, or assessment.
- **Artifacts are mandatory**: every run should persist raw agent transcript, dojo/station transcript, timing summary, outcome summary, failure classification, and generated local files relevant to the agent’s bootstrap behavior.
- **Pi mono should be tested as a native skill target first**: recent ecosystem signals suggest Pi now supports `SKILL.md`-style skills, so it should not be treated as wrapper-dependent by default.

## Proposed Harness Shape

The harness should have four responsibilities:

### 1. Stage the local dojo

Start the local academy, station, and tutor stack in a controlled session.

### 2. Launch agents with a recipe

Each agent gets a small launch recipe describing:

- how to invoke its CLI
- how to point it at the pack
- how to capture transcripts and local artifacts
- how to determine completion / timeout

### 3. Observe the dojo externally

The harness should watch the station transcript and correlate it with the agent transcript so it can classify where the run broke.

### 4. Produce comparative output

For each agent and each of three runs, record:

- pass/fail
- completion time
- failure stage
- signs of context drift or confusion
- whether extra scaffolding seemed necessary

## Success Criteria

An agent run counts as successful when:

- it starts from the single command
- it discovers and uses the pack
- it bootstraps itself with no manual intervention
- it completes registration and proof-of-possession
- it completes the dojo ritual through `ASSESS`

An agent target counts as viable when it can do this reliably enough across three runs that the result does not look accidental.

## Open Questions

- What exact scoring rubric should convert raw run data into a comparative verdict across agents?
- How strict should timeout budgets be for each trial?
- How much local filesystem access should be standardized across the three CLIs so the comparison is fair without becoming artificial?
- Should the harness also try a deliberately degraded pack later to test where each agent actually depends on implicit assumptions?

## Next Steps

Move to `/ce:plan` to define:

- harness architecture
- per-agent launch recipe format
- transcript capture model
- failure taxonomy
- report format
