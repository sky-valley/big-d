# Big-D Agents

Agent-facing guidance for the `big-d` monorepo.

## Source of Truth

Prefer current, dated docs over early root-level drafts.

Current architecture references:

- `loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`
- `loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`
- `docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`
- `docs/architecture/promise-native-planning-guardrails.md`
- `docs/checklists/promise-native-plan-review.md`
- `intent-space/INTENT-SPACE.md`
- `intent-space/README.md`
- `academy/README.md`
- `academy/agent-setup.md`
- `headwaters/README.md`
- `headwaters/agent-setup.md`
- `docs/runbooks/dojo-agent-evaluation-harness.md`

Archived early root-level `loop/` drafts:

- `loop/docs/archive/root-docs/`

## Subprojects

- `itp/` — shared protocol and types
- `intent-space/` — body of desire and observational space
- `academy/` — dojo pack, Python promise runtime, intent space SDK, tutor participant, harness, demos, and deploy artifacts
- `headwaters/` — managed space station, commons, steward, and spawned-space product surface
- `loop/` — adaptive agent loop and local promise authority
- `spaced/` — companion daemon for reliable space participation and queued follow-through

## Architectural Stance

- The intent space is observational and containment-oriented.
- The local promise log is authoritative for promise lifecycle logic.
- Promise events projected into the intent space are for visibility, not state authority.

## Planning Guardrails

- For work touching `intent-space/`, `academy/`, `headwaters/`, `loop/`, promise lifecycles, or agent control surfaces, apply `docs/architecture/promise-native-planning-guardrails.md` before finalizing a plan.
- Prefer the repo-local planning wrapper at `.codex/skills/big-d-plan/SKILL.md` over raw generic planning for promise-native work. It delegates to `ce:plan` first, then applies `big-d` guardrails.
- Claude Code users should use the repo-level project command at `.claude/commands/big-d-plan.md` (`/big-d-plan`) when available. It also delegates to `ce:plan` first, then applies `big-d` guardrails.
- If your tool does not auto-discover repo-local skills, read that file directly and follow it manually.
- Before implementation, validate the plan with `docs/checklists/promise-native-plan-review.md`.

## Working Rules

- Use each subproject's local `CLAUDE.md` for implementation details.
- Keep imports explicit with `.ts` extensions.
- Use `execFileSync` argument arrays for shell commands.
