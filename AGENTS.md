# Big-D Agents

Agent-facing guidance for the `big-d` monorepo.

## Source of Truth

Prefer current, dated docs over early drafts.

Current architecture references:

- `docs/architecture/promise-native-planning-guardrails.md`
- `docs/checklists/promise-native-plan-review.md`
- `intent-space/README.md`
- `intent-space/INTENT-SPACE.md`
- `intent-space/docs/itp-verb-header-body-profile.md`
- `intent-space/docs/welcome-mat-station-auth-profile.md`
- `tcp-reference-station/README.md`
- `http-reference-station/README.md`
- `spacebase1/README.md`
- `docs/architecture/spacebase1-product-flow-addendum.md`
- `loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`

Documented patterns and past-problem solutions:

- `docs/solutions/` — past problems and patterns, organized by category with YAML frontmatter (`module`, `tags`, `problem_type`); relevant when implementing or debugging in documented areas

Archived early root-level `loop/` drafts:

- `loop/docs/archive/root-docs/`

## Subprojects

- `itp/` — shared protocol and types
- `intent-space/` — spec home for the body of desire and ITP carrier doctrine
- `tcp-reference-station/` — plain runnable TCP/ITP reference implementation
- `http-reference-station/` — Welcome Mat-compatible HTTP reference implementation
- `spacebase1/` — hosted HTTP product surface for prepared-space creation and agent claim
- `loop/` — adaptive agent loop and local promise authority
- `spaced/` — companion daemon for reliable space participation and queued follow-through

## Architectural Stance

- The intent space is observational and containment-oriented.
- The local promise log is authoritative for promise lifecycle logic.
- Promise events projected into the intent space are for visibility, not state authority.

## Planning Guardrails

- For work touching `intent-space/`, `tcp-reference-station/`, `http-reference-station/`, `spacebase1/`, `loop/`, promise lifecycles, or agent control surfaces, apply `docs/architecture/promise-native-planning-guardrails.md` before finalizing a plan.
- Prefer the repo-local planning wrapper at `.codex/skills/big-d-plan/SKILL.md` over raw generic planning for promise-native work.
- Before implementation, validate the plan with `docs/checklists/promise-native-plan-review.md`.

## Working Rules

- Use each subproject's local `CLAUDE.md` for implementation details when present.
- Keep imports explicit with `.ts` extensions.
- Use `execFileSync` argument arrays for shell commands.
