---
title: feat: Create root-level intent-space agent pack
type: feat
status: active
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md
---

# feat: Create root-level intent-space agent pack

## Overview

Create a new root-level `agent-pack/` that becomes the canonical agent entry
point for intent-space participation. The pack should work for external agents
with no repo context, preserve agent autonomy, teach the fractal spatial model
clearly, and reuse the current academy Python mechanics surface as the starting
runtime layer (see origin:
`docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md`).

This is a docs-and-skill-first extraction, not a runtime redesign. The first
iteration should establish the canonical pack shape and content while keeping
protocol mechanics stable.

## Problem Statement / Motivation

The current agent-facing pack lives in `academy/skill-pack/`, but that surface
is academy-specific and dojo-specific. It teaches live station enrollment and
tutorial completion rather than intent space as a general substrate.

That causes three planning problems:

1. external agents are introduced to a special case before the general model
2. the canonical pack over-prescribes a workflow that should remain elective
3. the repo lacks one obvious, durable entry point for "what intent space is"
   and "how an autonomous agent can participate competently"

The brainstorm resolved the target state clearly:

- the canonical pack should live at repo root in `agent-pack/`
- it should be designed for external agents first
- it should preserve autonomy by distinguishing invariants from suggestions
- it should teach the fractal model explicitly, including that each intent is a
  space and spaces can nest indefinitely
- it should reuse the existing academy SDK/runtime initially rather than turn
  this into a runtime project (see origin:
  `docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md`)

## Proposed Solution

Create a new root-level `agent-pack/` with the same high-level structure as the
current academy pack:

- `agent-pack/SKILL.md`
- `agent-pack/references/`
- `agent-pack/sdk/`

Use a copy-first extraction strategy for mechanics:

- copy `academy/skill-pack/sdk/promise_runtime.py` into `agent-pack/sdk/`
- copy `academy/skill-pack/sdk/intent_space_sdk.py` into `agent-pack/sdk/`
- keep academy runtime files stable in this first iteration unless a minimal
  path adjustment is required

Rewrite the markdown/docs around that mechanics surface so they teach
intent-space participation generally rather than academy onboarding
specifically.

The canonical content set should be:

- `agent-pack/SKILL.md`
  - minimal orientation
  - reading order
  - protocol invariants
  - autonomy guardrails
  - runtime vs SDK boundary
- `agent-pack/references/QUICKSTART.md`
  - shortest legitimate path for a new external agent
  - how to understand the model quickly without a scripted workflow
- `agent-pack/references/SPACE_MODEL.md`
  - what intent space is
  - body of desire vs body of commitment
  - fractal containment
  - self-selection and non-assignment
  - what the space does not do
- `agent-pack/references/FORMS.md`
  - generic connection, scan, post, and subspace forms
  - optional station-auth notes only when they are truly generic to a live
    station profile
- `agent-pack/references/MICRO_EXAMPLES.md`
  - seam-level examples for connecting, scanning, posting, entering child
    spaces, creating nested spaces, and optionally interacting with projected
    promise events
- `agent-pack/references/REFERENCE.md`
  - rationale, runtime boundary, common mistakes, impossible actions, and when
    to drop lower to the SDK

Then update top-level repo docs so `agent-pack/` is the primary agent-facing
surface and academy is treated as a station-specific consumer rather than the
canonical source.

## Technical Approach

### Architecture

This is primarily a packaging and documentation refactor with light mechanics
reuse.

The plan should preserve three layers explicitly:

1. `intent-space/` remains the generic observational substrate
2. `agent-pack/` becomes the canonical agent-facing learning and mechanics
   surface
3. `academy/` remains a station-specific or transitional consumer

This follows the already-established repo stance:

- the intent space is observational and containment-oriented
- promise authority remains local
- projected promise events inside spaces are observational only
- the runtime should feel like a protocol shell, not a solved workflow engine

### Implementation Phases

#### Phase 1: Establish `agent-pack/` Skeleton

Deliverables:

- create `agent-pack/`
- create `agent-pack/references/`
- create `agent-pack/sdk/`
- copy the current Python runtime and lower-level SDK into `agent-pack/sdk/`
- create placeholder or draft files for the new canonical docs

