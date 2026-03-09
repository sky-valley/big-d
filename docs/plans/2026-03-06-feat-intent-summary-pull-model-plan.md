---
title: "feat: Replace intent history push with summary + pull model"
type: feat
status: active
date: 2026-03-06
---

# feat: Replace Intent History Push with Summary + Pull Model

## Context

The intent space currently pushes `INTENT_HISTORY` (all intents) to every connecting client. Per Promise Theory, this is an imposition — a unilateral +b with no matching -b. The observer decides what to observe, not the publisher.

**Revised promise:** "I intend to make my history available to those who ask" (pull), not "I intend to push full history" (imposition).

**Brainstorm:** `docs/brainstorms/2026-03-06-intent-history-scalability-brainstorm.md` (status: complete, no open questions)

**Scope note:** `agent.ts` does NOT use `IntentSpaceClient` — it uses the promise log directly. No changes needed outside `src/intent-space/` and tests.

## Proposed Solution

On connect, the server pushes a lightweight `INTENT_SUMMARY` (service intents + count + latestSeq). The client autonomously decides what history to pull via explicit queries: `INTENTS_SINCE` (seq-based delta), `RECENT_INTENTS` (count-limited), or `ALL_INTENTS` (explicit opt-in). Broadcasts continue unchanged for new intents but now include `seq` for client-side watermark tracking.

## Changes

### 1. Wire protocol types

**File:** `src/intent-space/types.ts`

Add `seq` to `StoredIntentRecord` (optional — present in query results and summaries, absent in legacy contexts):
```typescript
export interface StoredIntentRecord {
  intentId: string;
  senderId: string;
  content: string;
  criteria?: string;
  targetHint?: string;
  timestamp: number;
  seq?: number;  // monotonic position in the message log
}
```

Remove `IntentHistory`, add `IntentSummary`:
```typescript
export interface IntentSummary {
  type: 'INTENT_SUMMARY';
  serviceIntents: StoredIntentRecord[];  // bounded identity set (4 items)
  totalIntents: number;
  latestSeq: number;
}
```

Add `seq` to `IntentBroadcast` (enables client watermark tracking without querying):
```typescript
export interface IntentBroadcast {
  type: 'INTENT_BROADCAST';
  intent: ITPMessage;
  seq: number;
}
```

Expand `IntentQuery`:
```typescript
export interface IntentQuery {
  type: 'QUERY';
  query: 'ALL_INTENTS' | 'INTENTS_SINCE' | 'RECENT_INTENTS';
  requestId?: string;
  seq?: number;     // for INTENTS_SINCE
  limit?: number;   // for RECENT_INTENTS
}
```

Add `latestSeq` to `IntentQueryResult`:
```typescript
export interface IntentQueryResult {
  type: 'QUERY_RESULT';
  requestId?: string;
  intents: StoredIntentRecord[];
  latestSeq: number;
}
```

Update `ServerMessage` union: replace `IntentHistory` with `IntentSummary`.

### 2. Store queries

**File:** `src/intent-space/intent-store.ts`

**Change `post()` to return seq** — capture `lastInsertRowid` from the messages INSERT via better-sqlite3's `.run()` return value. Return type changes from `void` to `number`.

**Change `rowToIntent()`** — accept optional seq parameter or read it from the row when present.

**Add four methods:**

- `getIntentsSince(seq: number): StoredIntentRecord[]` — `SELECT i.*, m.seq FROM intents i JOIN messages m ON i.intent_id = m.intent_id WHERE m.seq > ? ORDER BY m.seq ASC`
- `getRecentIntents(limit: number): StoredIntentRecord[]` — `SELECT i.*, m.seq FROM intents i JOIN messages m ON i.intent_id = m.intent_id ORDER BY m.seq DESC LIMIT ?`, then reverse for chronological order
- `getIntentCount(): number` — `SELECT COUNT(*) FROM intents`
- `getServiceIntents(agentId: string): StoredIntentRecord[]` — `SELECT i.*, m.seq FROM intents i JOIN messages m ON i.intent_id = m.intent_id WHERE i.sender_id = ? ORDER BY m.seq ASC`

