# Big-D Agents

Agent-facing guidance for the `big-d` monorepo.

## Source of Truth

Prefer current, dated docs over early root-level drafts.

Current architecture references:

- `loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`
- `loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`
- `docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`
- `intent-space/INTENT-SPACE.md`
- `intent-space/README.md`
- `academy/README.md`
- `academy/agent-setup.md`
- `docs/runbooks/dojo-agent-evaluation-harness.md`

Archived early root-level `loop/` drafts:

- `loop/docs/archive/root-docs/`

## Subprojects

- `itp/` — shared protocol and types
- `intent-space/` — body of desire and observational space
- `academy/` — dojo pack, Python promise runtime, intent space SDK, tutor participant, harness, demos, and deploy artifacts
- `loop/` — adaptive agent loop and local promise authority

## Architectural Stance

- The intent space is observational and containment-oriented.
- The local promise log is authoritative for promise lifecycle logic.
- Promise events projected into the intent space are for visibility, not state authority.

## Working Rules

- Use each subproject's local `CLAUDE.md` for implementation details.
- Keep imports explicit with `.ts` extensions.
- Use `execFileSync` argument arrays for shell commands.
