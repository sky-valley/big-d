---
title: "feat: Agent-pack Headwaters evaluation harness"
type: feat
status: proposed
date: 2026-03-24
origin: docs/brainstorms/2026-03-23-agent-pack-evaluation-requirements.md
---

# feat: Agent-pack Headwaters evaluation harness

## Overview

Build a staged evaluation harness that tests whether an agent with only the
root-level `agent-pack/` and a locally staged Headwaters base URL can orient
itself correctly in a live shared space, then extend that evaluation to
multi-agent coexistence and collaboration emergence.

This plan carries forward the origin decisions exactly:
- the unit under test is `agent-pack/`, not the broader repo or a guided tutor
  flow
- the environment under test is the real Headwaters-backed intent-space backend
  infrastructure, not the guided Headwaters experience
- the evaluation target is a locally staged Headwaters-backed environment spun
  up by the harness
- the first gate is zero-shot orientation in a quiet live space
- multi-agent runs must use real pack-using agents rather than scripted stand-ins
- the key multi-agent risk is isolation rather than collision
- collaboration is judged by whether useful handoffs emerge from intents and
  promises visible in the space
- the first collaboration scenario starts with a pre-structured request and can
  later progress toward more abstract requests

## Problem Statement

We already know the guided Headwaters experience can be completed. That does not
answer the more important product question for the root-level pack:

Can an agent that receives only the `agent-pack/` and
one locally staged Headwaters base URL correctly derive the right participation
path and inhabit a live shared space without guided onboarding?

The current dojo harness proves a different thing. It stages a specific tutorial
contract, measures whether agents complete it, and classifies where that
workflow breaks. It does not test:
- quiet-space orientation before any task appears
- whether an agent can infer how to scan and navigate a shared space from the
  pack alone
- whether multiple real agents behave as co-present participants rather than
  isolated singletons
- whether collaboration emerges from posted intents and promises without hidden
  orchestration
- whether the agent can reconstruct the old supported join flow from the pack
  and base URL alone, without receiving support instructions like “use the
  setup doc”, “prefer the Python runtime”, or “post a message in your dedicated
  home space”

So the problem is not merely “add more scenarios to the dojo harness.” It is:

How do we build an honest evaluation loop for live intent-space participation
that preserves intent-space semantics, uses Headwaters as the backend, and
produces comparable evidence about orientation, co-presence, and emergent
collaboration?

## Proposed Solution

Create a new staged evaluation mode that reuses the existing harness strengths
where they still apply, but shifts the substrate from dojo completion to
locally staged Headwaters-backed live-space participation.

Implementation should live in a new root-level `evals/` workspace rather than
inside `academy/`. The existing dojo harness in `academy/` is a source of
reusable mechanics and prior art, not the long-term home for this system.

The evaluation should run in three consecutive stages:

1. **Zero-shot orientation**
   - launch one real agent with only the root-level pack directory and one
     locally staged Headwaters base URL
   - place it in a quiet shared space with no initial work intent
   - verify that it can connect, scan, and navigate correctly before any
     injected work appears
   - then inject a root-level intent and observe reaction quality

2. **Multi-agent coexistence**
   - launch multiple real pack-using agents into the same shared space
   - verify that they notice co-presence through observable space activity
   - score whether they remain isolated or begin to respond to shared context

3. **Collaboration emergence**
   - inject a pre-structured build request into the shared space
   - observe whether specialized agents create useful promises, follow-on
     intents, and dependency-aware handoffs without explicit assignment
   - preserve room to later repeat the same stage with less structured requests

The harness should remain behavior-first. It should not ask agents to explain
intent space in the abstract or reward eloquent self-report. It should decide
based on what they do in the space and record enough evidence to diagnose why a
stage passed or failed.

## Technical Approach

### Architecture

Implement the evaluation as a Headwaters-oriented root-level evaluation system
under `evals/` with four layers. Here “Headwaters” means the backend
infrastructure and shared-space runtime, not the guided experience.

#### Layer 1: Staged Headwaters evaluation substrate

Add a run mode that can stage a repeatable local Headwaters-backed environment
and prepare evaluation cohorts for shared-space participation rather than dojo
completion.

Responsibilities:
- start or attach to a locally controlled Headwaters backend stack
- provision or identify the evaluation space used for each run cohort
- keep the evaluation focused on direct space participation rather than guided
  onboarding contracts
- support delayed root-level intent injection after an initial quiet period

This layer should treat Headwaters as the backend provider and the space itself
as the live evaluation surface.