**Change `getAllIntents()`** ordering from `ORDER BY timestamp` to join with messages + `ORDER BY m.seq ASC` for consistency across all queries.

Existing `getLatestSeq()` and `hasIntent()` unchanged.

### 3. Server: send summary on connect, handle new queries

**File:** `src/intent-space/intent-space.ts`

**`handleConnection()`** — replace the history push:
```
BEFORE: send INTENT_HISTORY with store.getAllIntents()
AFTER:  send INTENT_SUMMARY with {
  serviceIntents: store.getServiceIntents(this._agentId),
  totalIntents: store.getIntentCount(),
  latestSeq: store.getLatestSeq()
}
```

**`handleIntent()`** — `post()` now returns seq. Pass it to broadcast:
```typescript
const seq = this.store.post(msg);
const broadcast: IntentBroadcast = { type: 'INTENT_BROADCAST', intent: msg, seq };
```

**`handleQuery()`** — add two new cases:
- `INTENTS_SINCE`: `store.getIntentsSince(msg.seq ?? 0)` + `latestSeq`. `seq=0` returns all. `seq > latestSeq` returns empty.
- `RECENT_INTENTS`: `store.getRecentIntents(msg.limit ?? 100)` + `latestSeq`. `limit=0` returns empty.
- `ALL_INTENTS`: unchanged but now includes `latestSeq` in response.

All `QUERY_RESULT` responses include `latestSeq` unconditionally.

Update imports: `IntentHistory` → `IntentSummary`.

**Known limitation (race condition):** Between reading `latestSeq` for the summary and the client registering for broadcasts, a new intent could arrive. The window is microseconds within a single synchronous `handleConnection` call. The client catches up via `INTENTS_SINCE` on its next sync. Accepted.

### 4. Client: handle summary, add query methods, track seq

**File:** `src/intent-space/intent-client.ts`

- Add `private latestSeq = 0` field
- Add `get lastKnownSeq(): number` public getter (callers can persist across restarts)
- Handle `INTENT_SUMMARY` in `handleMessage()`:
  - Store service intents in cache
  - Store `latestSeq`
  - Emit `'summary'` event (replaces `'history'`)
- Handle `INTENT_BROADCAST` with seq:
  - Update `latestSeq` from broadcast seq
  - Deduplicate: only push to cache if intentId not already present
- Handle `QUERY_RESULT`:
  - Update `latestSeq` from response
  - Append unique intents to cache (deduplicate by `intentId`)
- Add `queryIntentsSince(seq: number): Promise<StoredIntentRecord[]>` — sends `{ type: 'QUERY', query: 'INTENTS_SINCE', seq, requestId }`
- Add `queryRecentIntents(limit?: number): Promise<StoredIntentRecord[]>` — sends `{ type: 'QUERY', query: 'RECENT_INTENTS', limit: limit ?? 100, requestId }`
- **Seq regression detection:** On `INTENT_SUMMARY`, if `summary.latestSeq < this.latestSeq`, invalidate cache (server DB was reset). Reset `latestSeq` and `cachedIntents` to summary data.
- Client does NOT auto-query on connect — caller decides strategy (PT: observer scopes itself)

Remove `INTENT_HISTORY` handling. Update imports.

### 5. Update service intent content

**File:** `src/intent-space/service-intents.ts`

Keep the key `'history'` (avoids orphaned DB rows, avoids changing the deterministic intentId `intent-space:history`). Update content only:
```
BEFORE: content: 'I intend to provide full intent history on every new connection'
AFTER:  content: 'I intend to make my history available to those who ask'
```

The intentId remains `intent-space:history`. Existing DB entries get updated naturally on restart via `hasIntent()` check (the intent already exists, so it won't be re-posted — the old content persists in existing DBs, which is fine since it's a declaration of the same service with evolved behavior).

### 6. Update tests

**File:** `scripts/test-intent-space.sh`

