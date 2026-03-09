---
title: "feat: Wire agents and CLI to intent space socket"
type: feat
status: active
date: 2026-03-09
brainstorm: docs/brainstorms/2026-03-09-intent-space-as-chatroom-brainstorm.md
---

# feat: Wire Agents and CLI to Intent Space Socket

## Overview

Connect the agent and CLI to the intent space Unix domain socket, making the intent space the live "bulletin board" for intent discovery. Agents observe intents via real-time socket broadcasts instead of polling the PromiseLog. Promise lifecycle (promise/accept/complete/assess) stays in the PromiseLog — clean separation of "body of desire" (intent space) from "body of commitment" (promise log).

## Problem Statement

Today the agent polls `promiseLog.getOpenIntents()` every 2 seconds — a SQL query that joins `intents` with `promises` to filter fulfilled ones. The CLI posts intents directly to the PromiseLog. The intent space exists as a standalone, tested component but nothing connects to it. This means:

- No real-time intent discovery (agents poll, 2s delay minimum)
- Intent "openness" is entangled with promise state in a single SQL join
- The intent space's broadcast capability is unused
- The "chatroom" model (post a need, agents show up) isn't wired

## Proposed Solution

```
                  BEFORE                                    AFTER
                  ------                                    -----

  CLI                                          CLI
   |                                            |
   +-- post INTENT --> PromiseLog               +-- post INTENT --> PromiseLog
                          |                     +-- post INTENT --> Intent Space (best-effort)
  Agent                   |                                              |
   |                      |                    Agent                     |
   +-- poll getOpenIntents() <--+               |                        |
   |                             |              +-- connect to socket <--+
   +-- post PROMISE ----------->+              +-- receive broadcasts
                                               +-- mirror intent --> PromiseLog (ensureIntent)
                                               +-- post PROMISE ----> PromiseLog
```

Key design choices:
- **CLI dual-writes**: always posts to PromiseLog (offline-capable), also posts to intent space if socket exists (best-effort). This means `differ intent "..."` works before or after `differ run`.
- **Agent reads from intent space**: event-driven observation via socket. Falls back to PromiseLog polling if disconnected.
- **Agent mirrors intents**: before promising, the agent copies the intent record into the PromiseLog via `ensureIntent()`, satisfying the FK constraint.
- **Status reads from PromiseLog**: always works, no intent space dependency.

## Technical Approach

### Architecture

The intent space becomes the live discovery layer. The PromiseLog remains the durable commitment layer. They share intent records via mirroring (the agent copies intents from one to the other before promising).

```
┌─────────────────┐     NDJSON/socket     ┌─────────────────┐
│  Intent Space    │◄────────────────────►│     Agent        │
│  (bulletin board)│                       │  (observer)      │
│                  │  INTENT_BROADCAST     │                  │
│  intent-space.db │─────────────────────►│  mirror intent   │
└─────────────────┘                       │        │         │
                                          │        ▼         │
┌─────────────────┐                       │  ┌───────────┐  │
│      CLI         │──── post INTENT ────►│  │PromiseLog │  │
│  (human agent)   │                       │  │ (SQLite)  │  │
│                  │──── post INTENT ─────►│  │           │  │
│                  │     (best-effort)     │  │ ensureInt │  │
│                  │◄─── read status ──────│  │ + PROMISE │  │
└─────────────────┘                       │  └───────────┘  │
                                          └─────────────────┘
```

### Implementation Phases

#### Phase 1: PromiseLog Preparation

Add methods to PromiseLog that support the new flow without breaking existing code.

**`promise-log.ts` changes:**

```typescript
// New: Insert intent record if it doesn't already exist.
// Used by agent to mirror intents from intent space before promising.
ensureIntent(record: StoredIntentRecord): void {
  this.db.prepare(`
    INSERT OR IGNORE INTO intents (intent_id, sender_id, content, criteria, target_hint, timestamp, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(record.intentId, record.senderId, record.content,
         record.criteria ?? null, record.targetHint ?? null,
         record.timestamp, JSON.stringify(record));
}