#### Layer 2: Stage contracts and scoring rubric

Define explicit stage contracts for:
- navigation correctness in a quiet space
- autonomy correctness after work appears
- multi-agent co-presence versus isolation
- collaboration emergence through promise-aware handoff

Each contract should specify:
- what stimuli the harness introduces
- what observable evidence counts as success
- what common failure patterns map to failure
- which evidence is diagnostic only rather than score-defining

The scoring model should remain binary per stage, with richer diagnostics
captured alongside it.

#### Layer 3: Multi-agent orchestration

Extend the launcher model to run multiple real agents against the same live
space and preserve per-agent as well as shared-space timelines.

Responsibilities:
- give each agent only the pack and relevant URL/context for the current stage
- isolate per-agent workspace artifacts while sharing the same live space
- coordinate start windows and delayed event injection without performing
  semantic work for the agents
- detect when one agent's posted promise or follow-on intent should count as a
  meaningful handoff opportunity for another

#### Layer 4: Evidence and reporting

Expand the reporting model from single-run dojo transcripts to stage-oriented
Headwaters evaluation evidence.

Artifacts should include:
- raw transcript per agent
- read-only evidence extracted from the relevant per-space `intent-space.db`,
  especially `messages` and `monitoring_events`
- condensed stage timeline with correlated agent and space events
- stage verdicts
- failure classification across navigation confusion, autonomy confusion,
  isolation, and failed handoff emergence

The report should make it obvious whether behavior emerged from the local pack
directory plus staged service artifacts alone or from anything outside the
intended test surface.

## Implementation Phases

### Phase 1: Define evaluation contracts and scenario ladder

Deliverables:
- a stage rubric document or embedded harness contract for the three stages
- explicit pass/fail rules for navigation correctness, isolation, and
  collaboration emergence
- the initial collaboration seed request for the pre-structured scenario

Tasks:
- define what counts as correct entry, scan, and navigation in the quiet-space
  stage
- define how long the quiet observation window lasts before intent injection
- define what counts as autonomy confusion once a root-level intent appears
- define the evidence threshold for “isolation” versus appropriate restraint in
  multi-agent runs
- define the first collaboration seed so specialization and dependency-aware
  sequencing are observable without over-scripting the work split
- define which later variants will graduate from pre-structured requests to more
  abstract asks

Success criteria:
- planning no longer has to invent stage verdicts later
- the stage contracts are honest about observable evidence rather than inferred
  intent
- the collaboration seed is structured enough to score but not so scripted that
  it becomes a disguised assignment flow

### Phase 2: Add local Headwaters-backed staging and live-space monitoring

Deliverables:
- harness support for staging and controlling a local Headwaters-backed
  environment
- creation or attachment logic for the shared evaluation space
- read-only DB-backed shared-space evidence capture suitable for stage scoring

Tasks:
- create a new root-level `evals/` workspace for this harness rather than
  extending `academy/`
- decide which mechanics to copy or extract from `academy/src/harness.ts`
  without carrying forward dojo-specific assumptions
- add a Headwaters run mode that stages the backend locally and identifies the
  shared space to evaluate
- make the pack contract honest so the agent receives only the local
  `agent-pack/` directory and the staged base URL, with no copied support
  instructions
- add support for delayed root-level intent injection into the evaluation space
- add read-only queries against the relevant per-space `intent-space.db`
  `messages` and `monitoring_events` tables
- ensure DB-backed evidence is tied to the evaluated space and not polluted by
  unrelated station traffic
- keep workspace capture and per-agent transcript capture parity with the
  existing harness

Success criteria:
- one local command can stage a fresh local Headwaters-backed environment and
  run a repeatable evaluation cohort
- the harness can observe the evaluated space with enough fidelity to score the
  three stages using read-only DB evidence plus transcripts
- no guided Headwaters walkthrough logic is reused as the evaluation contract

### Phase 3: Implement zero-shot orientation stage

Deliverables:
- a runnable single-agent evaluation mode for quiet-space orientation
- stage verdicts for navigation correctness and autonomy correctness
- reports that distinguish immediate footing from confused recovery

Tasks:
- define the top-level prompt so the agent gets only the root-level pack
  directory plus the staged local base URL
- require the agent to derive the participation path from that base URL rather
  than from an explicit support prompt
- stage a quiet shared space with no initial work intent
- measure whether the agent enters, scans, and navigates before the delayed
  root-level intent is posted
- inject the root-level intent after the observation window and classify the
  reaction
- classify the run against navigation confusion and autonomy confusion

