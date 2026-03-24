---
description: Create a big-d plan that preserves Promise Theory, intent-space purity, and honest promise lifecycles
---

Use this for planning work in `big-d` that touches:

- `intent-space/`
- `academy/`
- `headwaters/`
- `loop/`
- promise lifecycles
- agent control surfaces
- managed coordination or onboarding flows

Feature description:

`$ARGUMENTS`

This command is a thin wrapper around the normal `ce:plan` workflow.

Before writing the final plan:

1. Read `docs/architecture/promise-native-planning-guardrails.md`
2. Read `docs/checklists/promise-native-plan-review.md`
3. Read the relevant repo instructions from `AGENTS.md` and the subproject `CLAUDE.md`
4. First execute the normal `ce:plan` workflow for the request
5. Then augment that plan with the local `big-d` guardrails instead of replacing it with a separate custom planning process

The resulting plan must include a section named:

`## Promise-Native Architecture Check`

That section must answer briefly:

- who the autonomous participants are
- which promises are about self rather than hidden control over others
- where state authority lives
- which lifecycle acts are required and why
- how the design preserves intent-space purity
- how visibility / containment is scoped
- which shortcut was rejected because it violated the stance

Before finalizing the plan:

- Apply `docs/checklists/promise-native-plan-review.md`
- Revise the plan if any blocked red flag is true

If the request is not really promise-native work, say so explicitly and fall back to a normal plan without forcing artificial promise-theory language.
