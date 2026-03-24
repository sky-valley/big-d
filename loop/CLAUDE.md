# Differ Loop: Adaptive Agent Loop

A long-running agent that wraps any git repository as an adaptive exoskeleton. Guards its own source (self-mode) or external repos (external-mode). Modifies code in response to intent, coordinated through Promise Theory — voluntary commitments, no impositions.

## Architecture

Three components:

| Component | Role | File |
|-----------|------|------|
| **Supervisor** | Fixed-point process. Spawns N agent processes (one per registered project). Handles build, rollback, registry hot-reload. | `src/loop/supervisor.ts` |
| **Agent** | Observes intent space, self-selects based on project context, promises on intents, edits target repo, commits. Self-mode exits for restart; external-mode loops. | `src/loop/agent.ts` |
| **CLI** | Human interface. Posts intents, registers projects, accepts promises, assesses outcomes. | `src/loop/cli.ts` |

Shared state: SQLite promise log at `~/.differ/loop/promise-log.db`.

## Quick Start

```bash
npm install
cp .env.example .env   # Add your ANTHROPIC_API_KEY
npm run loop -- init    # Initialize promise log + HMAC key
npm run loop -- add . --mode self   # Register this repo in self-mode
npm run loop -- add /path/to/other/repo  # Register external repo
npm run loop -- intent "add a /health endpoint"  # Post an intent
npm run loop -- run     # Start supervisor + agents
npm run loop -- status  # See intents, promises, projects
```

Prerequisite: `npm run loop` uses `bun build` under the hood for the supervisor build step, so Bun must be installed for the normal supervisor workflow.

## Project Structure

```
src/
  itp/
    types.ts        # ITP message types, promise states, ProjectContext
    protocol.ts     # State machine, factory functions, transitions
  loop/
    promise-log.ts  # PromiseLog: SQLite message log + materialized state + project registry
    supervisor.ts   # Supervisor: spawns N agents, handles per-agent lifecycle
    agent.ts        # Agent: observe → deliberate → promise → work → complete → commit
    work.ts         # doWork() black box: LLM-driven source edits with dynamic prompts
    cli.ts          # Commander CLI: init, add, remove, intent, accept, assess, status, run
    banner.ts       # ASCII banner
```

## Data Model

Two entity types (Promise Theory alignment):

- **Intent** — Permanent declaration of desired outcome. No state machine. Never transitions.
- **Promise** — Autonomous agent commitment. Has lifecycle: `PROMISED → ACCEPTED → COMPLETED → FULFILLED/BROKEN`.

`DECLINE` does not create a promise entity — it's recorded in the message log only.

Four tables: `intents`, `promises`, `projects`, `messages`.

## Key Conventions

- `.ts` extension on all imports (`import { log } from './log.ts'`)
- `execFileSync` with argument arrays for git commands (never `execSync` with strings)
- SQLite WAL mode, `PRAGMA busy_timeout = 5000`
- All CLI commands support `--json` for structured output
- All CLI write commands support `--sender <id>` (default: `'human'`)
- HMAC-SHA256 signing on ACCEPT/ASSESS messages (key at `~/.differ/loop/.hmac-key`)
- Agent identity via env vars: `DIFFER_AGENT_ID`, `DIFFER_TARGET_DIR`, `DIFFER_MODE`

## Promise Protocol

```
human:  INTENT  "add health check endpoint"       ← permanent declaration
agent:  PROMISE "I'll add /health route"           ← autonomous commitment (new promiseId)
human:  ACCEPT                                     ← cooperative binding (+b and -b)
agent:  [edits target repo files]
agent:  COMPLETE "done — added /health"
human:  ASSESS pass                                ← mandatory diff review
agent:  [git commit]
  self-mode:     exit(0) → supervisor rebuilds all, restarts
  external-mode: loop back to observe
```

Two human gates: ACCEPT before work, ASSESS (with diff review) after work.

Multiple agents can PROMISE on the same intent. Human picks one to ACCEPT; others self-RELEASE.

## Exit Codes (Agent → Supervisor)

| Code | Meaning | Supervisor action |
|------|---------|-------------------|
| 0 | Source committed | Self-mode: rebuild all, restart all. External-mode: restart this agent. |
| 2 | Clean shutdown | Stop this agent |
| Other | Crash | Self-mode: reset working copy, restart with backoff. External-mode: restart with backoff. |

## Current Docs

- `../docs/architecture/promise-native-planning-guardrails.md`
- `../docs/checklists/promise-native-plan-review.md`
- `docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`
- `docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`
- `../intent-space/INTENT-SPACE.md`
- `../intent-space/README.md`
- `../docs/plans/2026-03-10-feat-generalize-intent-space-for-promise-events-plan.md`

Early root-level drafts were archived to `docs/archive/root-docs/`. Do not use the archived root drafts as the current architecture source of truth.

## What NOT to Do

- Don't modify `src/itp/types.ts` without understanding the state machine in `protocol.ts`
- Don't add npm dependencies without checking if Node built-ins suffice
- Don't use `execSync` with string interpolation for git commands
- Don't skip HMAC verification on ACCEPT/ASSESS messages
- Don't let the agent process its own auto-generated intents
- Don't pre-route intents to agents — each agent self-selects (Promise Theory: scoping is the observer's responsibility)
- Don't roll back source via `git checkout -- .` on crash. The agent restarts with the same compiled binary and can see its partial edits. Resetting throws away work. (Established in 6fe6423.)

## Planning Rule

For loop work that changes promise authority, coordination semantics, or agent lifecycle behavior, apply `../docs/architecture/promise-native-planning-guardrails.md` before finalizing a plan and review the result with `../docs/checklists/promise-native-plan-review.md`.
