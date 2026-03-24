---
title: feat: Promise-native planning guardrails
type: feat
status: completed
date: 2026-03-24
---

# feat: Promise-native planning guardrails

## Overview

`big-d` should stop relying on ad hoc user steering to keep plans promise-native. The repo needs a local planning guardrail layer that survives upstream `ce` updates and consistently pulls planners back toward Promise Theory, intent-space purity, and honest promise lifecycle modeling.

The clean move is not to fork upstream `ce`. It is to add repo-owned guardrails around it:

- a short canonical architecture/guardrails doc in the repo
- repo instructions that force planners to read and apply that doc
- a repo-local planning wrapper/workflow for `big-d`
- a review/checklist path that catches architectural drift before implementation

This keeps the policy local and durable while leaving the upstream workflow intact.

## Problem Statement / Motivation

The current workflow has a recurring failure mode:

- brainstorm often captures the product idea
- `ce:plan` translates that into implementable phases
- unless the user explicitly restates the architectural stance, plans drift toward imperative service design
- promise-native concerns become optional flavor instead of first-class constraints

That drift has already shown up locally:

- Headwaters initially used an embedded callback instead of a real steward participant
- provisioning initially skipped the real promise lifecycle
- Welcome Mat adoption had to be explicitly protected from colonizing the ITP wire with HTTP-shaped semantics

Recent Promise Theory sources reinforce the same architectural criteria:

- autonomy matters; agents promise about themselves rather than commanding others
- assessability matters; fulfillment must be visible and evaluable
- weak coupling matters more than central orchestration
- semantic boundaries matter; transport or management layers should not erase the native model of the system

The repo already knows these things. The problem is that the planning workflow does not reliably force them to the surface.

## Proposed Solution

Create a repo-local planning layer with four parts:

1. **Canonical promise-native planning guardrails doc**
   A short, opinionated architecture note that states the non-negotiable planning checks for this repo.

2. **Instructional enforcement in repo agent docs**
   Root and subproject instructions should explicitly tell planners and implementers to read and apply the guardrails when work touches intent-space, promise lifecycles, agents, stewards, or managed coordination.

3. **Repo-local `big-d:plan` wrapper/workflow**
   A local planning entrypoint should sit on top of `ce:plan` and require a promise-native pressure test before the plan is considered complete.

4. **Plan quality gate**
   A repeatable checklist should make architectural drift visible even when a generic upstream planner is used directly.

## Technical Considerations

- **Do not patch upstream `ce`.**
  Upstream is external and periodically updated. Local policy should wrap it, not fork it.
- **Assume repo-local workflow discovery may be imperfect.**
  The enforcement must still work through `AGENTS.md` + canonical docs even if a teammate’s local CLI does not auto-discover repo-local commands.
- **Keep the guardrails short and sharp.**
  This should be a forcing function, not another essay nobody reads.
- **Separate product requirements from architectural constraints.**
  Brainstorms should capture what must happen; the local planning layer should force how it must remain promise-native.
- **Prefer reviewable heuristics over vague philosophy.**
  Every planning check should be easy to apply to a concrete plan.

## System-Wide Impact

- **Workflow surface**
  The repo will gain a local planning path in addition to raw `ce:plan`.

- **Documentation surface**
  Root repo docs and relevant subproject docs will start explicitly naming promise-native planning constraints as planning inputs, not only as post-hoc architecture notes.

- **Team coordination**
  Teammates who clone the repo will get the source-of-truth planning rules from the repo itself, even if they do not share the same personal skill installation.

- **Plan quality**
  Plans for intent-space, academy, headwaters, and loop work should more reliably preserve:
  - autonomy
  - promise lifecycle honesty
  - intent-space purity
  - observational/state-authority separation
  - visible assessment boundaries

## Implementation Phases

### Phase 1: Canonical Guardrails Doc

Goal: define the repo’s promise-native planning rules in one short document.

Tasks:

- Add a durable doc such as `docs/architecture/promise-native-planning-guardrails.md`
- Distill the minimum planning checks from local learnings and Promise Theory sources
- Make the checks explicit and operational rather than philosophical
- Include concrete anti-patterns already seen in this repo

The doc should cover at least:

- promises are about self, not commands about others
- real participants should own social acts on the wire
- intent-space remains observational / containment-oriented
- state authority must not silently drift into the space
- successful flows should model the real promise lifecycle when the product claims they are promise-native
- `ASSESS` matters when fulfillment quality is part of the product
- management/auth layers must not erase the native semantics of ITP
- hidden callbacks, relays, or orchestration shortcuts are suspect and require explicit justification

Success criteria:

- The guardrails doc is short enough to be read before planning
- It contains concrete checks, not only theory
- It references both local learnings and upstream Promise Theory sources

### Phase 2: Repo Instruction Wiring

Goal: make the guardrails discoverable through the repo’s existing agent instructions.

Tasks:

- Update root `AGENTS.md` to point to the new guardrails doc
- Update relevant `CLAUDE.md` files for:
  - `intent-space/`
  - `academy/`
  - `headwaters/`
  - `loop/`
- Tell planners when the guardrails are mandatory vs merely relevant
- Add one concise rule for contributors: use the local planning path for promise-native / intent-space work

Success criteria:

- A planner entering the repo sees the guardrails through normal repo instructions
- The guidance is specific enough to change behavior, not just “be architecture-aware”

### Phase 3: Repo-Local Planning Wrapper

Goal: create a repo-owned planning entrypoint that operationalizes the guardrails without forking upstream `ce`.

Tasks:

