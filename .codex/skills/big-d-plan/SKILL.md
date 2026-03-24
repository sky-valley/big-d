---
name: big-d:plan
description: Create big-d plans that preserve Promise Theory, intent-space purity, and honest promise lifecycles without forking upstream ce:plan
---

# big-d:plan

Use this for planning work in `big-d` that touches:

- `intent-space/`
- `academy/`
- `headwaters/`
- `loop/`
- promise lifecycles
- agent control surfaces
- managed coordination or onboarding flows

## Why this exists

Upstream `ce:plan` remains the canonical planner.

This wrapper is intentionally thin. Its job is to delegate to the normal `ce:plan` workflow first, then augment the resulting plan with the local `big-d` guardrails so plans do not drift away from:

- autonomous participants
- promises about self
- honest promise lifecycles
- intent-space purity
- explicit assessment boundaries

## Read first

1. `docs/architecture/promise-native-planning-guardrails.md`
2. `docs/checklists/promise-native-plan-review.md`
3. Relevant subproject docs from `AGENTS.md`

## Workflow

1. First execute the normal `ce:plan` workflow for the request.
2. After that draft exists, apply the local `big-d` guardrails before finalizing it.
3. Add or refine a section named `## Promise-Native Architecture Check`.
4. In that section, answer:
   - who the autonomous participants are
   - which promises are about self
   - where state authority lives
   - which lifecycle acts are required and why
   - how the design preserves intent-space purity
   - how visibility / containment is scoped
   - which shortcut was rejected because it violated the stance
5. Run the checklist in `docs/checklists/promise-native-plan-review.md`.
6. If the checklist fails, revise the plan before implementation.

Keep the wrapper policy-focused. Do not replace `ce:plan` with a separate custom planning process unless upstream `ce:plan` is unavailable.

## Fallback if this skill is not auto-discovered

If your tool does not auto-load repo-local skills, read this file directly and follow it manually. The source of truth is the repo, not a machine-local skill install.
