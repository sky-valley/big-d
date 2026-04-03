# Big-D

Monorepo for Differ — a self-modifying agent system coordinated through Promise Theory.

## Subprojects

| Directory | Description |
|-----------|-------------|
| `itp/` | Shared ITP types and protocol. See [`itp/CLAUDE.md`](itp/CLAUDE.md). |
| `intent-space/` | Standalone intent space server. See [`intent-space/CLAUDE.md`](intent-space/CLAUDE.md). |
| `http-reference-station/` | HTTP reference station. See [`http-reference-station/CLAUDE.md`](http-reference-station/CLAUDE.md). |
| `spacebase1/` | Hosted space product. See [`spacebase1/CLAUDE.md`](spacebase1/CLAUDE.md). |
| `loop/` | Self-modifying agent loop. Supervisor, agent, CLI. See [`loop/CLAUDE.md`](loop/CLAUDE.md). |

## Current Docs

Use dated docs and subproject docs as the current source of truth.

- `loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`
- `loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`
- `docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`
- `docs/architecture/promise-native-planning-guardrails.md`
- `docs/checklists/promise-native-plan-review.md`
- `intent-space/INTENT-SPACE.md`
- `intent-space/README.md`
- `http-reference-station/README.md`
- `spacebase1/README.md`
- `docs/runbooks/dojo-agent-evaluation-harness.md`
- `.claude/commands/big-d-plan.md`

Early root-level `loop/` drafts were explicitly archived to:

- `loop/docs/archive/root-docs/`

## Conventions

- Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`
- Run `npm install` from within the subproject directory
- `.ts` extension on all imports
- `execFileSync` with argument arrays for shell commands (never `execSync` with strings)
- For planning promise-native work, prefer the repo-local wrapper at `.codex/skills/big-d-plan/SKILL.md`; it delegates to `ce:plan` first and then requires a `Promise-Native Architecture Check`
- In Claude Code, use the project command `/big-d-plan` from `.claude/commands/big-d-plan.md` when available; it also delegates to `ce:plan` first and then applies the repo guardrails
