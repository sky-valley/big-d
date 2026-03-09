---
topic: Wire loop agent to intent space protocol
date: 2026-03-09
status: complete
---

# Wire Loop Agent to Intent Space Protocol

## What We're Building

Update the loop agent, CLI, and supervisor to use the new intent space server as the source of intents. Replace direct SQLite polling with IntentSpaceClient connections over Unix socket.

## Key Decisions

### 1. Scoping: sub-spaces as projects

`targetHint` is deleted. Each registered project becomes a sub-space (`parentId`). The CLI posts intents with `parentId: "project-id"`. The agent scans only its project's sub-space.

`criteria` stays in the ITP payload (`payload.criteria`). It's part of the desire, not routing metadata. The agent extracts it from the intent when needed.

**Rationale (Burgess):** `targetHint` is an imposition — it directs a specific agent. The space is not a task queue. `parentId` is topology (the neighborhood), not routing (the address).

**Rationale (Dean):** `targetHint` is a routing hint pretending to be content. The intent space already has the right partition key: `parentId`. Use it.

### 2. Fulfillment tracking: cursor for live, cross-ref on reconnect

- **Live operation:** Agent tracks `latestSeq` and only processes intents with `seq > latestSeq`. Log tailing — O(1) per poll.
- **Cold start / reconnect:** Full scan from persisted cursor (or `since: 0`), cross-reference against local PromiseLog to skip fulfilled intents.
- **Persist the cursor** to the PromiseLog (or a simple file). On restart, read cursor, scan from there.

The space stays pure (body of desire). The promise log stays pure (body of commitment). The agent bridges them.

### 3. Degradation: cached intents from last scan

When the intent space is down, the agent works from cached intents in memory. No new intents until reconnected. Reconnects in background. Respects autonomy — the agent's lifecycle is not coupled to the space's availability.

No fallback to PromiseLog polling. No dual source of truth.

### 4. Lifecycle: independent process

The intent space runs independently (not spawned by the supervisor). The supervisor code for `spawnIntentSpace`, `waitForSocket` should be dropped.

The space is an autonomous agent. Its lifecycle is not managed by the supervisor.

### 5. CLI posting: space only

The CLI posts intents to the intent space only. The PromiseLog's `intents` table becomes a cache populated by the agent when it mirrors an intent before promising (for FK constraints).

If the space is down, the CLI fails with an error. The intent space must be running for intents to be posted. This is the clean separation: space is the canonical store of desire.

## Changes Required

### Drop from working tree diff

- `supervisor.ts`: Remove all `spawnIntentSpace`, `waitForSocket`, `stopIntentSpace` code. Revert to committed version except for import path changes.

### Update in working tree diff

- **`agent.ts`**: Fix imports (`client.ts` not `intent-client.ts`, `StoredIntent` not `StoredIntentRecord`). Replace `queryIntents()` with `scan()`. Replace `on('summary')` with scan-on-connect. Replace `on('intent')` handler to use `IntentEcho` shape. Add cursor persistence. Add cached-intents degradation. Remove `targetHint` filtering — use sub-space scanning instead. Add `ensureIntent()` call before promising (mirror to PromiseLog for FK).
- **`cli.ts`**: Fix import (`client.ts`). Replace `postIntent()` with `post()`. Remove PromiseLog intent write — space is the canonical store. Fail if space is down.
- **`promise-log.ts`**: Keep `ensureIntent()` and `isIntentFulfilled()` (agent needs these). Keep `INTENT_SOCKET_PATH` export. Import path fix only.
- **`work.ts`**: Import path fix only.
- **`test-helpers.sh`**, **`test-negative.sh`**: Import path fixes only.

### New concepts

- **Project sub-spaces:** The CLI's `--target` flag maps to `parentId` when posting. The agent's `DIFFER_TARGET_DIR` determines which sub-space it scans.
- **Cursor persistence:** Agent writes `latestSeq` to PromiseLog (new column or separate table) on each scan. Reads on startup.
- **Reconnection loop:** Agent attempts reconnect on disconnect with backoff. Works from cached intents while disconnected.

## Open Questions

None — all resolved through brainstorming.
