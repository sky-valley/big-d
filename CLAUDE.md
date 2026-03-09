# Big-D

Monorepo for Differ — a self-modifying agent system coordinated through Promise Theory.

## Subprojects

| Directory | Description |
|-----------|-------------|
| `itp/` | Shared ITP types and protocol. See [`itp/CLAUDE.md`](itp/CLAUDE.md). |
| `intent-space/` | Standalone intent space server. See [`intent-space/CLAUDE.md`](intent-space/CLAUDE.md). |
| `loop/` | Self-modifying agent loop. Supervisor, agent, CLI. See [`loop/CLAUDE.md`](loop/CLAUDE.md). |

## Conventions

- Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`
- Run `npm install` from within the subproject directory
- `.ts` extension on all imports
- `execFileSync` with argument arrays for shell commands (never `execSync` with strings)
