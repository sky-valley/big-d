---
title: "feat: Dojo Agent Evaluation Harness"
type: feat
status: completed
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md
---

# feat: Dojo Agent Evaluation Harness

## Overview

Build a local-only evaluation harness that stages the academy + station + tutor dojo and then runs real native agent CLIs against it to measure whether they can bootstrap from the published skill pack and complete the dojo with zero manual intervention.

This plan is grounded in the existing local station work: the academy pack already exists, the tutor already enforces registration and the ritual flow, and the repo already has a working happy-path dojo agent script. The harness is the layer that turns those pieces into a repeatable evaluation system across agent runtimes.

This plan carries forward the brainstorm decisions directly:

- local dojo only for v1
- real native CLIs only
- single-command test
- three trials per agent
- zero manual intervention as the primary success criterion
- scaffolding-required and failure localization as first-class outputs

See brainstorm: [docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md)

## Problem Statement / Motivation

We now have a functioning dojo and onboarding pack, but we do not yet know whether real skill-oriented agents can use it as intended.

The key unknown is not whether a handcrafted script can complete the ritual. We already proved that with [dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py). The real question is whether actual agent CLIs can:

- read the pack
- operationalize it zero-shot
- manage their own context and local state
- complete the dojo without human nudging

If we test this manually, the signal will be noisy and non-repeatable. We need a repeatable harness that can run multiple native agents, preserve artifacts, and tell us where the pack or runtime falls down.

## Proposed Solution

Build a shared harness core with small per-agent launch recipes.

The harness should:

1. stage the local dojo in a controlled managed session
2. launch one real agent CLI at a time with a single top-level instruction:
   `Use the skill pack at X and complete the dojo.`
3. capture agent-side transcripts and local artifacts
4. observe dojo-side transcripts from the station
5. classify each run as success or failure, with failure-stage localization
6. repeat each agent target three times
7. produce a comparative report across Codex CLI, Claude CLI, and Pi mono

The harness must not perform protocol work on behalf of the agents. It may normalize launch behavior and artifact collection, but it must not become a semantic facade that hides onboarding friction.

## Technical Considerations