// New: Check if any promise for this intent has reached FULFILLED.
// Replaces the SQL join in getOpenIntents() for client-side filtering.
isIntentFulfilled(intentId: string): boolean {
  const row = this.db.prepare(`
    SELECT 1 FROM promises WHERE intent_id = ? AND current_state = 'FULFILLED' LIMIT 1
  `).get(intentId);
  return !!row;
}
```

**Socket path resolution:**

```typescript
// intent-space socket lives alongside the promise-log.db
// Same DIFFER_DB_DIR convention, same default (~/.differ/loop/)
export const INTENT_SOCKET_PATH = join(DEFAULT_DB_DIR, 'intent-space.sock');
```

**Acceptance criteria:**
- [ ] `ensureIntent()` is idempotent (INSERT OR IGNORE)
- [ ] `isIntentFulfilled()` returns true when any agent's promise is FULFILLED
- [ ] `INTENT_SOCKET_PATH` exported from `promise-log.ts`
- [ ] Existing tests pass unchanged

#### Phase 2: Supervisor Manages Intent Space Lifecycle

The supervisor starts the intent space process before spawning agents, and stops it after agents on shutdown.

**`supervisor.ts` changes:**

```typescript
// In runSupervisor():
// 1. Start intent space process (tsx intent-space/src/main.ts)
// 2. Wait for socket file to appear (poll existsSync every 500ms, 10s timeout)
// 3. Then spawn agents as before
// 4. Monitor intent space process — restart on crash
// 5. On SIGTERM: stop agents first, then stop intent space

const intentSpaceProc = spawn('npx', ['tsx', intentSpaceMainPath], {
  env: { ...process.env, DIFFER_DB_DIR: dbDir },
  stdio: 'pipe',
});

// Wait for socket
const socketReady = await waitForSocket(INTENT_SOCKET_PATH, 10_000);
if (!socketReady) throw new Error('Intent space failed to start');

// Then spawn agents...
```

**Acceptance criteria:**
- [ ] Intent space process starts before any agent
- [ ] Supervisor waits for socket file before spawning agents
- [ ] Intent space crash → supervisor restarts it
- [ ] Shutdown order: SIGTERM agents → wait → SIGTERM intent space
- [ ] `DIFFER_DB_DIR` passed through to intent space process

#### Phase 3: Agent Wiring (Core Change)

Replace the polling observe loop with event-driven intent space observation.

**`agent.ts` changes — new observe loop:**

```typescript
// BEFORE (polling):
while (true) {
  const intents = promiseLog.getOpenIntents();
  for (const intent of humanIntents) { /* deliberate, promise */ }
  await sleep(POLL_INTERVAL_MS);
}

// AFTER (event-driven with queue):
const client = new IntentSpaceClient(INTENT_SOCKET_PATH);
const intentQueue: StoredIntentRecord[] = [];

// On connect: seed queue from full history
client.on('summary', async () => {
  const result = await client.queryIntents();  // ALL_INTENTS
  for (const intent of result) {
    if (shouldProcess(intent)) intentQueue.push(intent);
  }
});

// On new intent: add to queue
client.on('intent', (broadcast) => {
  const record = broadcastToRecord(broadcast);
  if (shouldProcess(record)) intentQueue.push(record);
});

// On disconnect: exit for supervisor restart
client.on('disconnect', () => {
  console.error('[agent] Intent space disconnected. Exiting for restart.');
  process.exit(1);
});

await client.connect();