Success criteria:

- the root-level canonical directory exists
- pack structure matches the agreed academy-style layout
- the mechanics surface is present in `agent-pack/sdk/`

#### Phase 2: Rewrite The Canonical Orientation Surface

Deliverables:

- author `agent-pack/SKILL.md`
- author `agent-pack/references/QUICKSTART.md`
- author `agent-pack/references/SPACE_MODEL.md`
- rewrite `agent-pack/references/REFERENCE.md`

Content requirements:

- external-agent-first framing
- explicit explanation of the fractal model
- explicit explanation that agents are free to observe, engage, decline, or
  ignore
- explicit distinction between invariants and suggestions
- explicit explanation of runtime vs SDK boundary

Success criteria:

- a cold external agent can understand what intent space is from the pack alone
- the docs no longer depend on academy/dojo framing for conceptual clarity

#### Phase 3: Rewrite Exact Forms And Seam Examples For General Participation

Deliverables:

- rewrite `agent-pack/references/FORMS.md`
- rewrite `agent-pack/references/MICRO_EXAMPLES.md`

Content requirements:

- show generic `scan`, `post`, and child-space entry patterns
- show nested-space examples that make the fractal property concrete
- show optional promise-related interaction without implying obligation
- call out impossible or unsupported actions clearly
- avoid tutorial-specific solved sequences

Success criteria:

- examples are useful for general participation, not only academy ritual flows
- forms and examples reduce protocol mistakes for external agents

#### Phase 4: Reposition Existing Repo Docs Around The New Canonical Pack

Deliverables:

- update `README.md` if needed to mention `agent-pack/`
- update `intent-space/README.md` to point to `agent-pack/` as the canonical
  agent pack
- update `intent-space/INTENT-SPACE.md` references if they currently point into
  `academy/`
- update `academy/README.md` to frame academy as a consumer or station-specific
  layer rather than the canonical pack
- update `academy/agent-setup.md` only as needed to avoid contradicting the new
  canonical pack

Success criteria:

- repo entry points no longer imply that academy owns the general pack
- agent-facing references point to the new root-level canonical surface

#### Phase 5: Compatibility And Consumer Follow-Through

Deliverables:

- decide whether academy continues to keep a local `skill-pack/` copy, links to
  `agent-pack/`, or consumes shared files indirectly
- update any obvious hardcoded references that should now mention `agent-pack/`
  for canonical documentation
- leave dojo-specific consumer behavior intact unless a targeted compatibility
  update is required

Success criteria:

- canonical path is clear without breaking the current academy workflows
- no unnecessary runtime redesign is introduced

## Alternative Approaches Considered

### 1. Keep `academy/skill-pack/` as the canonical pack

Rejected because the brainstorm decided academy is transitional and the pack
must teach intent space generally rather than dojo-first behavior (see origin:
`docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md`).

### 2. Extract a root-level pack and redesign the runtime at the same time

Rejected for the first iteration because the origin document explicitly scoped
this work to prompt/docs/skill improvements before runtime experimentation
(see origin:
`docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md`).

### 3. Publish only a conceptual doc set without a runtime/SDK surface

Rejected because the repo’s recent learnings show prose-only onboarding is too
weak and that agents are more comfortable when docs point to a thin,
inspectable Python mechanics surface.

## System-Wide Impact

### Interaction Graph

This change mostly affects the documentation and onboarding graph:

- external agent entry point shifts from `academy/skill-pack/` to
  `agent-pack/`
- `intent-space/README.md` and related docs should point to `agent-pack/`
- academy documentation should acknowledge `agent-pack/` as canonical
- the SDK/runtime mechanics remain stable, reducing behavioral risk

No protocol-layer changes are planned in `intent-space/src/`.

### Error & Failure Propagation

Primary risk is documentation drift, not runtime failure:

- if copied runtime files drift immediately from academy’s versions, the pack
  may teach APIs that differ from the active consumer
- if generic docs accidentally retain academy-specific invariants, external
  agents may infer unsupported behaviors
- if generic docs omit true wire constraints, protocol mistakes will persist

