---
title: "feat: Self-Modifying Agent Loop"
type: feat
status: completed
date: 2026-03-03
brainstorm: docs/brainstorms/2026-03-03-self-modifying-agent-loop-brainstorm.md
---

# Self-Modifying Agent Loop

## Overview

A long-running agent that guards its own source code, modifies itself in response to intent, and restarts as the new version. This is the foundation for Differ as a real system — not demos but an autonomous software agent that evolves through the promise protocol.

**Phase 1 runs from source** (TypeScript via `bun run`). Binary compilation (`bun build --compile`) is deferred to Phase 2 when distribution matters. The self-modification loop works identically either way — the agent edits source, commits, and the supervisor restarts the process.

Three components, mapped to Promise Theory (Burgess, *Book of Promises*):

| Component | PT Role | Description |
|-----------|---------|-------------|
| **Supervisor** | Environment / containing agent | Fixed-point process. Launches agent process, handles rollback. Never self-modifies. |
| **Agent process** | Autonomous agent `A` | Observes intent space, makes give-promises `A →(+b) H`, fulfills through self-modification. |
| **CLI** | Human agent `H` | Posts intents `H →(intent) A`, makes use-promises `H →(-b) A` via ACCEPT, assesses outcomes. |

The **intent space** is a local SQLite database — the shared coordination medium. No imperative commands. All coordination through voluntary promises. Messages are HMAC-signed to prevent impersonation.

## Promise Theory Grounding

> "An agent can only make promises about its own behavior." — Burgess, Tenet 1

The self-modifying loop is a direct application of Promise Theory's core tenets:

1. **Autonomy**: The agent voluntarily promises to handle intents. The CLI cannot impose work — it can only declare intent and accept/assess promises.
2. **Polarity**: Every binding requires both a give-promise (+b) from the agent and a use-promise (-b, ACCEPT) from the human. Neither alone creates obligation.
3. **Assessment**: Completion is a *claim* by the promisor. Fulfillment is a *judgment* by the promisee (ASSESS). These are distinct — the agent says "I'm done," the human says "I agree."
4. **Cooperative binding** (Ch 3, §3.11): Work only begins when both +b and -b exist. The ACCEPT gate enforces this formally.

### Promise Notation

Using Burgess's formal notation:

```
Intent declaration:    H →(intent: "add health check") A
Give-promise:          A →(+b: "will add /health route") H
Use-promise (ACCEPT):  H →(-b: "I will use this work") A
Completion claim:      A →(complete: "added /health") H
Assessment:            H →(assess: FULFILLED | BROKEN) A
Release:               H →(release) A    // binding dissolved
```

The two **human gates** map to use-promise creation (-b for ACCEPT) and assessment. No imposition exists in the system — the agent can DECLINE, the human can RELEASE.

---

## Phase 1: Intent Space (SQLite Schema)

**Goal**: Shared state between CLI and agent. The coordination medium where promises live.

### New: `src/differ/loop/promise-log.ts`

The promise log is a SQLite database at `~/.differ/loop/promise-log.db`. Reuses existing `better-sqlite3` patterns (WAL mode).

Three tables: `messages` (append-only ITP log), `promise_state` (materialized state for fast queries), and `hmac_keys` (message authentication).

