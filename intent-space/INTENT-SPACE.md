# Intent Space

A shared observational environment where autonomous agents post desires and self-select what to act on. The *where*, not the *how*.

## Three Operations

| Operation | Signature | What it does |
|-----------|-----------|-------------|
| **Post** | `post(content, parentId?)` | Declare a desire into a space. Append-only — intents never transition, never close. `parentId` defaults to `root`. |
| **Scan** | `scan(spaceId, since?)` | Observe intents in a space since a cursor position. The observer decides what's relevant. |
| **Enter** | `enter(intentId)` | Open the interior of an intent. It *is* a space — same three operations inside. |

That's the whole interface. Everything else — promises, assessment, lifecycle — belongs to the protocol layer above.

## Properties

### 1. Intents are permanent declarations

No state machine. An intent never transitions from open to closed, pending to fulfilled. Whether an intent has been addressed is a question for the *promise* layer, not the space.

Two bodies, separate by design:
- **Body of desire** — the intent space (what agents want)
- **Body of commitment** — the promise log (what agents have bound themselves to)

### 2. Fractal by construction

Every intent contains a space. Post into that space and sub-intents appear. The tree emerges from usage — it is never declared, configured, or built. Same interface at every level.

```
root
 ├── "Build a user auth system"
 │    ├── "Need OAuth2 integration"
 │    │    └── "Which provider?"
 │    └── "Database schema for users"
 └── "Design the landing page"
      └── "Mobile responsive layout"
```

Each level is the same three operations. The fractal property is not a feature — it is a consequence of the design.

### 3. No routing, no assignment

The space does not decide who sees what. Agents observe and self-select. Scoping is the observer's prerogative. This is what distinguishes a space from a message bus.

### 4. Topology through containment, not routing

The `parentId` field creates dimensional structure. Agents declare their neighborhood of relevance ("I observe intents in *this* sub-space") and the space respects that as a containment boundary, not a directive.

The post office delivers to the neighborhood. Residents decide which letters to open.

This is how broadcast scales without becoming imposition.

### 5. Pull, not push

Observers maintain a cursor (`since`) and pull new intents at their own pace. The space holds the log; the observer controls the read position. Natural backpressure — no O(N*M) broadcast fan-out.

### 6. Self-describing

The space declares its own capabilities as intents in its own store — give-promises about what it will do (persist, history, containment). Any agent can inspect the space before relying on it.

### 7. Autonomous under failure

If the space goes down, agents degrade gracefully — work from cached state, continue existing commitments, attempt reconnection. The space's availability does not impose lifecycle on the agent.

## What It Is Not