// Serial processing loop
while (true) {
  if (intentQueue.length === 0) {
    await sleep(500);
    continue;
  }
  const intent = intentQueue.shift()!;
  // Mirror into PromiseLog before any action
  promiseLog.ensureIntent(intent);
  // Deliberate: scope check, viability check, promise...
  await deliberate(intent);
}
```

**Intent filtering (`shouldProcess`):**

```typescript
function shouldProcess(intent: StoredIntentRecord): boolean {
  // Exclude service intents (deterministic IDs like 'intent-space:persist')
  if (intent.intentId.includes(':')) return false;
  // Exclude agent-generated intents (prevent self-directed loops)
  if (intent.senderId.startsWith('agent')) return false;
  // Exclude already-fulfilled intents
  if (promiseLog.isIntentFulfilled(intent.intentId)) return false;
  // Exclude intents this agent already acted on
  const existing = promiseLog.getPromisesForIntent(intent.intentId);
  if (existing.some(p => p.agentId === agentId)) return false;
  // Scope check: targetHint must match if present
  if (intent.targetHint && !targetDir.endsWith(intent.targetHint)) return false;
  return true;
}
```

**Acceptance criteria:**
- [ ] Agent connects to intent space socket on startup
- [ ] Agent receives INTENT_SUMMARY and seeds queue from ALL_INTENTS query
- [ ] Agent receives INTENT_BROADCAST events and adds to queue
- [ ] Service intents filtered out (deterministic ID pattern `*:*`)
- [ ] Fulfilled intents filtered out (local PromiseLog check)
- [ ] Agent-generated intents filtered out
- [ ] Agent mirrors intents into PromiseLog before promising (FK satisfied)
- [ ] Agent exits with code 1 on disconnect (supervisor restarts)
- [ ] Intents processed serially (one at a time, broadcasts buffered)

#### Phase 4: CLI Wiring

The CLI posts intents to the intent space (best-effort) in addition to the PromiseLog.

**`cli.ts` changes — intent command:**

```typescript
// BEFORE:
const msg = createIntent(opts.sender, content, opts.criteria, targetRepo);
log.post(msg, hmac ?? undefined);

// AFTER:
const msg = createIntent(opts.sender, content, opts.criteria, targetRepo);
const hmac = signMessage(msg);
log.post(msg, hmac ?? undefined);  // Always write to PromiseLog