- Add a repo-local workflow/skill/command for planning, e.g. `big-d:plan`
- Design it so the repo remains usable even if auto-discovery of repo-local commands varies by environment
- Require the wrapper to:
  - read the canonical guardrails doc
  - read relevant local learnings
  - produce a dedicated “Promise-Native Architecture Check” section in plans
  - explicitly evaluate alternatives that would violate the stance
- Define the fallback behavior when a teammate uses raw `ce:plan` anyway

The architecture check should answer at least:

- Who are the autonomous participants?
- Which promises are about self vs hidden control over others?
- Where is state authority?
- Is the promise lifecycle modeled honestly?
- Does the design preserve intent-space purity?
- Are auth/control layers complementing the protocol or colonizing it?
- What implementation shortcut was rejected because it violated the stance?

Success criteria:

- The wrapper adds concrete value beyond generic `ce:plan`
- It still composes with future upstream `ce` updates
- Teammates can use the repo-local workflow or at minimum follow the same checklist from the repo docs

### Phase 4: Plan Review Gate

Goal: make promise-native drift visible even if planning starts from a generic workflow.

Tasks:

- Create a concise plan review checklist or review command for promise-native architecture
- Make it usable against both new and existing plans
- Define when the gate is mandatory:
  - intent-space protocol work
  - academy / dojo / tutor workflows
  - headwaters / managed-space control planes
  - loop / local promise authority work
- Include red flags that should block or revise a plan

Likely red flags:

- embedded callbacks replacing real participants
- “promise-native” product claims without the real lifecycle
- state authority drifting into the space
- central relays hiding direct participation
- auth or transport concerns replacing native ITP semantics
- plans that never say who performs `ASSESS`, or whether assessment matters

Success criteria:

- A reviewer can apply the gate quickly to a plan
- The gate would have caught the earlier Headwaters steward shortcut

### Phase 5: Validation On Real Planning Paths

Goal: prove the guardrails affect actual planning behavior rather than only adding docs.

Tasks:

- Re-run the local planning flow on a recent relevant topic and compare outputs
- Validate that the local wrapper and/or checklist surfaces promise-native concerns without user steering
- Check that teammates who only read the repo docs still get the intended behavior
- Capture one compound note if the new planning path changes plan quality materially

Validation targets:

- a fresh plan touching intent-space or Headwaters
- a planner entering through root `AGENTS.md`
- a planner using the repo-local wrapper if available

Acceptance gate:

- The work is not done until at least one real planning run produces an explicit promise-native architecture section without the user having to manually force it in the prompt.

## Alternative Approaches Considered

### 1. Patch upstream `ce:plan`

Rejected because `ce` is externally owned and updated independently. A local fork would drift and create maintenance smell.

### 2. Rely only on stronger brainstorms

Rejected because the repo already shows that good product requirements do not automatically produce promise-native implementation plans. The architectural stance needs its own planning guardrail.

### 3. Only add a docs note in `AGENTS.md`

Rejected because passive documentation alone is too weak. The repo needs an executable or reviewable planning path, not only a reminder.

## Acceptance Criteria

- [x] A canonical repo doc defines promise-native planning guardrails in short, operational terms
- [x] Root and relevant subproject instruction files point planners to that doc
- [x] The repo has a local planning wrapper or equivalent workflow for promise-native work
- [x] Plans produced through the local path include a dedicated promise-native architecture check
- [x] There is a concise review gate/checklist for validating plans against autonomy, lifecycle honesty, and intent-space purity
- [x] The approach works even if upstream `ce` changes and even if repo-local workflow auto-discovery is inconsistent
- [x] At least one real planning run demonstrates the new guardrails without user hand-holding

## Success Metrics

- Fewer plans require the user to manually re-steer them toward autonomy, honest promise chains, and intent-space purity
- Plans more often name the real participants, state authority, and assessment boundary explicitly
- Reviewers can identify architectural drift early from the plan alone
- Teammates who clone the repo inherit the planning stance from the repo itself

## Dependencies & Risks

### Dependencies

- Root repo instructions:
  - [AGENTS.md](/Users/noam/work/skyvalley/big-d/AGENTS.md)
- Subproject instructions:
  - [intent-space/CLAUDE.md](/Users/noam/work/skyvalley/big-d/intent-space/CLAUDE.md)
  - [academy/CLAUDE.md](/Users/noam/work/skyvalley/big-d/academy/CLAUDE.md)
  - [headwaters/CLAUDE.md](/Users/noam/work/skyvalley/big-d/headwaters/CLAUDE.md)
  - [loop/CLAUDE.md](/Users/noam/work/skyvalley/big-d/loop/CLAUDE.md)
- Relevant local learnings:
  - [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  - [headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
  - [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)

### Risks

- The guardrails could become too abstract and fail to change planning behavior
- A repo-local wrapper could be ignored if discovery is weak or instructions are vague
- Over-constraining plans could make legitimate non-promise-native work awkward to plan
- If the checklist is too long, people will stop applying it

## Sources & References

- Local repo instructions:
  - [AGENTS.md](/Users/noam/work/skyvalley/big-d/AGENTS.md)
- Local learnings:
  - [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  - [headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
  - [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
- Promise Theory sources:
  - [Promise Theory FAQ](https://markburgess.org/promiseFAQ.html)
  - [Book of Promises](https://markburgess.org/BookOfPromises.pdf)
  - [Architecture and Security](https://markburgess.org/archive/manuals/st-security)
  - [Structure and criteria for service assessment in promise theory](https://markburgess.org/blog_virtual.html)
