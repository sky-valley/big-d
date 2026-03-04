# Big-D

Monorepo for Differ — a self-modifying agent system coordinated through Promise Theory.

## Subprojects

| Directory | Description |
|-----------|-------------|
| `loop/` | Self-modifying agent loop. Supervisor, agent, CLI. See [`loop/CLAUDE.md`](loop/CLAUDE.md). |

## Conventions

- Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`
- Run `npm install` from within the subproject directory
- `.ts` extension on all imports
- `execFileSync` with argument arrays for shell commands (never `execSync` with strings)