Mitigation:

- keep first-iteration runtime changes minimal
- review copied docs for academy-specific language aggressively
- align examples to the actual Python runtime API

### State Lifecycle Risks

There is little persistent state risk because this is not a behavior change in
the station. The main lifecycle risk is around duplicated runtime files:

- `academy/skill-pack/sdk/*.py`
- `agent-pack/sdk/*.py`

If both evolve independently without a plan, docs and consumers can drift.

Mitigation:

- keep the first extraction explicit and documented as copy-first
- note follow-up deduplication or shared-source options in future work rather
  than forcing them into this plan

### API Surface Parity

The canonical agent-facing surface must stay coherent across:

- `agent-pack/SKILL.md`
- `agent-pack/references/*.md`
- `agent-pack/sdk/promise_runtime.py`
- `agent-pack/sdk/intent_space_sdk.py`
- any repo docs that recommend a reading order

Current academy docs and harness docs should be updated where they speak about
the canonical pack, but dojo-specific mechanics can remain academy-specific.

### Integration Test Scenarios

Cross-layer scenarios worth validating after implementation:

1. A cold external agent can follow `agent-pack/SKILL.md` and understand the
   general participation model without reading academy docs.
2. The pack’s examples and forms match the copied runtime/SDK surface exactly.
3. `intent-space/README.md` links point to `agent-pack/` cleanly and do not
   dead-end in academy-specific instructions.
4. Academy docs still make sense as a station-specific layer after the new
   canonical pack lands.

## Acceptance Criteria

### Functional Requirements

- [ ] `agent-pack/` exists at the repo root with `SKILL.md`, `references/`, and
      `sdk/`.
- [ ] `agent-pack/sdk/promise_runtime.py` exists as the initial copied
      mechanics surface from academy.
- [ ] `agent-pack/sdk/intent_space_sdk.py` exists as the initial copied
      lower-level SDK from academy.
- [ ] `agent-pack/SKILL.md` teaches intent space for an external agent with no
      repo context.
- [ ] `agent-pack/references/SPACE_MODEL.md` explains the fractal spatial model
      and the desire-vs-commitment distinction.
- [ ] `agent-pack/references/QUICKSTART.md` provides a concise orientation path
      without turning into a solved workflow.
- [ ] `agent-pack/references/FORMS.md` documents the generic forms an agent
      needs for intent-space participation.
- [ ] `agent-pack/references/MICRO_EXAMPLES.md` includes seam-level examples for
      scanning spaces, posting intents, entering child spaces, and creating
      nested spaces.
- [ ] `agent-pack/references/REFERENCE.md` explains runtime boundary, autonomy
      expectations, common mistakes, and unsupported expectations.
- [ ] The docs make clear that agents may observe, engage, decline, or ignore
      intents based on their own judgment.
- [ ] The docs distinguish protocol invariants from optional strategies or
      examples.
- [ ] Top-level references in repo docs point to `agent-pack/` as the canonical
      pack.

### Non-Functional Requirements

- [ ] No runtime redesign is required to ship the first iteration.
- [ ] The pack remains autonomy-preserving and avoids workflow-engine framing.
- [ ] Examples stay close to the real runtime/SDK API and do not promise
      impossible behaviors.

### Quality Gates

- [ ] All new markdown is internally consistent about the intent-space model.
- [ ] File references in existing docs that should become canonical are updated.
- [ ] The copied Python files compile or at minimum remain bytecode-valid after
      path adjustments, if any are needed.

## Success Metrics

- The repo has one obvious canonical agent entry point: `agent-pack/`.
- A reviewer can read the pack without academy context and explain:
  - what intent space is
  - how spaces nest
  - how to observe and post
  - why agents are not assigned work by the system
- The pack removes dojo-specific language from the canonical conceptual path.
- The pack reduces the chance that an external agent assumes impossible
  environment features such as routing, assignment, or centralized workflow
  control.

## Dependencies & Prerequisites

- Existing academy mechanics files remain a valid starting point:
  - `academy/skill-pack/sdk/promise_runtime.py`
  - `academy/skill-pack/sdk/intent_space_sdk.py`
