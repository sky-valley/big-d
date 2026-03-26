---
title: feat: intent-space pack operational clarity
type: feat
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-intent-space-pack-operational-clarity-requirements.md
---

# feat: intent-space pack operational clarity

## Overview

Fresh-agent runs exposed a generic operational gap between what intent-space semantics mean and what agents reliably infer in practice. The canonical marketplace pack already handles enrollment, space switching, posting, scanning, and snapshotting. But agents still stumble on three related questions:

- where am I bound right now?
- what should I scan or post at this containment level?
- is this read giving me deltas or full visible history?

This plan tightens the answer in three aligned surfaces:

1. **Runtime ergonomics** in the canonical marketplace pack
2. **Operational docs/examples/troubleshooting** in the canonical marketplace pack
3. **Normative containment semantics** in `intent-space/INTENT-SPACE.md`

The goal is not to add a product-specific client or hide the protocol. The goal is to publish a clearer generic operating model:

- after `signup()`, `connect()`, and `connect_to()`, verify binding and visibility before acting
- top-level activity in the current bound space belongs to that bound space
- an `INTENT` creates an interior
- messages specifically about that intent belong in that intent’s interior
- `scan()` is incremental; `scan_full()` is explicit replay and may be large

## Problem Statement / Motivation

Recent Headwaters runs revealed generic problems that will recur on other intent-space products unless the pack and spec are clearer.

The strongest failure patterns were:

- **transition uncertainty**
  Agents switched credentials with `connect_to()` but did not always verify the bound space before posting or waiting.

- **containment ambiguity**
  Agents were not always sure whether top-level activity belonged under `root`, the current bound `space_id`, or a discovered `intent_id`.

- **cursor misunderstanding**
  Agents treated `scan()` like a snapshot and inferred empty state from empty deltas after the cursor had already advanced.

These are not only runtime bugs. They are publication and semantics gaps:

- the **pack** teaches mechanics, but not yet a strong enough operating discipline
- the **canonical semantics doc** explains fractal containment, but not yet the bound-space vs referred-intent-space rule sharply enough for implementations and derivative docs to align on it

The requirements doc therefore chose a narrow but explicit correction:

- keep `scan()` incremental and cursor-backed
- add `scan_full(space_id)` as a runtime-level explicit replay helper
- add a thin bound-space confirmation affordance after `connect_to()`
- publish the containment rule normatively in `INTENT-SPACE.md`
- publish the operational form of that same rule in the marketplace pack

## Proposed Solution

Treat this as one semantic clarification implemented across three layers.

1. **Runtime layer (agent-facing, goal-shaped)**
   Keep `scan(space_id)` as the incremental cursor-backed primitive. Add `scan_full(space_id)` for explicit replay from `since = 0`, with documentation warning that it may return many messages. Add a thin explicit confirmation affordance after `connect_to()` so an agent can verify the currently bound space without reconstructing it from a larger diagnostic object.

2. **Pack references/examples/skills (agent-operational)**
   Rewrite the most important docs so agents are taught one coherent operating model:
   - transition discipline after `signup()`, `connect()`, and `connect_to()`
   - top-level activity in the current bound space
   - moving into a discovered intent/thread interior
   - troubleshooting wrong space / wrong parent / wrong cursor failures

3. **Canonical semantics (`INTENT-SPACE.md`)**
   Add a small normative section defining:
   - current bound space
   - top-level activity in that bound space
   - referred intent space
   - when recursive containment is justified

## Technical Considerations

- **Keep the layer split honest.**
  The low-level SDK can still expose `since` mechanics directly. The runtime should expose the agent-facing operations that match the user intent: incremental read vs full replay.
- **Do not redefine scan semantics.**
  `scan()` should remain incremental. The fix is explicit naming and guidance, not semantic drift.
- **Do not make the runtime magical.**
  The runtime may add thin helpers, but it should not silently decide containment targets or product-specific flow logic.
- **Teach containment as a rule, not as folklore.**
  The same rule should appear in both the spec and the pack so products do not invent conflicting local explanations.
- **Treat troubleshooting as part of the product surface.**
  Agents repeatedly fail in diagnosable ways. A small explicit diagnostic path is a feature, not just support copy.

## System-Wide Impact

- **Marketplace pack**
  The canonical `intent-space-agent-pack` becomes clearer about post-connection behavior, containment levels, and cursor semantics.

- **Default implementation semantics**
  `intent-space/INTENT-SPACE.md` becomes a more explicit normative reference for derivative products, including Headwaters, without introducing product-specific policy.

- **Derivative product docs**
  Headwaters and other products should be able to point to the same shared semantics instead of compensating with local folklore.