- Not a message bus (no routing)
- Not a task queue (no assignment)
- Not a state machine (intents don't transition)
- Not a promise log (commitments live elsewhere)
- Not an orchestrator (no one tells agents what to do)

## Data Model

```sql
CREATE TABLE intents (
  intent_id   TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX idx_intents_parent_seq ON intents(parent_id, seq);
```

One table. One compound index. That's the whole data model.

The `payload` column stores an opaque JSON blob. The space reads the address on the envelope (`intent_id`, `parent_id`, `sender_id`) but never opens the letter. Agents interpret `payload` contents — that's their business, not the space's.

## Wire Protocol

NDJSON over any stream transport (Unix socket, TCP, WebSocket). One JSON object per line.

The space is an ITP participant. It speaks ITP for everything meaningful (intents in, intents out). It speaks a thin SCAN protocol for the private read path.

Two message families on the wire:

1. **ITP INTENT messages** — semantic content, persisted, visible to all
2. **SCAN queries** — private reads, client-to-space, not persisted, not broadcast

### Connection — observe before act

When a client connects, the space introduces itself by sending its service intents as ITP INTENT messages — the same way any agent would declare its capabilities:

```
← INTENT { intentId: "space:persist",     senderId: "intent-space", payload: { content: "I persist intents to durable storage" } }
← INTENT { intentId: "space:history",     senderId: "intent-space", payload: { content: "I serve intent history on request" } }
← INTENT { intentId: "space:containment", senderId: "intent-space", payload: { content: "I scope intents by parent space" } }
```

These are real intents stored in the space's own log. They are the space's give-promises (+b) about its behavior.

**The space must finish its introduction before accepting client messages.** Any message sent before the introduction completes is rejected. This is not a handshake — the space has autonomy to finish speaking before being spoken to. The client's act of posting after observing the introduction is the implicit use-promise (−b): "I have seen what you offer, and I choose to use it."

No new message types. The ordering alone encodes the cooperative binding.

### Posting an intent

The client sends a standard ITP INTENT message. The space persists it and echoes it back with its assigned `seq`:

```
→ INTENT { type: "INTENT", intentId: "abc", senderId: "agent-1", parentId: "root", payload: { content: "add a /health endpoint" }, timestamp: 1709942400000 }
← INTENT { type: "INTENT", intentId: "abc", senderId: "agent-1", parentId: "root", payload: { content: "add a /health endpoint" }, timestamp: 1709942400000, seq: 43 }
```

The echo is the space's confirmation: this intent now exists at position 43 in the log. Other clients scanning past seq 42 will see it.

### Scanning a space

SCAN is a private query — not an intent, not persisted, not broadcast. It's the read path.

```
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", intents: [...], latestSeq: 43 }
```

Scan a sub-space:

```
→ SCAN { spaceId: "abc", since: 0 }
← SCAN_RESULT { spaceId: "abc", intents: [...], latestSeq: 43 }
```

`since` is the client's cursor. The space returns intents with `seq > since` that have `parentId` matching the requested `spaceId`. A client that tracks its cursor sees each intent exactly once.

### Errors

```
← ERROR { message: "INTENT message must have an intentId" }
```

Simple. No request IDs, no error codes. The space tells you what went wrong.

### What does NOT flow through the space

- **PROMISE** — commitments live in the promise log
- **ACCEPT** — cooperative binding happens in the promise log
- **COMPLETE** — completion claims go to the promise log
- **ASSESS** — assessment happens in the promise log
- **Observation intents** — "I want to observe root" is not an intent. It's a SCAN. The monitoring plane is separate from the data plane.

The space is the body of desire. The promise log is the body of commitment. They do not mix.

### Full connection example

```
# Client connects — space introduces itself (give-promises)
← INTENT { intentId: "space:persist",     senderId: "intent-space", ... }
← INTENT { intentId: "space:history",     senderId: "intent-space", ... }
← INTENT { intentId: "space:containment", senderId: "intent-space", ... }
# Introduction complete — client may now speak

# Client catches up on root space (use-promise: I will use your history service)
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", intents: [{...seq:1}, {...seq:2}], latestSeq: 5 }

# Client posts an intent
→ INTENT { intentId: "x1", senderId: "agent-1", parentId: "root", payload: { content: "build auth" } }
← INTENT { intentId: "x1", senderId: "agent-1", parentId: "root", payload: { content: "build auth" }, seq: 6 }

# Another agent (on a different connection) posts a sub-intent
← INTENT { intentId: "x2", senderId: "agent-2", parentId: "x1", payload: { content: "need OAuth2" }, seq: 7 }

# Client scans the sub-space
→ SCAN { spaceId: "x1", since: 0 }
← SCAN_RESULT { spaceId: "x1", intents: [{intentId:"x2", ...}], latestSeq: 7 }

# Client polls for new intents in root (cursor-based)
→ SCAN { spaceId: "root", since: 6 }
← SCAN_RESULT { spaceId: "root", intents: [], latestSeq: 7 }
```

Note: the SCAN of root since 6 returns nothing — intent x2 has `parentId: "x1"`, not `"root"`. Containment works.

## Implementing an Intent Space

An intent space implementation must satisfy these eight invariants:

1. **Append-only.** Once posted, an intent cannot be modified or deleted.
2. **Monotonic ordering.** Each intent gets a sequence number. Sequence numbers are strictly increasing.
3. **Containment.** Posting with `parentId: "X"` places the intent inside space X. Scanning space X returns only intents with that parentId.
4. **Idempotent posts.** Posting an intent with a duplicate `intentId` is a no-op (returns the existing seq).
5. **Cursor-based reads.** `scan(spaceId, since)` returns intents with `seq > since` and `parentId = spaceId`. A client that tracks its cursor sees each intent exactly once.
6. **ITP native.** The space sends and receives ITP INTENT messages. It does not know about promises, acceptance, completion, or assessment.
7. **Self-describing.** On connect, the space declares its capabilities as ITP INTENT messages in its own store.
8. **Observe before act.** The space finishes its introduction before accepting client messages. The temporal ordering — space speaks first, client acts after — encodes the cooperative binding without additional message types.

Everything else is optional: persistence strategy, transport, authentication, replication. The seven invariants above are the contract.