Success criteria:
- the stage can tell whether the pack teaches “how to inhabit the space” on
  first contact
- the report distinguishes simple mechanical success from confused eventual
  recovery
- the harness produces a clear binary verdict for the first gate

### Phase 4: Implement all-real multi-agent coexistence stage

Deliverables:
- a multi-agent run mode using only real pack-using agents
- isolation classification backed by shared-space evidence
- timelines that show what each agent saw and how it responded

Tasks:
- launch multiple real agents into the same evaluation space
- align start timing closely enough that co-presence is observable
- record which intents, promises, and follow-on activity each agent had a fair
  opportunity to see
- derive shared-space visibility and timing primarily from read-only DB evidence
  rather than transcript inference alone
- score whether agents remain isolated or begin to behave as co-present
  participants
- preserve evidence for cases where no action was appropriate so restraint is
  not mislabeled as isolation

Success criteria:
- the harness can answer whether agents act like they are alone in the same
  space
- failure diagnosis distinguishes ignorance of co-presence from legitimate
  voluntary non-participation
- the stage produces a crisp binary verdict plus supporting evidence

### Phase 5: Implement collaboration-emergence stage and progression ladder

Deliverables:
- a collaboration stage using a pre-structured build request
- scoring for emergent handoff through promises and follow-on intents
- plan-ready hooks for later bounded and abstract request variants

Tasks:
- inject the pre-structured build request into the shared root space
- observe whether specialized agents volunteer different slices based on their
  own competence boundaries
- classify whether later activity reflects dependency-aware sequencing, for
  example frontend work waiting on a backend promise or follow-on artifact
- define the minimum observable sequence that counts as meaningful handoff
- add report sections that call out whether collaboration truly emerged from
  space artifacts
- define but do not necessarily implement the next two variants:
  bounded product request and abstract build request

Success criteria:
- the first collaboration stage can tell whether useful cooperation emerges from
  shared intents and promises
- reports clearly separate parallel unrelated action from actual handoff
- the design is ready to expand toward less structured prompts without rewriting
  the harness model

### Phase 6: Documentation, runbook, and evaluation loop adoption

Deliverables:
- runbook for the new Headwaters evaluation flow
- updated interpretation guidance for pack iteration
- artifact layout and reporting docs

Tasks:
- document how to run the Headwaters-backed evaluation locally
- document how to read stage verdicts and failure classes
- explain when to use the dojo harness versus the Headwaters agent-pack
  evaluation harness
- capture the expected iteration loop for improving `agent-pack/` from observed
  failures

Success criteria:
- the repo has a clear operator path for rerunning the evaluation after pack
  changes
- teams can compare changes in failure patterns over time without reinterpreting
  the scoring model on each run

## Alternative Approaches Considered

### 1. Keep extending the dojo harness without a separate stage model

Rejected because dojo completion and quiet shared-space orientation answer
different product questions. Folding both into one implicit flow would blur the
unit under test and inherit guided assumptions that this evaluation is supposed
to avoid.

### 2. Use scripted agents as the other participants in multi-agent runs

Rejected for the main line because the question is whether collaboration and
co-presence emerge among real pack-using agents. Scripted participants are still
useful as a future control tool, but they should not define the primary verdict.

### 3. Start immediately with abstract build requests

Rejected because the first iteration needs an easier collaboration seed that
makes specialization and dependency visible enough to score honestly. The ladder
should move toward abstraction after the structured case works.

### 4. Judge success through agent interviews or comprehension prompts

Rejected because the pack is supposed to improve live behavior in the space, not
perform well on abstract explanation tests.

## System-Wide Impact

### Interaction Graph

Current dojo harness:
- stage academy + station + tutor
- launch one agent with a top-level dojo instruction
- observe tutorial-specific transcript and completion state
- classify where the dojo broke

Planned Headwaters evaluation:
- live under a new root-level `evals/` workspace
- stage a local Headwaters-backed backend environment
- launch one or more real agents with only the root-level pack directory and
  staged base URL
- observe quiet-space entry and scanning behavior
- inject root-level intent stimuli at defined moments
- correlate per-agent behavior with shared-space DB records and transcripts
- score orientation, co-presence, and collaboration emergence

This shifts the evaluation center:
- from tutorial completion
- to live shared-space participation

This also shifts the implementation home:
- from `academy/`
- to a future-proof root-level evaluation workspace

### Error & Failure Propagation

New primary failure classes:
- navigation confusion in a quiet space
- autonomy confusion after intent appearance
- multi-agent isolation
- failed collaboration emergence despite visible handoff opportunities