```sql
-- ITP message log — append-only
CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,  -- Monotonic cursor for efficient polling
  type       TEXT NOT NULL,                -- INTENT | PROMISE | ACCEPT | DECLINE | COMPLETE | ASSESS | REVISE | RELEASE
  promise_id TEXT NOT NULL,                -- Groups messages into a promise lifecycle
  parent_id  TEXT,                         -- For REVISE: links to parent promise
  sender_id  TEXT NOT NULL,                -- 'human' | 'agent' | 'agent:claude-code' | etc.
  timestamp  INTEGER NOT NULL,             -- Unix ms
  payload    TEXT NOT NULL DEFAULT '{}',   -- JSON: { content, criteria, reason, assessment, plan, filesChanged, summary }
  hmac       TEXT,                         -- HMAC-SHA256 signature (CLI signs, agent verifies on ACCEPT/ASSESS)
  CHECK (type IN ('INTENT','PROMISE','ACCEPT','DECLINE','COMPLETE','ASSESS','REVISE','RELEASE'))
);

CREATE INDEX IF NOT EXISTS idx_messages_promise ON messages(promise_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

-- Materialized promise state — updated transactionally with each message insert
-- Avoids O(n*m) state derivation on every poll cycle
CREATE TABLE IF NOT EXISTS promise_state (
  promise_id    TEXT PRIMARY KEY,
  current_state TEXT NOT NULL DEFAULT 'PENDING',
  sender_id     TEXT NOT NULL,             -- Who posted the original INTENT
  content       TEXT,                      -- Intent content (for display)
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promise_state_state ON promise_state(current_state);
```

### PromiseLog class API

```typescript
class PromiseLog {
  constructor(dbPath?: string)  // defaults to ~/.differ/loop/promise-log.db

  // Write (message + state update in single transaction)
  post(msg: ITPMessage, hmac?: string): void

  // Read
  getMessages(promiseId: string): ITPMessage[]
  getUnpromisedIntents(): ITPMessage[]           // SELECT WHERE current_state = 'PENDING' — O(1)
  getPromiseState(promiseId: string): PromiseState
  getMessagesSince(seq: number): ITPMessage[]    // WHERE seq > ? — monotonic cursor

  // Authentication
  verifyHmac(msg: ITPMessage, hmac: string): boolean

  close(): void
}
```

**Key decisions**:
- **Auto-increment IDs** for monotonic cursor-based polling (not SHA-256 — messages are unique events, not deduplicated)
- **Materialized state** in `promise_state` table, updated transactionally with each message insert. Keeps `getUnpromisedIntents()` O(1) regardless of message count.
- **No checkpoint table** — agent derives its state on boot from the message log + `promise_state`. State derivation is fast with materialized state. Mid-edit crashes: agent detects dirty working copy via `git status` and resets.
- **HMAC signatures** on CLI messages. Agent verifies ACCEPT/ASSESS signatures before acting. Prevents local process impersonation.
- **Renamed from IntentSpace** to `PromiseLog` to avoid collision with existing `IntentSpace` classes in differ and harness modules.

### Reuse from existing codebase

- `ITPMessage`, `PromiseState`, `ITPMessageType` from `src/shared/itp/types.ts` (extracted — see below)
- `nextState()`, `createPromiseRecord()`, `updatePromiseRecord()` from `src/shared/itp/protocol.ts`
- Factory functions: `createIntent`, `createPromise`, `createAccept`, etc.

### Prerequisite: Extract ITP types to shared location

The existing codebase has ITP types duplicated between `src/differ/itp/` and `src/harness/itp/`. Per the differ CLAUDE.md convention ("Imports from `../shared/` are allowed; no other upward imports"), the correct move is:

```
src/shared/itp/
  types.ts      # Moved from src/differ/itp/types.ts
  protocol.ts   # Moved from src/differ/itp/protocol.ts
```

Then `src/differ/`, `src/harness/`, and `src/differ/loop/` all import from `src/shared/itp/`. This eliminates the cross-module import violation and the duplication.

---

## Phase 2: CLI

**Goal**: How humans (and other agents) participate in the promise protocol. The CLI is agent `H` — it can only make promises about its own behavior (posting intent, accepting, assessing).

### New: `src/differ/loop/cli.ts`

Own Commander entry point, following the `intent-graph` precedent (not modifying `src/differ/cli.ts`). This avoids circular imports between `differ` and `loop` modules.

```json
// package.json script
"loop": "node --env-file=.env node_modules/.bin/tsx src/differ/loop/cli.ts"
```

### Phase 1 commands (6 — MVP surface)