- Existing conceptual source material remains relevant:
  - `intent-space/README.md`
  - `intent-space/INTENT-SPACE.md`
  - `docs/solutions/integration-issues/intent-space-promise-theory-participant.md`
  - `docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md`
- The origin requirements doc remains the authoritative product-definition
  source:
  - `docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md`
- Implementation should not be carried out on `main`; do the work on a new
  branch named `agent-pack`.

## Risk Analysis & Mitigation

- **Risk:** The new pack remains too academy-shaped.
  - **Mitigation:** add a dedicated conceptual document (`SPACE_MODEL.md`) and
    review every doc for dojo/tutorial assumptions.
- **Risk:** Documentation implies behavioral policy and undermines autonomy.
  - **Mitigation:** separate invariants, examples, and optional practices
    explicitly in each doc.
- **Risk:** Copied runtime files drift from academy quickly.
  - **Mitigation:** keep copy-first as an explicit short-term decision and avoid
    runtime edits unless necessary in this iteration.
- **Risk:** Generic `FORMS.md` becomes too abstract to be operational.
  - **Mitigation:** anchor the forms to the actual runtime/SDK and pair them
    with seam-level micro examples.
- **Risk:** Repo docs continue pointing agents into academy by habit.
  - **Mitigation:** include documentation entry-point updates as a first-class
    phase, not cleanup.

## Future Considerations

- Later prompt-surface A/B testing can compare minimal orientation vs more
  guided orientation without changing the runtime.
- A future runtime-focused follow-up can deduplicate `academy/skill-pack/sdk/`
  and `agent-pack/sdk/` or establish a shared source of truth.
- If academy is later deprecated fully, its remaining onboarding docs can
  shrink to station-specific deployment and consumer notes.

## Documentation Plan

Files expected to be created:

- `agent-pack/SKILL.md`
- `agent-pack/references/QUICKSTART.md`
- `agent-pack/references/SPACE_MODEL.md`
- `agent-pack/references/FORMS.md`
- `agent-pack/references/MICRO_EXAMPLES.md`
- `agent-pack/references/REFERENCE.md`
- `agent-pack/sdk/promise_runtime.py`
- `agent-pack/sdk/intent_space_sdk.py`

Files likely to be updated:

- `README.md`
- `intent-space/README.md`
- `intent-space/INTENT-SPACE.md`
- `academy/README.md`
- `academy/agent-setup.md`
- any docs that currently point to `academy/skill-pack/` as the canonical pack

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/brainstorms/2026-03-23-global-intent-space-agent-pack-requirements.md)
  - Key decisions carried forward:
    - root-level canonical pack in `agent-pack/`
    - external-agent-first framing
    - docs/prompt-first scope before runtime experimentation
    - academy-style structure with rewritten general docs
    - autonomy-preserving guidance and explicit fractal-model teaching

### Internal References

- [academy/skill-pack/SKILL.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/SKILL.md)
- [academy/skill-pack/references/QUICKSTART.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/references/QUICKSTART.md)
- [academy/skill-pack/references/REFERENCE.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/references/REFERENCE.md)
- [academy/skill-pack/references/FORMS.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/references/FORMS.md)
- [academy/skill-pack/references/MICRO_EXAMPLES.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/references/MICRO_EXAMPLES.md)
- [academy/skill-pack/sdk/promise_runtime.py](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- [academy/skill-pack/sdk/intent_space_sdk.py](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/academy/skill-pack/sdk/intent_space_sdk.py)
- [intent-space/README.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/intent-space/README.md)
- [intent-space/INTENT-SPACE.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/intent-space/INTENT-SPACE.md)
- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)

### Institutional Learnings

- [docs/solutions/integration-issues/python-pack-runtime-matched-agent-preferences-better-than-ts-wrapper-20260317.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/solutions/integration-issues/python-pack-runtime-matched-agent-preferences-better-than-ts-wrapper-20260317.md)
- [docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
- [docs/solutions/integration-issues/intent-space-promise-theory-participant.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/solutions/integration-issues/intent-space-promise-theory-participant.md)
- [docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- [docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/julestalbourdet/Documents/Sky\ Valley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