Plan implications:
- the harness must record enough context to justify those classifications
- reports must distinguish failure to observe from voluntary refusal to act
- the delayed-intent mechanism must be explicit and reproducible
- shared-space DB reads must remain scoped so verdicts are not distorted by
  unrelated traffic

## Verification Strategy

- Run a smoke pass with one supported real agent through the orientation stage
  only and verify artifact completeness.
- Run a repeated single-agent matrix to validate that navigation and autonomy
  scoring are stable across trials.
- Run at least one multi-agent shared-space cohort and confirm isolation
  classification against raw logs.
- Run the first pre-structured collaboration scenario and manually inspect at
  least one pass and one fail case to ensure the binary verdict matches observed
  behavior.
- Compare results after one intentional pack wording change to confirm the
  evaluation is sensitive enough to detect changed behavior patterns.

## Risks and Mitigations

- **Risk: isolation is confused with legitimate restraint**
  Mitigation: define “fair opportunity to notice and respond” explicitly in the
  stage contract and preserve agent-visible evidence in the timeline.

- **Risk: collaboration scoring rewards chatter rather than real dependency**
  Mitigation: require promise or follow-on-intent evidence that another agent
  actually used or responded to.

- **Risk: harness reuse drags dojo assumptions into the new evaluation**
  Mitigation: keep the Headwaters evaluation stage model separate from tutorial
  stage names and completion contracts, and keep the implementation outside
  `academy/`.

- **Risk: the staged environment accidentally reintroduces the guided Headwaters
  experience**
  Mitigation: use Headwaters only as backend infrastructure and explicitly keep
  the guided walkthrough out of the evaluation contract.

- **Risk: unrelated station traffic contaminates stage scoring**
  Mitigation: scope monitoring to the evaluated shared space and preserve run
  identifiers in artifacts.

- **Risk: all-real multi-agent runs are noisy and expensive**
  Mitigation: keep the first ladder small, reuse artifact capture aggressively,
  and reserve scripted participants only for later control experiments.

## Promise-Native Architecture Check

- **Autonomous participants**
- real external agents using `agent-pack/`
- the locally staged Headwaters backend service as space host and backend
  provider
- any Headwaters steward participant already required by the backend runtime
- the evaluation harness as an observer, launcher, stimulus injector, and
  read-only DB scorer only

- **Promises about self**
- evaluated agents promise only their own work
- the harness does not promise on behalf of agents or assign work through
  hidden orchestration
- collaboration scoring depends on agents making their own visible commitments

- **State authority**
- verdict authority lives in harness artifacts and scoring output
- promise lifecycle authority remains with the agents' own local/runtime state
  and whatever promise authority model the participating pack/runtime already
  uses
- shared-space events are observational evidence for evaluation, not the place
  where truth is newly centralized
- read-only access to `intent-space.db` is an operator evidence path, not a new
  control plane

- **Promise lifecycle**
- the evaluation primarily observes `INTENT` and `PROMISE` activity in the
  space
- `ACCEPT`, `COMPLETE`, and `ASSESS` are only required where a specific
  collaboration scenario or downstream work slice claims fulfillment quality
  matters
- the plan does not force a full lifecycle everywhere just to satisfy the
  harness; it should observe the honest lifecycle needed by each staged case

- **Intent-space purity**
- the harness measures how agents use the space; it does not turn the space
  into an imperative task runner
- Headwaters remains the backend infrastructure, but the semantic center of the
  evaluation is still live ITP participation in a shared space
- the guided Headwaters experience is not part of the evaluation contract

- **Visibility / containment**
- evaluation stimuli are posted in the shared root space by design
- shared-space DB records are captured for evaluation evidence
- per-agent local workspaces remain private artifacts
- if later collaboration cases require narrower subspaces, visibility rules
  must be stated explicitly rather than inferred

- **Rejected shortcut**
- rejected using a scripted coordinator that tells agents which slice to take
  after the seed request, because that would fake collaboration instead of
  testing emergence from observed intents and promises

## Promise-Native Plan Review

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and
  `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination
  artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Blocked red flags review:
- [x] Embedded callbacks do not replace real participants
- [x] “Promise-native” is not claimed with a hidden lifecycle shortcut
- [x] `ASSESS` is addressed where fulfillment quality matters
- [x] State authority does not drift into the intent space
- [x] Auth or transport semantics do not displace native ITP semantics
- [x] The design does not rely on a mandatory relay without explicit
  justification
- [x] Sensitive fulfillment details have a visibility model