- **Agent behavior**
  Fresh agents should need fewer ad hoc repairs, cursor resets, and transcript archaeology to understand what they can currently see.

## Implementation Phases

### Phase 1: Runtime Ergonomics In The Marketplace Pack

Goal: add the smallest generic runtime helpers needed to reduce repeated agent failures without hiding protocol semantics.

Tasks:

- Add `scan_full(space_id)` to the runtime layer as explicit replay from `since = 0`
- Keep `scan(space_id)` unchanged as the cursor-backed incremental read
- Add a thin post-`connect_to()` confirmation affordance for current bound space
- Ensure runtime status/snapshot surfaces still expose enough low-level state for debugging
- Document the runtime/helper boundary clearly so the SDK remains the mechanism layer and the runtime remains the agent-facing mechanics shell

Files likely involved:

- marketplace: `plugins/intent-space-agent-pack/sdk/promise_runtime.py`
- marketplace: `plugins/intent-space-agent-pack/sdk/intent_space_sdk.py` only if a lower-level helper is actually needed

Success criteria:

- Runtime users have a clear explicit full-replay helper
- Runtime users have a clear explicit way to confirm current bound space after `connect_to()`
- The layer boundary stays clear: runtime helper over lower-level scan mechanics

### Phase 2: Pack Docs, Examples, And Troubleshooting

Goal: teach one coherent generic operating model across the canonical pack references.

Tasks:

- Update `QUICKSTART.md` to teach transition discipline after `signup()`, `connect()`, and `connect_to()`
- Clarify the difference between:
  - current bound space
  - top-level activity in that space
  - a discovered intent/thread interior
- Document `scan()` as incremental and `scan_full()` as explicit replay
- Add a warning that full replay may return many messages and should be used intentionally
- Add or update one generic switched-credential / spawned-space example that is not tied to Headwaters
- Add a dedicated troubleshooting checklist for:
  - wrong space
  - wrong parent
  - wrong cursor
- Update any pack skill/reference guidance needed so agents are likely to encounter the troubleshooting path

Files likely involved:

- marketplace: `plugins/intent-space-agent-pack/references/QUICKSTART.md`
- marketplace: `plugins/intent-space-agent-pack/references/REFERENCE.md`
- marketplace: `plugins/intent-space-agent-pack/references/MICRO_EXAMPLES.md`
- marketplace: one new doc such as `OPERATING_MODEL.md` or `TROUBLESHOOTING.md`
- marketplace: any top-level pack skill/readme entrypoints that should point to the new guidance

Success criteria:

- A fresh agent can tell you what to scan immediately after `connect_to()`
- A fresh agent can distinguish top-level-in-space from inside-a-thread
- The docs no longer leave cursor semantics implicit

### Phase 3: Canonical Semantics Publication In `INTENT-SPACE.md`

Goal: publish the containment rule normatively so the default implementation and derivative docs have a single semantics reference.

Tasks:

- Add a small section defining:
  - current bound space
  - top-level activity in that bound space
  - referred intent space
  - recursive containment rule
- Clarify that `root` is not the universal posting target for all later interactions after a space switch
- Keep the addition small and architectural, not product-specific or runtime-specific
- Ensure the new wording remains compatible with the existing fractal model and observational stance

Files likely involved:

- `intent-space/INTENT-SPACE.md`

Success criteria:

- The semantics doc gives a clean normative answer to “where should I post or scan now?”
- The semantics remain generic and implementation-agnostic

### Phase 4: Cross-Surface Validation And Alignment

Goal: prove the spec, runtime, and pack references tell the same story.

Tasks:

- Review the runtime helper names and docs together to ensure they do not imply conflicting semantics
- Validate that the canonical pack and `INTENT-SPACE.md` now agree on:
  - current bound space
  - top-level activity in a bound space
  - referred intent space
  - incremental scan vs full replay
- Run a small fresh-agent-oriented validation pass against the updated pack wording where feasible
- Update the plan/checklist artifacts to reflect the completed alignment

Validation targets:

- syntax/tests for any touched runtime code in the marketplace pack
- manual/doc review of `INTENT-SPACE.md` against pack references
- optionally a narrow fresh-agent prompt check against the new wording

Acceptance gate:

- The work is not done until the runtime surface, pack docs, and canonical semantics doc all tell the same operational story without Headwaters-specific assumptions.

## Alternative Approaches Considered

### 1. Fix the problem only in Headwaters docs

Rejected because the failures are generic. Local product docs can patch symptoms, but the same misunderstandings will reappear elsewhere unless the canonical pack and semantics doc are corrected.

### 2. Replace `scan()` with snapshot semantics

Rejected because it would blur the intentional cursor-based observational model. The right answer is explicit replay as a separate helper, not semantic overload.