```
loop init                          # Initialize promise log + HMAC key
loop intent <content> [--criteria] [--sender <id>] [--json]  # Post an INTENT
loop accept <promiseId> [--sender <id>] [--json]             # ACCEPT (use-promise, -b)
loop assess <promiseId> <pass|fail> [reason] [--sender <id>] [--json]  # ASSESS after COMPLETE
loop status [--json]               # Show promise lifecycle state
loop run                           # Start the agent loop (supervisor + agent)
```

### Deferred to Phase 2: `decline`, `release`, `log`, `stop`

The protocol is fully exercisable with 6 commands. `release` can be replaced by Ctrl+C/kill for Phase 1.

### Global flags

- **`--json`**: All read commands and write command responses output structured JSON instead of formatted text. Essential for external agent participation.
- **`--sender <id>`**: Override sender ID (default: `'human'`). Enables multi-agent identity: `--sender agent:claude-code`.

### `loop init`

1. Create `~/.differ/loop/` directory
2. Initialize `promise-log.db` (schema above)
3. Generate HMAC key at `~/.differ/loop/.hmac-key` (permissions `0600`)
4. Record CWD as the agent source path (agent edits source in the actual repo — no clone in Phase 1)

### `loop intent`

```typescript
// Formal: H →(intent: content) A
const senderId = opts.sender ?? 'human';
const msg = createIntent(senderId, content, criteria);
const hmac = sign(msg, hmacKey);
log.post(msg, hmac);

if (opts.json) {
  console.log(JSON.stringify({ promiseId: msg.promiseId, type: 'INTENT' }));
} else {
  console.log(`INTENT posted: ${msg.promiseId}`);
  console.log(`  "${content}"`);
}
```

### `loop accept`

```typescript
// Formal: H →(-b) A — the use-promise that creates cooperative binding
const state = log.getPromiseState(promiseId);
if (state !== 'PROMISED') {
  const err = `Cannot ACCEPT: promise is in state ${state} (must be PROMISED)`;
  if (opts.json) console.log(JSON.stringify({ error: err }));
  else console.error(err);
  process.exit(1);
}
const msg = createAccept(opts.sender ?? 'human', promiseId);
const hmac = sign(msg, hmacKey);
log.post(msg, hmac);
```

### `loop assess` — Mandatory diff review

```typescript
// Formal: H →(assess: FULFILLED | BROKEN) A
const state = log.getPromiseState(promiseId);
if (state !== 'COMPLETED') {
  console.error(`Cannot ASSESS: promise is in state ${state} (must be COMPLETED)`);
  process.exit(1);
}

// SECURITY: Display the actual source diff before accepting assessment.
// The human must see what changed, not just the agent's summary.
const diff = execFileSync('git', ['diff', 'HEAD~1'], { cwd: agentSourcePath, encoding: 'utf-8' });
if (!opts.json) {
  console.log('\n--- Source changes ---');
  console.log(diff || '(no changes)');
  console.log('--- End changes ---\n');
}

const assessment = pass ? 'FULFILLED' : 'BROKEN';
const msg = createAssess(opts.sender ?? 'human', promiseId, assessment, reason);
const hmac = sign(msg, hmacKey);
log.post(msg, hmac);

if (opts.json) {
  console.log(JSON.stringify({ promiseId, assessment, diff }));
}
```

### `loop status`

Human-readable (default):
```
Promise Log (3 messages, 1 active promise)

  [ACCEPTED] abc123  "add health check endpoint"
    → Agent promised: "Will add /health route returning JSON status"
    → Accepted at: 2026-03-03 14:22:01

  [PENDING]  def456  "improve error messages"
    → No promise yet
```

JSON mode (`--json`):
```json
{
  "promises": [
    { "promiseId": "abc123", "state": "ACCEPTED", "content": "add health check endpoint" },
    { "promiseId": "def456", "state": "PENDING", "content": "improve error messages" }
  ]
}
```

---

## Phase 3: Supervisor

