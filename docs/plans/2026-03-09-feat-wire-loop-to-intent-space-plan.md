---
title: "feat: Wire loop agent and CLI to intent space protocol"
type: feat
status: completed
date: 2026-03-09
---

# feat: Wire loop agent and CLI to intent space protocol

## Overview

Replace the loop agent's direct SQLite polling with IntentSpaceClient connections over Unix socket. The intent space becomes the canonical store of desire. The promise log remains the canonical store of commitment. The agent bridges the two.

## Problem Statement

The loop agent currently reads intents from a local SQLite table (`promiseLog.getOpenIntents()`). The CLI writes intents to that same table. This couples intent discovery to a single-process SQLite database — no remote agents, no shared observation, no fractal containment. The intent space server already exists with the right protocol (ITP INTENT + SCAN), but the loop doesn't use it.

The working tree has a partial attempt at wiring, but it targets the old API (`intent-client.ts`, `StoredIntentRecord`, `queryIntents()`, `postIntent()`, `on('summary')`) — all of which were deleted in the protocol redesign.

## Proposed Solution

Three components change. One stays the same.

| Component | Change | Scope |
|-----------|--------|-------|
| **CLI** | Post intents to intent space (not PromiseLog). Add `parentId` for sub-space targeting. | Small |
| **Agent** | Connect to intent space via `IntentSpaceClient`. Scan sub-space with cursor. Echo for real-time. Cache for degradation. Mirror to PromiseLog before promising. | Large |
| **Supervisor** | Drop intent space lifecycle management. Warn if socket missing. | Small (delete code) |
| **PromiseLog** | Keep `ensureIntent()`, `isIntentFulfilled()`. Add cursor persistence table. | Small |

## Technical Approach

### Sub-space model

Each registered project is a sub-space. The `spaceId` is the project's directory basename (e.g., `/Users/noam/work/myapp` → `"myapp"`). This is stored in the existing `projects` table (no schema change needed — the `path` column already has the data, and `basename(path)` derives the spaceId).

- CLI: `differ intent "add /health" --target /path/to/myapp` → posts with `parentId: "myapp"`
- CLI: `differ intent "general cleanup"` (no target) → posts with `parentId: "root"`
- Agent: scans its project's sub-space via `client.scan("myapp", cursor)`
- Agent: also scans `"root"` for untargeted intents (backward compat)

### `createIntent()` extension

Add optional `parentId` parameter to the factory in `itp/src/protocol.ts`:

```typescript
// itp/src/protocol.ts
export function createIntent(
  senderId: string,
  content: string,
  criteria?: string,
  targetRepo?: string,
  parentId?: string,        // NEW
): ITPMessage {
  return {
    type: 'INTENT',
    intentId: randomUUID(),
    parentId: parentId ?? 'root',
    senderId,
    timestamp: Date.now(),
    payload: { content, criteria, targetRepo },
  };
}
```

### Intent space schema: preserve criteria in payload

The intent space currently stores only `content` from the payload. To preserve `criteria` across scan round-trips, add a `payload` column to the intents table:

```sql
-- intent-space/src/store.ts
ALTER TABLE intents ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
```

`StoredIntent` gains an optional `payload` field. The store persists `JSON.stringify(msg.payload)` and returns it in scan results. This keeps the intent space generic — it doesn't know about `criteria`, it just round-trips the payload.

### CLI changes

```typescript
// loop/src/loop/cli.ts — intent command
async (content, opts) => {
  const projectSpaceId = opts.target
    ? basename(resolve(opts.target))
    : 'root';

  const msg = createIntent(opts.sender, content, opts.criteria, opts.target, projectSpaceId);

  const client = new IntentSpaceClient(INTENT_SOCKET_PATH);
  await client.connect();
  client.post(msg);
  // Wait for echo to confirm persistence
  await new Promise(r => setTimeout(r, 200));
  client.disconnect();
}
```

If the space is down, the CLI fails with: `"Intent space not running. Start it with: cd intent-space && npm start"`

No PromiseLog write on the CLI side. The agent mirrors intents into PromiseLog via `ensureIntent()` before promising (for FK constraints).

### Agent observe loop

Replace the current polling loop with a two-source model:

```
Boot
  → try connect to intent space
    → SUCCESS: scan sub-space + root from persisted cursor
                listen for echo events
    → FAILURE: log warning, start with empty cache

Main loop (serial, one intent at a time):
  → dequeue from intentQueue
  → shouldProcess() filter (service intents, agent-generated, fulfilled, already-acted-on)
  → ensureIntent() mirror to PromiseLog
  → deliberate (scope + viability)
  → promise → waitAccept → work → waitAssess → commit
  → persist cursor (latestSeq)

On disconnect:
  → log warning
  → continue processing cached queue
  → attempt reconnect with backoff (5s, 10s, 30s, 60s cap)
  → on reconnect: re-scan from cursor, merge into queue
```

### `shouldProcess()` filter