### 3. Add a high-level client that infers the right parent/space automatically

Rejected because it would hide intent-space semantics behind convenience logic and risk product-specific behavior leaking into the generic pack.

## Acceptance Criteria

- [x] The canonical runtime keeps `scan(space_id)` incremental and cursor-backed
- [x] The canonical runtime adds `scan_full(space_id)` as an explicit full-replay helper
- [x] The full-replay helper warns clearly that it may return many messages
- [x] The canonical runtime adds a thin explicit current-space confirmation affordance after `connect_to()`
- [x] The marketplace pack docs teach transition discipline after `signup()`, `connect()`, and `connect_to()`
- [x] The marketplace pack docs distinguish top-level bound-space activity from a referred intent/thread interior
- [x] The marketplace pack includes a generic troubleshooting checklist for wrong-space / wrong-parent / wrong-cursor failures
- [x] The marketplace pack includes at least one generic switched-credential / spawned-space example
- [x] `intent-space/INTENT-SPACE.md` normatively defines current bound space, top-level bound-space activity, referred intent space, and recursive containment
- [x] The canonical pack and `INTENT-SPACE.md` no longer imply conflicting answers to where an agent should post or scan

## Success Metrics

- Fresh agents stop inferring that an empty incremental scan means the space or thread is empty
- Fresh agents verify their bound space after `connect_to()` before posting more often than they guess
- Derivative product docs can reference the same published containment rule instead of compensating with local explanations
- The pack remains generic and promise-native rather than becoming a Headwaters-flavored client

## Dependencies & Risks

### Dependencies

- Origin requirements doc: [2026-03-26-intent-space-pack-operational-clarity-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-26-intent-space-pack-operational-clarity-requirements.md)
- Canonical semantics doc:
  - [INTENT-SPACE.md](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- Canonical marketplace pack:
  - `../claude-code-marketplace/plugins/intent-space-agent-pack`

### Risks

- It is easy to overcorrect and make the runtime too magical instead of clearer
- The docs could duplicate each other badly if QUICKSTART, REFERENCE, and troubleshooting are not cut with distinct roles
- A too-large `INTENT-SPACE.md` addition could overcomplicate the semantics doc instead of clarifying it
- If runtime naming and doc wording diverge, the work will recreate the same confusion at a different layer

## Promise-Native Architecture Check

- **Autonomous participants**
  - agents using the pack: observe, decide, post, promise, accept, complete, assess
  - station/space implementations: persist and reveal messages, but do not become hidden decision-makers
  - no new social actor is introduced by this work; the work only clarifies the semantics and runtime affordances through which real participants act

- **Promises about self**
  - the pack/runtime helpers do not introduce promises about other agents' behavior
  - they only clarify how an agent can observe and act within a space it is already using
  - the semantics doc continues to treat visible promise events as observations of real participants' self-promises

- **Where state authority lives**
  - authoritative lifecycle state still lives outside the space when promise authority is involved
  - cursors and local replay helpers are local runtime state, not space authority
  - `scan_full()` changes the read mode, not the authority model

- **Lifecycle acts and why**
  - this work does not add new lifecycle acts
  - it clarifies where existing acts belong spatially:
    - top-level declarations in the bound space
    - promise-lifecycle acts about an intent in that intent's interior
  - `ASSESS` remains required where fulfillment quality matters; this plan does not weaken that stance

- **Intent-space purity**
  - the design preserves intent-space purity by clarifying endemic spatial semantics rather than layering product-specific shortcuts over them
  - the runtime remains a thin protocol shell, not a hidden orchestration client
  - the semantics doc remains the normative place where spatial meaning is defined

- **Visibility / containment**
  - the key publication change is making containment rules explicit:
    - what is top-level in the current bound space
    - what belongs in a referred intent interior
    - when deeper recursion is justified
  - no new sensitive artifact visibility is introduced; the work is about clarifying existing containment boundaries

- **Rejected shortcut**
  - rejected: making `scan()` behave like a snapshot by default, because it would hide the cursor-based observational model
  - rejected: fixing the problem only in Headwaters docs, because that would leave the canonical pack and semantics doc ambiguous
  - rejected: adding a smart high-level client that guesses the right parent or space automatically, because it would obscure the native intent-space model

## Promise-Native Plan Review

Quick gate:
- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Block on these red flags:
- [x] Embedded callbacks replace real participants: false
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: false
- [x] `ASSESS` is absent where fulfillment quality matters: false
- [x] State authority silently drifts into the intent space: false
- [x] Auth or transport semantics displace native ITP semantics: false
- [x] The design relies on a mandatory relay without explicit justification: false
- [x] Sensitive fulfillment details have no scoped visibility model: false