**Goal**: The one fixed point. A process that launches the agent, detects crashes, handles rollback. ~30 lines. Never self-modifies.

### New: `src/differ/loop/supervisor.ts`

```typescript
/**
 * Supervisor — the fixed point in the self-modifying system.
 *
 * Promise Theory role: containing environment agent.
 * Does NOT participate in the promise protocol.
 * Its only job: launch the agent process and handle failure.
 *
 * Analogous to CFEngine's cf-execd (Book of Promises, Ch 17):
 * a scheduler that launches the promise-keeping engine on a cycle.
 *
 * Phase 1: Spawns `bun run src/differ/loop/agent.ts` (from source).
 * Phase 2: Spawns a compiled binary (bun build --compile).
 */
```

### Behavior (Phase 1 — run from source)

```
loop:
  agentScript = AGENT_ENTRY           // src/differ/loop/agent.ts
  sourceDir   = CWD or configured     // the agent's own repo

  proc = spawn('bun', ['run', agentScript], { stdio: 'inherit', cwd: sourceDir })
  wait for proc to exit

  if exit code === 0:
    // Agent committed source changes and wants restart
    log("Agent exited cleanly. Restarting with updated source.")
    continue loop

  if exit code === 2:
    // Agent requested shutdown (no more work)
    log("Agent requested shutdown.")
    exit 0

  if exit code !== 0:
    // Agent crashed — rollback source and restart
    git checkout -- . in sourceDir    // Reset to last committed state
    log("Agent crashed. Rolled back source. Restarting.")
    continue loop
```

Exit codes: **0** = restart with updated source, **2** = clean shutdown, **other** = crash/rollback.

No sentinel files, no binary swap — the agent edits source in place, commits before exiting, and the supervisor just re-runs the script. Git IS the rollback mechanism.

### Data paths

```
~/.differ/loop/
  promise-log.db     # Shared SQLite (promise log)
  .hmac-key          # HMAC signing key (0600 permissions)
  supervisor.pid     # PID file for the supervisor process
```

The agent source lives in the actual project repo (CWD), not a clone. The agent edits its own files directly.

### PID file & lifecycle

Follows the existing daemon pattern (`src/differ/daemon.ts`):
- Write PID file on start
- Check/clean stale PID on startup
- Remove PID file on exit

---

## Phase 4: Agent Process

**Goal**: The autonomous agent. Runs from source via `bun run`. Boots cold, derives state from promise log, observes for intents, promises on them, does work, commits source changes, exits for restart.

### New: `src/differ/loop/agent.ts`

```typescript
/**
 * Self-Modifying Agent — the core loop.
 *
 * Promise Theory role: autonomous agent A.
 * Makes give-promises (+b) voluntarily.
 * Can decline intents it cannot handle.
 *
 * Analogous to cf-agent (Book of Promises, Ch 17):
 * "a general purpose promise keeping engine that operates on promises"
 *
 * Event-driven agent (Definition 26, Ch 5):
 * "An agent that makes promises conditionally on sampling message events"
 */
```

### Agent Loop

