# Loop

Loop is a self-modifying agent coordinated through Promise Theory. A fixed supervisor builds and launches an agent process; the agent observes an append-only intent log, voluntarily promises to fulfill open intents, performs the work (including modifying its own source code), commits changes, and exits — signalling the supervisor to rebuild and restart it with the updated code. All coordination is voluntary: no process commands another. Humans participate as peers, posting intents and assessing outcomes through the same CLI the agent reads.

## Prerequisites

- Node.js ≥ 18
- npm

## Setup

```sh
cd loop
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run loop -- init
npm run loop -- run    # start the supervisor + agent loop
```

## Command Reference

All commands accept `--json` for structured output and `--sender <id>` to set the caller's identity (default: `human`).

---

### `init`

```
npm run loop -- init [--json]
```

Creates `~/.differ/loop/`, initialises the SQLite promise log (`promise-log.db`), and generates an HMAC signing key. Run once before any other command.

```sh
npm run loop -- init
```

---

### `intent`

```
npm run loop -- intent "<content>" [--criteria <criteria>] [--sender <id>] [--json]
```

Posts an INTENT message declaring a desired outcome. The new promise starts in the PENDING state and is visible to the agent on its next poll.

```sh
npm run loop -- intent "add a /health endpoint" --criteria "returns 200 with { ok: true }"
```

---

### `accept`

```
npm run loop -- accept <promiseId> [--sender <id>] [--json]
```

Creates a use-promise binding (−b), moving the promise from PROMISED to ACCEPTED and authorising the agent to begin work. The promise must already be in the PROMISED state (i.e. the agent has posted its give-promise).

```sh
npm run loop -- accept a7d9edf4
```

---

### `release`

```
npm run loop -- release <promiseId> [--reason <reason>] [--sender <id>] [--json]
```

Dissolves the promise binding and moves the promise to the terminal RELEASED state. Valid from PENDING, PROMISED, or ACCEPTED.

```sh
npm run loop -- release a7d9edf4 --reason "no longer needed"
```

---

### `assess`

```
npm run loop -- assess <promiseId> <pass|fail> [reason] [--sender <id>] [--json]
```

Judges a COMPLETED promise. Displays the actual source diff (via `git diff`) before accepting input — this is the mandatory human review gate.

- `pass` → FULFILLED (terminal, work accepted)
- `fail` → BROKEN; the agent posts a REVISE message with a new promise ID that requires its own ACCEPT

```sh
npm run loop -- assess a7d9edf4 pass
npm run loop -- assess a7d9edf4 fail "missing error handling"
```

---

### `status`

```
npm run loop -- status [--json]
```

Prints all promises and their current states. Promise IDs may be abbreviated to an unambiguous prefix in other commands.

```sh
npm run loop -- status
```

---

### `run`

```
npm run loop -- run
```

Starts the supervisor. The supervisor compiles the agent, launches it as a child process, and restarts or rolls back based on the exit code. Runs until a clean-shutdown signal is received.

```sh
npm run loop -- run
```

---

## Typical Workflow

```sh
# 1. Human posts an intent
npm run loop -- intent "add a /health endpoint" --criteria "returns 200 with { ok: true }"
# → promiseId: a7d9edf4  state: PENDING

# 2. Agent observes the intent and posts a give-promise (autonomous)
# → state: PROMISED

# 3. Human accepts, creating the use-promise binding
npm run loop -- accept a7d9edf4
# → state: ACCEPTED

# 4. Agent performs the work — edits source, runs tests, commits (autonomous)

# 5. Agent posts COMPLETE with a summary of changes (autonomous)
# → state: COMPLETED

# 6. Human reviews the diff and assesses
npm run loop -- assess a7d9edf4 pass
# → state: FULFILLED
```

If assessment fails, the agent receives feedback, posts a REVISE with a new promise ID, and the cycle repeats from step 3 with the new ID.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Work complete — supervisor rebuilds and restarts the agent |
| 2 | Clean shutdown — supervisor exits normally |
| other | Crash — supervisor rolls back to the previous build and restarts |

---

## Learn More

[memetic.software](https://memetic.software)
