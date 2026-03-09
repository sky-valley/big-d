---
title: "feat: Standalone Intent Space Process"
type: feat
status: completed
date: 2026-03-06
---

# Standalone Intent Space Process

## Overview

Separate the intent space into its own standalone process that owns intent persistence and serves intents over a unix domain socket using ITP-native NDJSON framing. Per Promise Theory, the intent space (body of desire) should be an independent autonomous body, not entangled with the promise log (body of commitment).

**This iteration**: Build and test in isolation. No integration with existing CLI/agents.

**Future**: Wire CLI/agents to use it, then expose as a public TCP service.

## Problem Statement

Today, intents and promises are entangled in a single `PromiseLog` class (`src/loop/promise-log.ts`) backed by one SQLite DB. The tightest coupling: `getOpenIntents()` does a `NOT EXISTS` subquery against the `promises` table — the intent space literally cannot answer "what's open?" without consulting promise state. This violates Promise Theory's separation of concerns and blocks the path to a shared intent space accessible from multiple loops or a web UI.

## Proposed Solution

A new process at `src/intent-space/` that:
- Listens on a unix domain socket (`~/.differ/loop/intent-space.sock`)
- Persists intents in its own SQLite DB (`intent-space.db`)
- Speaks ITP natively — clients send `ITPMessage` objects, not HTTP
- Broadcasts new intents to all connected clients
- Sends full intent history to late-joining clients
- Rejects non-INTENT messages

## Technical Approach

### Architecture

```
  Client A ──┐
  Client B ──┼── Unix Domain Socket ── IntentSpace Server ── SQLite DB
  Client C ──┘   (NDJSON framing)      (intent-space.ts)    (intent-space.db)
```

### Wire Protocol (NDJSON over Unix Domain Socket)

Each line is one JSON object terminated by `\n` (LF). Max line length: 1MB.

**Client → Server:**

| Message | Purpose |
|---------|---------|
| `ITPMessage` (type: `'INTENT'`) | Post a new intent. `intentId` required. |
| `{ type: 'QUERY', query: 'ALL_INTENTS', requestId? }` | Query all intents |

**Server → Client:**

| Message | Purpose |
|---------|---------|
| `{ type: 'INTENT_BROADCAST', intent: ITPMessage }` | New intent (sent to ALL clients including sender) |
| `{ type: 'QUERY_RESULT', requestId?, intents: [...] }` | Query response (to requesting client only) |
| `{ type: 'INTENT_HISTORY', intents: [...] }` | Sent on connect (before any broadcasts) |
| `{ type: 'INTENT_SPACE_ERROR', message, requestId? }` | Error (connection stays open) |

**Protocol decisions:**
- Broadcast includes sender (simplest pub-sub model)
- History sent synchronously on connect — Node.js single-thread guarantees no broadcast interleaves before history completes
- Connection stays open after errors (only malformed JSON with no recovery closes)
- Unknown query types get `INTENT_SPACE_ERROR`
- NDJSON buffering: per-client string buffer, append `data` chunks, split on `\n`, process complete lines, keep tail

### New Files

```
src/intent-space/
  types.ts          — Wire protocol envelope types
  intent-store.ts   — SQLite persistence
  intent-space.ts   — Socket server
  intent-client.ts  — Client library
  main.ts           — Process entry point
scripts/
  test-intent-space.sh  — Standalone tests (no LLM)
```

### Implementation Phases

#### Phase 1: Types + Store

- [x] **`src/intent-space/types.ts`** — `ClientMessage`, `ServerMessage`, `IntentBroadcast`, `IntentQuery`, `IntentQueryResult`, `IntentHistory`, `IntentSpaceError`, `StoredIntentRecord`
  - Import `ITPMessage` from `../itp/types.ts`
  - Note: `types.ts` has existing `SpaceMessage`/`SpaceHistory` types (lines 102-134) but those are broader — intent space types are intentionally focused

- [x] **`src/intent-space/intent-store.ts`** — SQLite persistence
  - Follow `promise-log.ts` patterns: WAL mode, `busy_timeout = 5000`, `better-sqlite3`
  - Respect `DIFFER_DB_DIR` env var (`process.env.DIFFER_DB_DIR ?? join(homedir(), '.differ', 'loop')`)
  - DB path: `$DIFFER_DB_DIR/intent-space.db`
  - Schema:
    ```sql
    CREATE TABLE IF NOT EXISTS intents (
      intent_id   TEXT PRIMARY KEY,
      sender_id   TEXT NOT NULL,
      content     TEXT NOT NULL,
      criteria    TEXT,
      target_hint TEXT,
      timestamp   INTEGER NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS messages (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL CHECK (type = 'INTENT'),
      intent_id  TEXT NOT NULL,
      sender_id  TEXT NOT NULL,
      timestamp  INTEGER NOT NULL,
      payload    TEXT NOT NULL DEFAULT '{}'
    );
    ```
  - API: `post(msg)` (validates `type === 'INTENT'`, transactional insert into both tables), `getAllIntents()`, `getLatestSeq()`, `close()`