```
boot:
  log = new PromiseLog()
  lastSeq = 0

  // Derive state from promise log (no checkpoint table needed)
  activePromise = log.getActivePromiseForAgent('agent')
  if activePromise:
    resume from activePromise.state
  else:
    // Check for dirty working copy (crash recovery)
    if git status shows uncommitted changes:
      git checkout -- .    // Reset to last committed state
    enter OBSERVE phase

OBSERVE:
  intents = log.getUnpromisedIntents()   // O(1) via materialized promise_state table
  if none:
    sleep(2)           // Fixed 2s poll interval (Phase 1)
    goto OBSERVE

  intent = intents[0]  // FIFO: oldest unpromised intent first

PROMISE:
  // A →(+b: plan) H
  plan = deliberate(intent)       // LLM call: what will I do?
  msg = createPromise('agent', intent.promiseId, plan)
  log.post(msg)
  console.log(`PROMISED on ${intent.promiseId}: ${plan}`)

WAIT_ACCEPT:
  loop:
    messages = log.getMessagesSince(lastSeq)
    lastSeq = max sequence seen
    for msg in messages:
      if msg.promiseId === active:
        // SECURITY: verify HMAC on ACCEPT (must come from authenticated CLI)
        if msg.type === 'ACCEPT' && log.verifyHmac(msg, msg.hmac):
          goto WORK
        if msg.type === 'RELEASE':
          goto OBSERVE  // Promise dissolved
    sleep(1)

WORK:
  result = doWork(intent, plan)   // Black box: edit source files in CWD

  msg = createComplete('agent', active, result.summary, result.filesChanged)
  log.post(msg)

WAIT_ASSESS:
  loop:
    messages = log.getMessagesSince(lastSeq)
    lastSeq = max sequence seen
    for msg in messages:
      if msg.promiseId === active && msg.type === 'ASSESS':
        // SECURITY: verify HMAC on ASSESS
        if !log.verifyHmac(msg, msg.hmac):
          continue  // Ignore unsigned assessments
        if msg.payload.assessment === 'FULFILLED':
          goto COMMIT_AND_EXIT
        else:
          goto REVISE

COMMIT_AND_EXIT:
  // Commit source changes (git is the version control)
  git add <filesChanged>          // Explicit file list, not -A
  git commit -m "loop: ${intent.payload.content}"

  exit(0)  // Supervisor restarts with updated source

REVISE:
  revisedPlan = deliberate(intent, feedback: assessMsg.payload.reason)
  msg = createRevise('agent', active, revisedPlan)
  log.post(msg)
  active = msg.promiseId  // New promise ID — needs its own ACCEPT
  goto WAIT_ACCEPT
```

### `doWork()` — The Black Box

How the agent actually edits code is deliberately deferred. For Phase 1:

```typescript
async function doWork(intent: ITPMessage, plan: string): Promise<WorkResult> {
  // Phase 1: Claude API call with file read/write tools.
  // The agent's source is in CWD (the actual repo).
  // The LLM reads files, proposes edits, agent applies them.
  //
  // This is intentionally a black box.
  // The loop framework doesn't depend on how work gets done.

  return { summary: '...', filesChanged: ['...'] };
}
```

### Security: Auto-intent restrictions

When the agent generates intents on its own behalf (e.g., reporting build failures):
- Auto-intents are posted with `sender_id: 'agent'`
- The agent MUST NOT process intents where `sender_id` matches its own identity
- Auto-intents require human ACCEPT like any other intent
- This prevents self-perpetuating prompt injection chains

---

## Phase 5: Bootstrap & E2E Test

**Goal**: Wire everything together. Initialize, first run, verify the loop.

### New: `scripts/test-loop.sh`

End-to-end test using `--json` output for reliable parsing:

```bash
#!/bin/bash
set -euo pipefail

# 1. Initialize
npm run loop -- init

# 2. Post an intent
PROMISE_ID=$(npm run loop -- intent "add a /health endpoint that returns { status: ok }" --json | jq -r '.promiseId')
echo "Intent posted: $PROMISE_ID"

# 3. Start the agent in background
npm run loop -- run &
SUPERVISOR_PID=$!
trap "kill $SUPERVISOR_PID 2>/dev/null" EXIT

# 4. Wait for agent to PROMISE (poll with --json)
for i in {1..10}; do
  STATE=$(npm run loop -- status --json | jq -r ".promises[] | select(.promiseId == \"$PROMISE_ID\") | .state")
  [ "$STATE" = "PROMISED" ] && break
  sleep 2
done
[ "$STATE" = "PROMISED" ] || { echo "FAIL: no promise (state: $STATE)"; exit 1; }

# 5. ACCEPT the promise
npm run loop -- accept "$PROMISE_ID"

# 6. Wait for COMPLETE
for i in {1..30}; do
  STATE=$(npm run loop -- status --json | jq -r ".promises[] | select(.promiseId == \"$PROMISE_ID\") | .state")
  [ "$STATE" = "COMPLETED" ] && break
  sleep 2
done
[ "$STATE" = "COMPLETED" ] || { echo "FAIL: not completed (state: $STATE)"; exit 1; }

# 7. ASSESS pass (diff is shown automatically)
npm run loop -- assess "$PROMISE_ID" pass

# 8. Wait for restart
sleep 5

# 9. Verify agent is idle
STATE=$(npm run loop -- status --json | jq -r '.agent.state // "idle"')
[ "$STATE" = "idle" ] || echo "WARN: agent state is $STATE (may still be processing)"

echo "PASS: Self-modifying loop completed successfully"
```

