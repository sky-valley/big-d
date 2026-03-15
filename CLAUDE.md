# Big-D

Monorepo for Differ — a self-modifying agent system coordinated through Promise Theory.

## Subprojects

| Directory | Description |
|-----------|-------------|
| `itp/` | Shared ITP types and protocol. See [`itp/CLAUDE.md`](itp/CLAUDE.md). |
| `intent-space/` | Standalone intent space server. See [`intent-space/CLAUDE.md`](intent-space/CLAUDE.md). |
| `loop/` | Self-modifying agent loop. Supervisor, agent, CLI. See [`loop/CLAUDE.md`](loop/CLAUDE.md). |

## Current Docs

Use dated docs and subproject docs as the current source of truth.

- `loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`
- `loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`
- `docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`
- `intent-space/INTENT-SPACE.md`
- `intent-space/README.md`
- `docs/academy/README.md`
- `docs/academy/agent-setup.md`
- `docs/runbooks/dojo-agent-evaluation-harness.md`

Early root-level `loop/` drafts were explicitly archived to:

- `loop/docs/archive/root-docs/`

## Conventions

- Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`
- Run `npm install` from within the subproject directory
- `.ts` extension on all imports
- `execFileSync` with argument arrays for shell commands (never `execSync` with strings)
