# Differ Loop: Self-Modifying Agent

A long-running agent that guards its own source code, modifies itself in response to intent, and restarts as the new version. Coordination through Promise Theory — voluntary commitments, no impositions.

## Architecture

Three components:

| Component | Role | File |
|-----------|------|------|
| **Supervisor** | Fixed-point process. Launches agent, handles rollback. Never self-modifies. | `src/loop/supervisor.ts` |
| **Agent** | Observes intent space, promises on intents, edits own source, commits, exits for restart. | `src/loop/agent.ts` |
| **CLI** | Human interface. Posts intents, accepts promises, assesses outcomes. | `src/loop/cli.ts` |

Shared state: SQLite promise log at `~/.differ/loop/promise-log.db`.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your ANTHROPIC_API_KEY
npm run loop -- init    # Initialize promise log + HMAC key
npm run loop -- intent "add a /health endpoint"  # Post an intent
npm run loop -- run     # Start supervisor + agent
npm run loop -- status  # See what's happening
```

## Project Structure

```
src/
  itp/
    types.ts        # ITP message types, promise states (from Promise Theory)
    protocol.ts     # State machine, factory functions, transitions
  loop/
    promise-log.ts  # PromiseLog: SQLite message log + materialized state
    supervisor.ts   # Supervisor: spawns agent, handles crash/restart
    agent.ts        # Agent: observe → promise → work → complete → commit → exit
    work.ts         # doWork() black box: LLM-driven source edits
    cli.ts          # Commander CLI: init, intent, accept, assess, status, run
```

## Key Conventions

- `.ts` extension on all imports (`import { log } from './log.ts'`)
- `execFileSync` with argument arrays for git commands (never `execSync` with strings)
- SQLite WAL mode, `PRAGMA busy_timeout = 5000`
- All CLI commands support `--json` for structured output
- All CLI write commands support `--sender <id>` (default: `'human'`)
- HMAC-SHA256 signing on ACCEPT/ASSESS messages (key at `~/.differ/loop/.hmac-key`)

## Promise Protocol

```
human:  INTENT  "add health check endpoint"
agent:  PROMISE "I'll add /health route"
human:  ACCEPT                              ← cooperative binding (+b and -b)
agent:  [edits source files]
agent:  COMPLETE "done — added /health"
human:  ASSESS pass                         ← mandatory diff review
agent:  [git commit, exit 0]
supervisor: [restarts agent with updated source]
```

Two human gates: ACCEPT before work, ASSESS (with diff review) after work.

## Exit Codes (Agent → Supervisor)

| Code | Meaning | Supervisor action |
|------|---------|-------------------|
| 0 | Source committed, restart | Restart agent |
| 2 | Clean shutdown | Stop supervisor |
| Other | Crash | `git checkout -- .`, restart |

## Plan

See `PLAN.md` for the full implementation plan with schema, pseudocode, edge cases, and acceptance criteria.

## What NOT to Do

- Don't modify `src/itp/types.ts` without understanding the state machine in `protocol.ts`
- Don't add npm dependencies without checking if Node built-ins suffice
- Don't use `execSync` with string interpolation for git commands
- Don't skip HMAC verification on ACCEPT/ASSESS messages
- Don't let the agent process its own auto-generated intents