```typescript
function shouldProcess(intent: StoredIntent): boolean {
  // Exclude service intents (deterministic IDs like 'intent-space:persist')
  if (intent.intentId.includes(':')) return false;
  // Exclude agent-generated intents (prevent self-directed loops)
  if (intent.senderId.startsWith('agent')) return false;
  // Exclude already-fulfilled intents (cross-ref against PromiseLog)
  if (promiseLog.isIntentFulfilled(intent.intentId)) return false;
  // Exclude intents this agent already acted on
  const existing = promiseLog.getPromisesForIntent(intent.intentId);
  if (existing.some(p => p.agentId === agentId)) return false;
  return true;
}
```

No `targetHint` check — sub-space scanning handles project scoping. No `criteria` extraction needed here — it's in the payload and used later during assessment.

### Cursor persistence

New table in PromiseLog:

```sql
CREATE TABLE IF NOT EXISTS agent_cursors (
  agent_id  TEXT NOT NULL,
  space_id  TEXT NOT NULL,
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, space_id)
);
```

Agent writes cursor after each scan. Reads on startup. If cursor is missing (first boot), scans from `since: 0`.

### Supervisor changes

Drop all intent space lifecycle code from `supervisor.ts`:
- Remove `spawnIntentSpace()`, `stopIntentSpace()`, `waitForSocket()`
- Remove `INTENT_SPACE_MAIN` constant
- Remove the `intentSpaceProc` state
- Keep `INTENT_SOCKET_PATH` import (for a warning log)
- Add on startup: `if (!existsSync(INTENT_SOCKET_PATH)) console.log('Warning: intent space socket not found. Agents will start in degraded mode.');`

### `differ status` limitation

With the CLI no longer writing to PromiseLog, `differ status` won't show intents until an agent mirrors them. This is acceptable for now — the intent space is the source of truth, and a future `differ status` update can query it directly.

## Acceptance Criteria

- [x] CLI `differ intent` posts to intent space with `parentId` derived from `--target`
- [x] CLI fails with clear error if intent space is down
- [x] Agent connects to intent space on boot, scans project sub-space + root
- [x] Agent receives echoed intents in real-time
- [x] Agent persists cursor and resumes from it on restart
- [x] Agent degrades to cached intents when space disconnects mid-session
- [x] Agent attempts reconnection with backoff
- [x] Agent mirrors intents to PromiseLog via `ensureIntent()` before promising
- [x] Agent filters: service intents, self-generated, fulfilled, already-acted-on
- [x] Supervisor does not manage intent space lifecycle
- [x] Supervisor warns if intent space socket missing
- [x] `createIntent()` accepts `parentId` parameter
- [x] Intent space preserves full payload (including `criteria`) through round-trip
- [x] All existing loop tests pass (they use PromiseLog directly — unaffected)
- [x] Import paths updated: `@differ/itp/src/`, `@differ/intent-space/src/client.ts`

## Files Modified

| File | Action |
|------|--------|
| `itp/src/protocol.ts` | Add `parentId` param to `createIntent()` |
| `intent-space/src/store.ts` | Add `payload` column, persist full payload |
| `intent-space/src/types.ts` | Add optional `payload` to `StoredIntent` |
| `intent-space/src/space.ts` | Pass payload through to echo and scan |
| `loop/src/loop/agent.ts` | Rewrite observe loop: IntentSpaceClient, scan, echo, cache, cursor |
| `loop/src/loop/cli.ts` | Post to space, derive parentId from --target, remove PromiseLog write |
| `loop/src/loop/supervisor.ts` | Drop intent space lifecycle, add socket warning |
| `loop/src/loop/promise-log.ts` | Add `agent_cursors` table, keep `ensureIntent()`/`isIntentFulfilled()` |
| `loop/src/loop/work.ts` | Import path fix only |
| `loop/package.json` | Add `@differ/intent-space` and `@differ/itp` file deps |
| `loop/scripts/test-helpers.sh` | Import path fixes |
| `loop/scripts/test-negative.sh` | Import path fixes |
| `loop/src/itp/` (delete) | Replaced by shared `@differ/itp` package |

## Dependencies & Risks

- **Intent space must be running** for the CLI to post. This is a behavior change — today the CLI is self-contained. Mitigated by a clear error message.
- **`differ status` becomes incomplete** until it queries the space. Acceptable for now.
- **Schema migration** for intent space (add `payload` column). No data migration needed — existing intents get `'{}'` default.
- **Working tree diff must be largely rewritten**, not patched. The old API surface is completely different.

## References

- [Brainstorm: Loop Intent Space Wiring](../brainstorms/2026-03-09-loop-intent-space-wiring-brainstorm.md)
- [Protocol Redesign](../solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
- [Observe Before Act](../solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md)
- [Echo Broadcast Safety](../solutions/architecture-decisions/echo-broadcast-safety-validation-IntentSpace-20260309.md)
- [INTENT-SPACE.md](../../intent-space/INTENT-SPACE.md) — Protocol contract and eight invariants
