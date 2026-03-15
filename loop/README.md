# Loop

Loop is an adaptive agent loop coordinated through Promise Theory. A fixed supervisor spawns one agent per registered repository; each agent observes a shared intent log, self-selects relevant intents based on project context, voluntarily promises to fulfill them, performs the work, commits changes, and either exits for restart (self-mode) or loops back to observe (external-mode). All coordination is voluntary: no process commands another. Humans participate as peers, posting intents and assessing outcomes through the same CLI the agents read.

## Prerequisites

- Node.js >= 18
- npm
- Bun
- Intent space running (`cd ../intent-space && npm start`)

## Setup

```sh
cd loop
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run loop -- init
npm run loop -- add . --mode self   # register this repo
npm run loop -- intent "add a /health endpoint"
npm run loop -- run    # start the supervisor + agents
```

The intent space must be running before posting intents or starting agents. Agents degrade gracefully if the space goes down — they work from cached intents and reconnect with backoff.

`npm run loop` depends on `bun build` for the supervisor build step. For CLI-only iteration you can use `npm run loop:dev`, but the supervisor path still requires Bun.

## Command Reference

All commands accept `--json` for structured output and `--sender <id>` to set the caller's identity (default: `human`).

---

### `init`

```
npm run loop -- init [--json]
```

Creates `~/.differ/loop/`, initialises the SQLite promise log (`promise-log.db`), and generates an HMAC signing key. Archives any existing DB (clean schema break). Run once before any other command.

```sh
npm run loop -- init
```

---

### `add`

```
npm run loop -- add <path> [--name <name>] [--mode <self|external>] [--json]
```

Registers a git repository with Differ. Each registered repo gets its own agent process when the supervisor starts. Default mode is `external`.

```sh
npm run loop -- add . --mode self --name loop
npm run loop -- add /path/to/my-api --name my-api
```

---

### `remove`

```
npm run loop -- remove <name-or-id> [--json]
```

Removes a registered repository. Any active promises for its agent are released.

```sh
npm run loop -- remove my-api
```

---

### `projects`

```
npm run loop -- projects [--json]
```

Lists all registered projects with their paths, modes, and agent IDs.

```sh
npm run loop -- projects
```

---

### `intent`

```
npm run loop -- intent "<content>" [--criteria <criteria>] [--target <path>] [--sender <id>] [--json]
```

Posts an INTENT declaring a desired outcome. Intents are permanent declarations — they never transition state. The `--target` option is a hint for agent self-selection but does not bind.

```sh
npm run loop -- intent "add a /health endpoint" --criteria "returns 200 with { ok: true }"
npm run loop -- intent "update README" --target /path/to/my-api
```

---

### `accept`

```
npm run loop -- accept <promiseId> [--sender <id>] [--json]
```

Creates a use-promise binding (-b), moving the promise from PROMISED to ACCEPTED and authorising the agent to begin work. If multiple agents promise on the same intent, accept one — others self-release.

```sh
npm run loop -- accept a7d9edf4
```

---

### `release`

```
npm run loop -- release <promiseId> [--reason <reason>] [--sender <id>] [--json]
```

Dissolves the promise binding and moves the promise to RELEASED. Valid from PROMISED or ACCEPTED.

```sh
npm run loop -- release a7d9edf4 --reason "no longer needed"
```

---

### `assess`

```
npm run loop -- assess <promiseId> <pass|fail> [reason] [--sender <id>] [--json]
```

Judges a COMPLETED promise. Displays the actual source diff from the target repo before accepting input — this is the mandatory human review gate.

- `pass` → FULFILLED (terminal, work accepted)
- `fail` → BROKEN; the agent posts a REVISE with a new promise ID that requires its own ACCEPT

```sh
npm run loop -- assess a7d9edf4 pass
npm run loop -- assess a7d9edf4 fail "missing error handling"
```

---

### `status`

```
npm run loop -- status [--json]
```

Shows intents grouped with their promises, plus registered projects. Intent/promise IDs may be abbreviated to an unambiguous prefix in other commands.

```sh
npm run loop -- status
```

---

### `run`

```
npm run loop -- run
```

Starts the supervisor. The supervisor compiles the agent, spawns one agent process per registered project, and manages their lifecycles. Hot-reloads the project registry every 10 seconds.

```sh
npm run loop -- run
```

---

## Typical Workflow

```sh
# 1. Register a repo
npm run loop -- add /path/to/my-api

# 2. Human posts an intent
npm run loop -- intent "add a /health endpoint" --target /path/to/my-api

# 3. Agent observes, self-selects, and posts a PROMISE (autonomous)

# 4. Human accepts the promise
npm run loop -- accept a7d9edf4

# 5. Agent performs the work — edits target repo source (autonomous)

# 6. Agent posts COMPLETE with a summary of changes (autonomous)

# 7. Human reviews the diff and assesses
npm run loop -- assess a7d9edf4 pass
# → FULFILLED
```

If assessment fails, the agent receives feedback, posts a REVISE with a new promise ID, and the cycle repeats from step 4.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Self-mode: supervisor rebuilds all, restarts all. External-mode: restart this agent. |
| 2 | Clean shutdown — stop this agent |
| other | Crash — restart with exponential backoff |

---

## Current Docs

- [`docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`](/Users/noam/work/skyvalley/big-d/loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md)
- [`docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`](/Users/noam/work/skyvalley/big-d/loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md)
- [`../intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`../intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)

Archived root-level drafts from the early design phase live under [`docs/archive/root-docs/`](/Users/noam/work/skyvalley/big-d/loop/docs/archive/root-docs).

---

## Learn More

[memetic.software](https://memetic.software)