// Best-effort: also post to intent space if running
try {
  const client = new IntentSpaceClient(INTENT_SOCKET_PATH);
  await client.connect();
  client.postIntent(msg);
  client.disconnect();
} catch {
  // Intent space not running — intent is in PromiseLog,
  // agents will see it when they next query or via fallback
  if (!opts.json) console.error('Note: intent space not running. Intent saved locally.');
}
```

**No changes to `status` command** — it reads from PromiseLog, which has intents via direct CLI writes and agent mirroring.

**Acceptance criteria:**
- [ ] `differ intent "..."` always writes to PromiseLog (works offline)
- [ ] `differ intent "..."` also posts to intent space if socket exists
- [ ] Graceful handling when intent space is not running (warning, not error)
- [ ] `differ status` unchanged (reads from PromiseLog)

#### Phase 5: Tests

**New integration test: `test-intent-wiring.sh`**

```bash
# Test 1: Supervisor starts intent space before agents
# Test 2: Agent receives intent posted via CLI
# Test 3: Agent filters service intents
# Test 4: Agent filters fulfilled intents
# Test 5: Agent mirrors intent into PromiseLog before promising
# Test 6: CLI works without intent space running (PromiseLog only)
# Test 7: Agent reconnects after intent space restart (via supervisor)
# Test 8: Multiple agents observe same intent, one promises
```

**Existing test updates:**
- `test-all.sh`: add `bash scripts/test-intent-wiring.sh` to the test suite
- Protocol tests (`test-protocol.sh`): unchanged — they test PromiseLog directly
- Negative tests (`test-negative.sh`): unchanged
- Intent space tests: stay in `intent-space/scripts/` — unchanged

**Acceptance criteria:**
- [ ] All 8 integration tests pass
- [ ] All existing protocol tests (17) pass
- [ ] All existing negative tests (18) pass
- [ ] All existing intent space tests (18) pass

## Alternative Approaches Considered

### 1. Intent space as sole source of truth (no dual-write)
CLI posts only to intent space. Status command connects to intent space socket.
**Rejected:** Breaks offline CLI usage (`differ intent` before `differ run`). Makes `status` depend on intent space process. More invasive change.

### 2. Agent reads from both sources (no mirroring)
Agent checks PromiseLog for intents not in intent space.
**Rejected:** Complicates the observe loop. Two sources of truth with no clear precedence. The mirroring approach is simpler and keeps PromiseLog as the single source for status/promises.

### 3. Remove FK constraint from PromiseLog
Let promises reference intent IDs that don't exist in the intents table.
**Rejected:** Weakens data integrity. The `ensureIntent()` mirror approach preserves the FK with minimal change.

## Acceptance Criteria

### Functional Requirements
- [ ] Agent discovers intents via intent space socket (real-time broadcasts)
- [ ] CLI posts intents to both PromiseLog and intent space
- [ ] Promise lifecycle unchanged (PromiseLog only)
- [ ] `status` command works without intent space running
- [ ] Supervisor manages intent space process lifecycle

### Non-Functional Requirements
- [ ] Agent processes intents serially (no concurrent deliberation)
- [ ] Agent exits cleanly on intent space disconnect (supervisor restarts)
- [ ] CLI degrades gracefully when intent space is not running

### Quality Gates
- [ ] All existing test suites pass (protocol, negative, intent space)
- [ ] New integration tests cover the 8 scenarios listed
- [ ] No new npm dependencies required

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent misses intents posted while intent space was down | Agent won't see pre-startup intents | CLI dual-writes to PromiseLog; agent can fall back to PromiseLog polling on disconnect |
| Intent space crash leaves agents disconnected | Agents stop observing new intents | Agent exits with code 1; supervisor restarts both intent space and agents |
| Duplicate intent processing (both PromiseLog and intent space) | Agent promises twice on same intent | `shouldProcess()` checks PromiseLog for existing promises by this agent |
| Service intents pollute agent deliberation | Wasted LLM calls on nonsensical intents | Filter by deterministic ID pattern (`*:*`) |
| FK constraint violation on PROMISE | `promiseLog.post()` throws | `ensureIntent()` called before any PROMISE |

## Future Considerations

Per the [chatroom brainstorm](../brainstorms/2026-03-09-intent-space-as-chatroom-brainstorm.md):

- **Recursion is a property**: same protocol at every level. When child spaces are needed, agents create new IntentSpace instances — no infrastructure to build now.
- **Parent stays pure**: the intent space holds only intents. This plan maintains that — promises never touch the intent space.
- **Capability intents**: agents could post service intents about themselves. Deferred (one-way-door decision).
- **Remove PromiseLog's intents table**: eventual goal. Once all intents flow through the intent space and the agent mirrors them, the PromiseLog's `intents` table becomes a mirror/cache. Can be removed when `status` is wired to read from the intent space.

## References

### Internal References
- Brainstorm: `docs/brainstorms/2026-03-09-intent-space-as-chatroom-brainstorm.md`
- Separation brainstorm: `docs/brainstorms/2026-03-06-intent-space-separation-brainstorm.md`
- Agent observe loop: `loop/src/loop/agent.ts:378-459`
- CLI intent command: `loop/src/loop/cli.ts:188-212`
- PromiseLog getOpenIntents: `loop/src/loop/promise-log.ts:219-229`
- Supervisor: `loop/src/loop/supervisor.ts`
- IntentSpaceClient: `intent-space/src/intent-client.ts`
- Intent space server: `intent-space/src/intent-space.ts`
- Service intents: `intent-space/src/service-intents.ts`

### Institutional Knowledge
- `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md` — scoping is the observer's responsibility, no central router
- `docs/solutions/architecture-decisions/no-source-rollback-invariant.md` — never roll back source on crash
- `docs/solutions/integration-issues/intent-space-promise-theory-participant.md` — identity-first design, service intents before listen