---

## File Map

New files to create:

```
src/shared/itp/
  types.ts           # ITP types (moved from src/differ/itp/types.ts)
  protocol.ts        # ITP protocol (moved from src/differ/itp/protocol.ts)
src/differ/loop/
  promise-log.ts     # PromiseLog class (SQLite, shared state)
  supervisor.ts      # Supervisor process (fixed point, ~30 lines)
  agent.ts           # Agent entry point (the self-modifying loop)
  work.ts            # doWork() implementation (black box, LLM calls)
  cli.ts             # Own Commander CLI entry point
scripts/
  test-loop.sh       # E2E test for the loop
```

Files to modify:

```
src/differ/itp/types.ts     # Re-export from src/shared/itp/types.ts (backwards compat)
src/differ/itp/protocol.ts  # Re-export from src/shared/itp/protocol.ts
src/harness/itp/types.ts    # Replace with import from src/shared/itp/
src/harness/itp/protocol.ts # Replace with import from src/shared/itp/
package.json                # Add "loop" script
```

### Why `src/differ/loop/` not `src/loop/`

The loop is a new feature of the Differ system, not a peer. It imports shared ITP types from `src/shared/itp/` (following the convention: "Imports from `../shared/` are allowed"). It lives under `src/differ/` to keep all Differ code colocated, but has its own CLI entry point to avoid circular imports.

### Prerequisite: ITP extraction

Before implementing the loop, extract ITP types to `src/shared/itp/`. This is a mechanical move — copy files, update imports, add re-exports for backwards compatibility. All three consumers (`differ`, `harness`, `loop`) then import from the shared location.

---

## Acceptance Criteria

### Functional

- [x] `loop init` creates promise log DB and HMAC key
- [x] `loop intent` posts INTENT messages to the promise log
- [x] `loop accept` / `assess` enforce state machine transitions with HMAC verification
- [x] `loop status` shows promise lifecycle state (human-readable and `--json`)
- [x] `loop run` starts supervisor, which launches agent process
- [x] Agent observes unpromised intents and voluntarily PROMISEs
- [x] Agent waits for HMAC-signed ACCEPT before beginning work (cooperative binding)
- [x] Agent waits for HMAC-signed ASSESS before committing (human gate)
- [x] `loop assess` displays full source diff before accepting input
- [x] ASSESS BROKEN triggers REVISE cycle with new ACCEPT requirement
- [x] Agent commits source changes and exits (0) after FULFILLED
- [x] Supervisor restarts agent from updated source after exit 0
- [x] Supervisor rolls back via `git checkout -- .` on crash (exit 1)
- [x] Agent derives state from promise log on boot — no checkpoint table needed
- [x] Agent ignores intents from its own sender_id (no self-directed loops)

### Promise Theory Compliance

- [x] No impositions: agent can DECLINE any intent
- [x] Cooperative binding: work only begins when both +b (PROMISE) and -b (ACCEPT) exist
- [x] Assessment is by the promisee (human), not the promisor (agent)
- [x] All state derived from the message log (materialized in `promise_state` table)
- [x] `--sender` flag enables any agent to participate with its own identity

### Agent-Native Compliance