- Use the existing managed local station pattern rather than detached backgrounding in Codex contexts. This directly applies the lesson from [persistent-session-needed-for-managed-local-stacks-20260313.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/persistent-session-needed-for-managed-local-stacks-20260313.md).
- Reuse the existing dojo substrate:
  - [academy/src/tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
  - [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
  - [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
  - [academy/scripts/dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)
- Prefer a recipe-driven launcher format over hard-coded branching so each agent runtime can vary in invocation details without changing the harness core.
- Keep scoring separate from raw evidence. Persist transcripts first, then derive classification and verdicts from those artifacts.
- Pi mono should be treated as a native skill-capable target first, per the brainstorm and research carry-forward, not as wrapper-dependent by default (see brainstorm: [docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md)).

## System-Wide Impact

- **Interaction graph**: harness run starts dojo stack, launches agent CLI, agent reads pack, agent interacts with registration/tutorial spaces, tutor responds, station persists transcript, harness collects artifacts and derives classification.
- **Error propagation**: failures can originate in stack startup, agent launch, skill discovery, file access, CLI permissions, registration flow, or tutor interaction. The harness should preserve enough raw evidence that these are separable after the fact.
- **State lifecycle risks**: partial runs may leave per-run artifacts, temporary agent files, or stale station transcript state. The harness should isolate runs in per-trial directories and either reset or namespace artifacts per trial.
- **API surface parity**: the harness should present the same high-level contract to all three agent targets even if each recipe uses a different CLI invocation.
- **Integration test scenarios**:
  - agent never discovers the pack
  - agent discovers pack but fails local identity generation/storage
  - agent registers but fails challenge signing
  - agent reaches tutorial but mishandles the deliberate decline
  - agent completes once but fails inconsistently across three runs

## Implementation Phases

### Phase 1: Harness Foundation

Build the harness core and artifact model.

Deliverables:
- a harness entrypoint under a dedicated scripts or tooling directory
- a per-run workspace layout for artifacts
- a shared run schema describing:
  - target agent
  - trial number
  - start/end time
  - raw outcome
  - classified failure stage
  - generated artifact paths
- local dojo stack integration using the managed-session model rather than detached backgrounding

Success criteria:
- harness can start or attach to the local dojo reliably
- harness writes a complete per-run artifact directory even for failed runs

### Phase 2: Agent Launch Recipes

Add launch recipes for:

- Codex CLI
- Claude CLI
- Pi mono

Each recipe should define:
- how to invoke the CLI
- how to pass the single top-level instruction
- how to point the agent at the skill pack
- where its transcript should be captured
- how to detect timeout or process termination

Success criteria:
- each target can be launched from the harness with the same logical test contract
- the harness does not inject hidden protocol instructions beyond the single top-level command

### Phase 3: External Observation And Classification

Add dojo-side observation and classification logic.

The harness should derive whether failure happened at:
- discovery
- skill loading
- identity generation
- local storage/setup
- registration intent
- challenge response
- tutorial navigation
- decline recovery
- accept
- assess
- timeout/unknown

Success criteria:
- every run has a classified terminal state
- raw station transcript references can be linked back to the run report

### Phase 4: Repetition And Comparative Reporting

Run three trials per agent and produce a comparative report.

The report should include:
- pass/fail per run
- completion time
- failure stage
- consistency across runs
- apparent scaffolding required
- notes on context drift or confusion inferred from transcripts

Success criteria:
- one command can run the full matrix locally
- output is readable enough to compare the three targets without manual log archaeology

## Alternative Approaches Considered

### 1. Pure black-box orchestration

Rejected as the default because it would make launches too brittle and comparisons too noisy, even though it is conceptually pure.

### 2. Rich adapter / facade per agent

Rejected because it risks hiding the very friction we are trying to measure. The harness must not do the dojo work for the agents.

### 3. Shared harness plus thin launch recipes

Chosen because it balances realism with operability. This came directly from the brainstorm decision to use a hybrid shape rather than either extreme (see brainstorm: [docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md)).

## Acceptance Criteria

### Functional Requirements

- [x] Harness can stage or attach to the local dojo stack without manual process juggling
- [x] Harness can run Codex CLI, Claude CLI, and Pi mono as separate native targets
- [x] Each target is launched with one top-level instruction only
- [x] Harness runs three trials per target
- [x] Each run produces persisted artifacts:
  - [x] raw agent transcript
  - [x] dojo/station transcript
  - [x] timing summary
  - [x] outcome summary
  - [x] failure classification
  - [x] generated local files relevant to bootstrap behavior
- [x] Harness produces a comparative report across all targets

### Non-Functional Requirements

- [x] Harness does not perform protocol semantics on behalf of agents
- [x] Run artifacts are isolated per agent and per trial
- [x] Failures remain inspectable after the run ends
- [x] The harness is local-only and does not assume a deployed station

### Quality Gates

- [x] Add automated coverage for the harness classifier and report generation where practical
- [x] Validate at least one full live run through the harness against the current local dojo
- [x] Document how to add a new agent recipe without changing harness core logic

## Success Metrics

- Primary: percentage of runs completed with zero manual intervention
- Secondary:
  - completion rate by agent target
  - median completion time per target
  - consistency across three runs
  - frequency of each failure stage
  - apparent scaffolding required per target

## Dependencies & Risks

### Dependencies

- existing dojo stack remains stable:
  - [academy/src/tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
  - [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
- native CLIs must be installed and invocable locally
- the managed-session local stack pattern remains available for orchestration

### Risks

- transcript formats may vary widely across agent CLIs
- “skill usage” may differ enough between agents that fair comparison becomes fuzzy
- Pi mono support for portable skills may be partial in practice
- scoring can become too subjective if not tied tightly to persisted artifacts

### Mitigations

- keep raw evidence primary and verdict logic secondary
- use per-agent launch recipes, not per-agent semantic adapters
- keep the first scoring rubric simple and observable

## Open Questions

These came from the brainstorm and remain intentionally unresolved for the first plan pass:

- What exact scoring rubric should convert raw run data into a comparative verdict across agents?
- How strict should timeout budgets be for each trial?
- How much local filesystem access should be standardized across the three CLIs so the comparison is fair without becoming artificial?
- Should the harness later support degraded-pack experiments to find which assumptions each agent depends on?

Recommended handling:
- resolve timeout and scoring during implementation design
- defer degraded-pack experiments until after the first baseline matrix exists

## Documentation Plan

- add a harness runbook under `docs/runbooks/`
- document the agent recipe format
- document how comparative reports are generated and interpreted
- add a checkpoint or solution note if the first round reveals major pack-tuning lessons

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md)
  Key decisions carried forward:
  - local dojo only
  - real native CLIs only
  - one-command zero-shot runs

### Internal References

- dojo happy-path script: [academy/scripts/dojo-agent.py](/Users/noam/work/skyvalley/big-d/academy/scripts/dojo-agent.py)
- tutor flow: [academy/src/tutor.ts](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
- academy onboarding doc: [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
- academy skill pack: [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
- local station runbook: [docs/runbooks/internet-intent-space-station.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/internet-intent-space-station.md)
- managed-session learning: [docs/solutions/integration-issues/persistent-session-needed-for-managed-local-stacks-20260313.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/persistent-session-needed-for-managed-local-stacks-20260313.md)

### Related Work

- station brainstorm: [docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-13-internet-intent-space-station-brainstorm.md)
- station implementation plan: [docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