**Existing tests updated:**
- **Tests 2, 3, 4, 5, 7, 8, 9, 10**: Wait for `INTENT_SUMMARY` instead of `INTENT_HISTORY` as ready signal.
- **Test 3 (history on connect)**: Rename to "summary on connect". Post intent, reconnect, get summary (totalIntents includes it), then `QUERY RECENT_INTENTS limit=1` to verify it's there.
- **Test 4 (query all intents)**: `INTENT_SUMMARY` as ready signal. Verify `latestSeq` in QUERY_RESULT.
- **Test 7 (concurrent)**: Wait for `INTENT_SUMMARY` instead of `INTENT_HISTORY` for readyCount.
- **Test 11 (service intents)**: Check `parsed.serviceIntents` array in `INTENT_SUMMARY` instead of filtering `parsed.intents` from INTENT_HISTORY. Expected IDs unchanged: `['intent-space:broadcast', 'intent-space:history', 'intent-space:persist', 'intent-space:query']`.
- **Test 12 (idempotent restart)**: Same — check summary's `serviceIntents` + `totalIntents` includes the human intent.
- **Test 13 (cache)**: Update for `'summary'` event, `getCachedIntents()` returns service intents from summary.

**New tests:**
- **Test 14: INTENTS_SINCE query** — post 3 intents, note `latestSeq` from summary, post 2 more, reconnect, `INTENTS_SINCE` with old seq, verify only 2 returned + `latestSeq` advanced.
- **Test 15: RECENT_INTENTS query** — post 5 intents, `RECENT_INTENTS limit=2`, verify exactly 2 (most recent) + chronological order.
- **Test 16: latestSeq in broadcast** — post intent, verify broadcast includes `seq` field, verify it matches `latestSeq` from a subsequent query.
- **Test 17: INTENTS_SINCE seq=0** — returns all intents (edge case: equivalent to ALL_INTENTS).
- **Test 18: INTENTS_SINCE seq > latestSeq** — returns empty array, not an error.

## Acceptance Criteria

- [ ] On connect, server sends `INTENT_SUMMARY` (not full history)
- [ ] `INTENT_SUMMARY` contains `serviceIntents`, `totalIntents`, `latestSeq`
- [ ] `INTENTS_SINCE` query returns only intents with `seq > given`
- [ ] `RECENT_INTENTS` query returns last N intents in chronological order
- [ ] `ALL_INTENTS` query continues to work, now includes `latestSeq`
- [ ] `INTENT_BROADCAST` includes `seq` number
- [ ] Client tracks `latestSeq` from summaries, broadcasts, and query results
- [ ] Client deduplicates cache by `intentId`
- [ ] Client detects seq regression (server DB reset) and invalidates cache
- [ ] All 18 tests pass
- [ ] Existing `test-protocol.sh` and `test-negative.sh` unaffected

## Files Modified

| File | Change |
|------|--------|
| `src/intent-space/types.ts` | Replace IntentHistory with IntentSummary, add seq to StoredIntentRecord + IntentBroadcast, expand IntentQuery, add latestSeq to IntentQueryResult |
| `src/intent-space/intent-store.ts` | `post()` returns seq, add getIntentsSince(), getRecentIntents(), getIntentCount(), getServiceIntents(), switch getAllIntents() to seq ordering |
| `src/intent-space/intent-space.ts` | Send summary on connect, include seq in broadcasts, handle new query types, latestSeq in all responses |
| `src/intent-space/intent-client.ts` | Handle INTENT_SUMMARY, track latestSeq, add query methods, deduplicate cache, detect seq regression |
| `src/intent-space/service-intents.ts` | Update history service intent content wording |
| `scripts/test-intent-space.sh` | Update 10 existing tests for INTENT_SUMMARY, add 5 new tests (14-18) |

## Verification

1. `bash scripts/test-intent-space.sh` — all 18 tests pass
2. `bash scripts/test-protocol.sh && bash scripts/test-negative.sh` — existing tests unaffected
3. Manual: `npm run intent-space`, connect with socat, see `INTENT_SUMMARY` (not full history)

## References

- Brainstorm: `docs/brainstorms/2026-03-06-intent-history-scalability-brainstorm.md`
- Prior PT participant work: `docs/solutions/integration-issues/intent-space-promise-theory-participant.md`
- PT architecture patterns: `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md`