- [x] All CLI read commands support `--json` for structured output
- [x] All CLI write commands support `--sender <id>` for agent identity
- [x] Protocol is fully exercisable through CLI (no SQLite-only paths for core operations)

### Non-Functional

- [x] Agent startup under 500ms (bun run from source)
- [x] Promise log handles 1000+ messages without degradation (WAL mode + materialized state)
- [x] `getUnpromisedIntents()` is O(1) regardless of message count
- [x] Supervisor is stateless — can be killed and restarted without data loss

---

## Implementation Order

0. **ITP extraction** — move `src/differ/itp/` to `src/shared/itp/`, update all imports. Mechanical prerequisite.
1. **Promise Log** (`promise-log.ts`) — foundation, no dependencies beyond shared ITP types
2. **CLI** (`cli.ts`, 6 commands) — can test promise log immediately with `--json`
3. **Supervisor** (`supervisor.ts`) — simple, testable with a mock script
4. **Agent process** (`agent.ts`) — depends on promise log + supervisor
5. **Work implementation** (`work.ts`) — the black box, last because the loop doesn't depend on it
6. **E2E test** (`test-loop.sh`) — integration verification

Each phase is independently testable. Phase 0-2 can be verified with manual CLI usage. Phase 3 can be tested with a trivial agent script that just exits. Phase 4-5 close the loop.

### Future: Phase 2 (Binary Compilation)

When distribution matters, add `bun build --compile` to produce standalone binaries. This requires:
- Testing bun compile with `better-sqlite3` (or switching to `bun:sqlite`)
- Binary swap protocol in supervisor (sentinel file or exit code based)
- `agent-src/` clone or worktree management
- Binary integrity verification (SHA-256 hash in sentinel)

Deferred because the loop works identically from source.

---

## Edge Cases & Recovery

Critical scenarios identified through flow analysis and multi-agent review. These are design decisions, not deferred questions.

### Crash Recovery (Run-From-Source Model)

No checkpoint table needed. On crash:

1. Supervisor detects non-zero exit
2. Supervisor runs `git checkout -- .` to discard uncommitted changes
3. Supervisor restarts the agent process
4. Agent boots, reads promise log, derives current state from `promise_state` table
5. If an active promise exists in ACCEPTED state: re-enter WORK
6. If in COMPLETED state: wait for ASSESS
7. If no active promise: OBSERVE

Git IS the rollback mechanism. Committed = safe. Uncommitted = discarded on crash.

### Exit Code Contract

| Code | Meaning | Supervisor action |
|------|---------|-------------------|
| 0 | Source committed, restart | Restart agent process |
| 2 | Clean shutdown, no work | Stop supervisor |
| Other | Crash / error | `git checkout -- .`, restart |

### HMAC Message Authentication

On `loop init`, a random 256-bit key is written to `~/.differ/loop/.hmac-key` (permissions `0600`).

CLI signs ACCEPT and ASSESS messages: `HMAC-SHA256(key, type + promiseId + timestamp + senderId)`. Agent verifies before acting on these messages. This prevents any local process from impersonating the human to bypass the two gates.

INTENT messages are also signed for traceability, but the agent doesn't refuse unsigned intents — it just won't auto-ACCEPT them.

### Mandatory Diff Review in ASSESS

The `loop assess` command displays `git diff HEAD` before accepting input. The human sees the actual source changes, not just the agent's summary. This is non-optional — the diff is shown even if the human doesn't read it. In `--json` mode, the diff is included in the response object.

This is the single most important security control. The agent's self-reported summary cannot be trusted — the diff can be.

### Auto-Intent Restrictions

When the agent posts intents on its own behalf (e.g., error reporting):
- Posted with `sender_id: 'agent'`
- Agent MUST NOT process intents where `sender_id` starts with `'agent'`
- Prevents self-perpetuating prompt injection chains
- Human must explicitly re-post as their own intent if they want it handled

### REVISE Flow & New Promise ID Visibility