#### Phase 2: Socket Server

- [x] **`src/intent-space/intent-space.ts`** — `IntentSpace` class
  - Uses Node built-in `net` module (no new npm dependency)
  - Socket path: `join(DIFFER_DB_DIR, 'intent-space.sock')` — respects `DIFFER_DB_DIR` for test isolation
  - **Startup**: Check for existing socket file. Try `net.connect()` — if ECONNREFUSED, stale → unlink. If connects, another process alive → log error, exit(1). If no file, proceed.
  - **Connection management**: `Set<ClientConnection>` with per-client NDJSON buffer
  - **On connect**: Send `INTENT_HISTORY` with all intents, add to set
  - **On INTENT**: Validate `intentId` present, persist, broadcast to ALL clients
  - **On QUERY**: Respond to requesting client only. Unknown query type → error.
  - **On non-INTENT ITP**: Return `INTENT_SPACE_ERROR`, keep connection open
  - **On malformed JSON**: Return error, keep connection open
  - **On client disconnect**: Remove from set, handle write errors on dead sockets
  - **Graceful shutdown** (SIGTERM/SIGINT): Destroy all sockets, close DB, unlink socket file
  - API: `start(): Promise<void>`, `stop(): Promise<void>`, `clientCount`, `socketPath`

#### Phase 3: Client Library

- [x] **`src/intent-space/intent-client.ts`** — `IntentSpaceClient extends EventEmitter`
  - Uses Node built-in `net` and `events` modules
  - NDJSON line buffer on read side (same pattern as server)
  - `connect(): Promise<void>` — resolves when connected
  - `disconnect(): void` — no auto-reconnect (caller's responsibility)
  - `postIntent(msg: ITPMessage): void` — write NDJSON line
  - `queryIntents(): Promise<StoredIntentRecord[]>` — generates `requestId` (UUID), sends QUERY, awaits matching `QUERY_RESULT` with 5s timeout
  - Events: `'intent'` (IntentBroadcast), `'history'` (IntentHistory), `'error'` (IntentSpaceError), `'disconnect'`

#### Phase 4: Entry Point + Tests

- [x] **`src/intent-space/main.ts`** — thin wrapper: create IntentSpace, handle signals, start
- [x] **`package.json`** — add `"intent-space": "tsx src/intent-space/main.ts"`
- [x] **`scripts/test-intent-space.sh`** — source `test-helpers.sh`, use `setup_test_db` for isolation
  - Tests use both raw `node -e` + `net` module (wire-level) and `IntentSpaceClient` (library-level)
  - Test cases:
    1. Start and stop — socket created, clean shutdown removes it
    2. Post and broadcast — two clients, post from one, other receives
    3. History on connect — post intent, late-join client gets history
    4. Query all intents — post two, query, verify both returned
    5. Reject non-INTENT — send PROMISE, verify error response
    6. Stale socket cleanup — create stale file, verify process starts
    7. Concurrent connections — three clients, all receive all broadcasts
    8. Client disconnect — server doesn't crash broadcasting to dead client
    9. Partial NDJSON — send intent across two writes, verify correct parsing
    10. Unknown query type — send bad query, verify error response
- [x] **`scripts/test-all.sh`** — add intent space tests to protocol tier (no LLM required)

## Key Files to Reference

| File | Reuse |
|------|-------|
| `src/itp/types.ts` | `ITPMessage`, `ITPPayload` types — import directly |
| `src/itp/protocol.ts` | `createIntent()` factory — reuse in tests |
| `src/loop/promise-log.ts:22` | `DIFFER_DB_DIR` env var pattern — copy for socket path |
| `src/loop/promise-log.ts:120-130` | SQLite constructor pattern (WAL, busy_timeout, schema) |
| `src/loop/supervisor.ts:56-65` | PID file / stale detection pattern |
| `scripts/test-helpers.sh` | `setup_test_db`, `step`, `pass`, assertion helpers |

## Known Limitations (Intentional)

- No HMAC verification — deferred to integration phase
- No auto-reconnect in client library — caller's responsibility
- NDJSON framing only — switch to length-prefixed when binary payloads needed (documented migration point)
- No max connection limit — add if needed
- No backpressure handling — if slow client blocks write, destroy it

## What This Does NOT Touch

- `src/itp/types.ts` — no modifications
- `src/itp/protocol.ts` — no modifications
- `src/loop/promise-log.ts` — no modifications
- `src/loop/agent.ts` — no modifications (integration is a future phase)
- `src/loop/cli.ts` — no modifications (integration is a future phase)

## Verification

1. `bash scripts/test-intent-space.sh` — all 10 test cases pass
2. `npm test` — existing protocol + negative tests still pass, intent space tests included
3. Manual smoke test:
   ```bash
   npm run intent-space &
   # Connect with socat and see NDJSON:
   socat - UNIX-CONNECT:~/.differ/loop/intent-space.sock
   ```