When agent issues REVISE, a new `promiseId` is created. `loop status` shows all non-terminal promises:

```
Promise Log

  [BROKEN]   abc-123  "add health check endpoint"
    → Assessed BROKEN: "endpoint returns 404, not 200"

  [PROMISED]  def-456  "add health check endpoint" (revision of abc-123)
    → Agent promised: "Will fix route registration order"
    → Awaiting ACCEPT
```

The `parentId` chain links revisions to their original intent.

### SQLite Busy Handling

```sql
PRAGMA busy_timeout = 5000;  -- Wait up to 5 seconds for write lock
PRAGMA journal_mode = WAL;    -- Allows concurrent reads during writes
```

WAL mode means the CLI can read while the agent writes (and vice versa). Sufficient for a single-machine, two-writer system.

---

## Open Questions (Deferred to Implementation)

- **How does `doWork()` actually edit code?** Claude API with tool use? Spawned Claude Code session? For Phase 1, a simple Claude API call with file read/write tools is sufficient.
- **Intent selection heuristic**: FIFO (oldest timestamp first). Revisit if priority is needed.
- **Poll interval**: Fixed 2s for Phase 1. Could use `fs.watch` on the SQLite WAL file for near-zero latency later.
- **Multi-agent coordination**: Schema supports multiple agents via `sender_id` + `--sender` flag. Coordination rules deferred.
- **Remote intent space**: SQLite is local. Network upgrade deferred per brainstorm.
- **Promisor-side CLI commands**: `loop promise`, `loop complete`, `loop revise` would let external agents act as workers through the CLI. Deferred to Phase 2.
- **Binary compilation**: `bun build --compile` deferred to Phase 2. Requires spike-testing with `better-sqlite3` native addon first.

---

## Review Findings Incorporated

This plan was updated based on a multi-agent technical review (2026-03-03):

| Finding | Source | Resolution |
|---------|--------|------------|
| Cross-module import violation | Architecture | Extract ITP to `src/shared/itp/` |
| No diff review before ASSESS | Security | Mandatory `git diff` display in `loop assess` |
| Unauthenticated intent space | Security | HMAC signing for CLI messages |
| CLI output human-only | Agent-Native | `--json` flag on all commands |
| Binary compilation premature | Simplicity | Run from source in Phase 1 |
| Circular CLI imports | Architecture | Own CLI entry point (`loop/cli.ts`) |
| No monotonic cursor | Performance | Auto-increment `seq` column |
| O(n*m) state derivation | Performance | Materialized `promise_state` table |
| 10 CLI commands too many | Simplicity | Ship 6, defer 4 |
| Hardcoded sender ID | Agent-Native | `--sender` flag |
| IntentSpace name collision | Architecture | Renamed to `PromiseLog` |
| Auto-intents bypass oversight | Security | Agent ignores own `sender_id` |
| Checkpoint table premature | Simplicity | Derive state from promise log |

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-03-03-self-modifying-agent-loop-brainstorm.md`
- ITP types: `src/differ/itp/types.ts` → `src/shared/itp/types.ts` (to be extracted)
- ITP protocol: `src/differ/itp/protocol.ts` → `src/shared/itp/protocol.ts`
- Intent-graph CLI: `src/intent-graph/cli.ts` (precedent for own CLI entry point)
- SQLite patterns: `src/differ/store.ts` (WAL, content-addressed)
- Daemon pattern: `src/differ/daemon.ts` (PID file, fork, IPC)

### Promise Theory (Burgess, *Book of Promises*)

- Ch 1: Tenets — agents are autonomous, can only promise about own behavior
- Ch 3, §3.11: Cooperative binding — both +b and -b required
- Ch 3, §3.7: Promise polarity — give vs use promises
- Ch 5: Assessment — subjective judgment by promisee
- Ch 5, Def 26: Event-driven agents — promise conditionally on sampling events
- Ch 17: CFEngine — promise-keeping engine, the closest prior art
