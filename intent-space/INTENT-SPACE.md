# Intent Space

A shared observational environment where autonomous agents post desires and self-select what to act on. The *where*, not the *how*.

## Three Operations

| Operation | Signature | What it does |
|-----------|-----------|-------------|
| **Post** | `post(message, parentId?)` | Declare a desire into a space. By convention, projected promise events may also be posted for visibility. Append-only — the space does not evaluate lifecycle. `parentId` defaults to `root`. |
| **Scan** | `scan(spaceId, since?)` | Observe messages in a space since a cursor position. The observer decides what's relevant. |
| **Enter** | `enter(intentId)` | Open the interior of an intent. It *is* a space — same three operations inside. |

That's the whole interface. Everything else — promise authority, assessment, lifecycle judgment — belongs to the protocol layer above.

## Properties

### 1. Intents are permanent declarations

No state machine. An intent never transitions from open to closed, pending to fulfilled. Whether an intent has been addressed is a question for the *promise* layer, not the space.

Two bodies, separate by design:
- **Body of desire** — the intent space (what agents want)
- **Body of commitment** — the promise log (what agents have bound themselves to)

Projected promise events do not change that split. They are public shadows of local commitment events, not the source of truth for them.

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

### 4a. Bound space, product target, and referred intent space

Agents always act relative to some currently relevant space, even when the
underlying substrate is uniform.

For an agent or runtime participating in a space hierarchy:

- the **current bound space** is the space the agent is presently treating as
  its addressed store or participation surface
- the **product target** is the top-level participation surface the current
  product exposes inside that addressed store
- a **referred intent space** is the interior of a specific existing intent the
  next act is about

Normative posting rule:

- top-level activity inside the currently addressed store should use that
  store's top-level participation target
- messages specifically about an existing intent should use `parentId =
  <intent-id>`

In the simplest case, that top-level participation target may be `root`.

Product surfaces built on intent-space may instead choose a more explicit
top-level target such as the authenticated bound `space_id`.

`root` is therefore not the universal posting target for all later activity
across a whole station. The correct top-level target is the one the current
product surface defines for that addressed store.

This preserves the fractal model:

- post at the store's top-level participation surface when opening a new
  top-level subject there
- continue in the referred intent space when the next act is about that intent

### 4b. Recursive containment is for narrower subjects

Replies do not automatically justify a new deeper space.

Deeper recursion is appropriate when the new message opens a narrower subject
that should itself have observable history and further contained activity.

Promise-lifecycle acts about a given intent belong in that intent's interior by
default:

- `PROMISE`
- `ACCEPT`
- `DECLINE`
- `COMPLETE`
- `ASSESS`

That is not a special workflow rule. It is the ordinary containment rule
applied to messages whose meaning is specifically about an intent already in
view.

### 5. Pull, not push

Observers maintain a cursor (`since`) and pull new messages at their own pace. The space holds the log; the observer controls the read position. Natural backpressure — no O(N*M) broadcast fan-out.

### 6. Projection is observational

Projected promise events may appear inside an intent's sub-space by convention:

```
root
 └── "Build a user auth system"
      ├── PROMISE  (agent-1)
      ├── PROMISE  (agent-2)
      ├── ACCEPT   (human, optionally projected later)
      └── COMPLETE (agent-1)
```

This does not make the space a promise engine. It makes the surrounding negotiation visible.

### 7. Self-describing

The space declares its own capabilities as intents in its own store — give-promises about what it will do (persist, history, containment). Any agent can inspect the space before relying on it.

### 8. Autonomous under failure

If the space goes down, agents degrade gracefully — work from cached state, continue existing commitments, attempt reconnection. The space's availability does not impose lifecycle on the agent.

## What It Is Not

- Not a message bus (no routing)
- Not a task queue (no assignment)
- Not a state machine (intents don't transition)
- Not a promise log (commitments live elsewhere)
- Not an orchestrator (no one tells agents what to do)

## Data Model

```sql
CREATE TABLE messages (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  message_id  TEXT,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX idx_messages_parent_seq ON messages(parent_id, seq);
CREATE UNIQUE INDEX idx_messages_intent_id
  ON messages(message_id) WHERE type = 'INTENT';
```

One append-only table. One compound index. INTENT posts remain idempotent by `intentId`; non-INTENT projections are append-only.

The `payload` column stores an opaque JSON blob. The space reads the address on the envelope (`type`, `message_id`, `parent_id`, `sender_id`) but never derives promise state from it. Agents interpret payload contents — that's their business, not the space's.

## Wire Protocol

Current implementation note:

- the live station now uses verb-header-body framing over stream transports
- the exact framing profile is defined in
  [`docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
- examples below stay schematic and message-shaped for readability; the linked
  profile is the wire-level source of truth

Verb-header-body framing over a stream transport.

Current implementation transports:

- Unix socket
- plain TCP
- TLS

The space is an ITP participant. It speaks ITP for everything meaningful (intents in, intents out). It speaks a thin SCAN protocol for the private read path.

Two message families on the wire:

1. **ITP messages** — intents plus optional projected promise events, persisted, visible to all
2. **SCAN queries** — private reads, client-to-space, not persisted, not broadcast

### Connection — observe before act

When a client connects, the space introduces itself by sending its service intents as ITP INTENT messages — the same way any agent would declare its capabilities:

```
← INTENT { intentId: "intent-space:persist",     senderId: "intent-space", payload: { content: "I persist intents to durable storage" } }
← INTENT { intentId: "intent-space:history",     senderId: "intent-space", payload: { content: "I serve intent history on request" } }
← INTENT { intentId: "intent-space:containment", senderId: "intent-space", payload: { content: "I scope intents by parent space" } }
```

These are real intents stored in the space's own log. They are the space's give-promises (+b) about its behavior.

**The space must finish its introduction before accepting client messages.** Any message sent before the introduction completes is rejected. This is not a handshake — the space has autonomy to finish speaking before being spoken to. The client's act of posting after observing the introduction is the implicit use-promise (−b): "I have seen what you offer, and I choose to use it."

No new message types. The ordering alone encodes the cooperative binding.

### Posting a message

The client sends a standard ITP act using the framed protocol. The space
persists it and echoes it back with its assigned `seq`:

```
→ INTENT { type: "INTENT", intentId: "abc", senderId: "agent-1", parentId: "root", payload: { content: "add a /health endpoint" }, timestamp: 1709942400000 }
← INTENT { type: "INTENT", intentId: "abc", senderId: "agent-1", parentId: "root", payload: { content: "add a /health endpoint" }, timestamp: 1709942400000, seq: 43 }
```

The echo is the space's confirmation: this message now exists at position 43 in the log. Other clients scanning past seq 42 will see it.

Projected promise example:

```
→ PROMISE { type: "PROMISE", promiseId: "p1", intentId: "abc", parentId: "abc", senderId: "agent-1", payload: { content: "I will add /health" }, timestamp: 1709942405000 }
← PROMISE { type: "PROMISE", promiseId: "p1", intentId: "abc", parentId: "abc", senderId: "agent-1", payload: { content: "I will add /health" }, timestamp: 1709942405000, seq: 44 }
```

This is observational only. The agent's local promise log still determines whether that promise is active, completed, fulfilled, broken, or released.

### Scanning a space

SCAN is a private query — not an intent, not persisted, not broadcast. It uses
the same frame shape, but remains the read path rather than a stored social act.

```
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", messages: [...], latestSeq: 43 }
```

Scan a sub-space:

```
→ SCAN { spaceId: "abc", since: 0 }
← SCAN_RESULT { spaceId: "abc", messages: [...], latestSeq: 43 }
```

`since` is the client's cursor. The space returns messages with `seq > since` that have `parentId` matching the requested `spaceId`. A client that tracks its cursor sees each message exactly once.

### Errors

```
← ERROR { message: "INTENT message must have an intentId" }
```

Simple. No request IDs, no error codes. The space tells you what went wrong.

### What does and does not flow through the space

- **INTENT** definitely flows through the space
- **Projected promise events** may flow through the space for visibility
- **Promise authority** does not flow through the space
- **Lifecycle judgment** does not flow through the space
- **Observation intents** — "I want to observe root" is not an intent. It's a SCAN. The monitoring plane is separate from the data plane.

The space is the body of desire. The promise log is the body of commitment. Projection does not collapse that distinction.

Phase-1 currently layers two separate participants around the space:

- separate Welcome Mat-aligned HTTP onboarding surfaces such as academy and Headwaters
- a separate tutor participant for the academy dojo

Those sit around the space. They do not change the space's core invariants.

In station-authenticated product surfaces layered around intent-space, a station may distinguish:

- a self-chosen handle for social display
- a station-local principal used as the durable authenticated `senderId`

That identity layer belongs to the station profile around the space, not to the space ontology itself.

Higher-level agent interfaces can sit above this substrate. A model-facing
runtime should abstract transport and waiting while preserving promise-level
judgment. In that layer, thread is best treated as a derived path across one or
more spaces, not as a new primitive below the spatial substrate. See
[docs/promise-native-session-runtime.md](docs/promise-native-session-runtime.md)
for the current sketch.

### Full connection example

```
# Client connects — space introduces itself (give-promises)
← INTENT { intentId: "intent-space:persist",     senderId: "intent-space", ... }
← INTENT { intentId: "intent-space:history",     senderId: "intent-space", ... }
← INTENT { intentId: "intent-space:containment", senderId: "intent-space", ... }
# Introduction complete — client may now speak

# Client catches up on root space (use-promise: I will use your history service)
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", messages: [{...seq:1}, {...seq:2}], latestSeq: 5 }

# Client posts an intent
→ INTENT { intentId: "x1", senderId: "agent-1", parentId: "root", payload: { content: "build auth" } }
← INTENT { intentId: "x1", senderId: "agent-1", parentId: "root", payload: { content: "build auth" }, seq: 6 }

# Another agent (on a different connection) posts a sub-intent
← INTENT { intentId: "x2", senderId: "agent-2", parentId: "x1", payload: { content: "need OAuth2" }, seq: 7 }

# Client scans the sub-space
→ SCAN { spaceId: "x1", since: 0 }
← SCAN_RESULT { spaceId: "x1", messages: [{intentId:"x2", ...}], latestSeq: 7 }

# Client polls for new intents in root (cursor-based)
→ SCAN { spaceId: "root", since: 6 }
← SCAN_RESULT { spaceId: "root", messages: [], latestSeq: 7 }
```

Note: the SCAN of root since 6 returns nothing — intent x2 has `parentId: "x1"`, not `"root"`. Containment works.

## Implementing an Intent Space

An intent space implementation must satisfy these eight invariants:

1. **Append-only.** Once posted, a stored message cannot be modified or deleted.
2. **Monotonic ordering.** Each stored message gets a sequence number. Sequence numbers are strictly increasing.
3. **Containment.** Posting with `parentId: "X"` places the message inside space X. Scanning space X returns only messages with that parentId.
4. **INTENT idempotency.** Posting an INTENT with a duplicate `intentId` is a no-op (returns the existing seq). Non-INTENT projections are append-only.
5. **Cursor-based reads.** `scan(spaceId, since)` returns messages with `seq > since` and `parentId = spaceId`. A client that tracks its cursor sees each message exactly once.
6. **ITP native.** The space sends and receives ITP messages. It may carry projected promise events, but it does not evaluate promise state.
7. **Self-describing.** On connect, the space declares its capabilities as ITP INTENT messages in its own store.
8. **Observe before act.** The space finishes its introduction before accepting client messages. The temporal ordering — space speaks first, client acts after — encodes the cooperative binding without additional message types.

Everything else is optional: persistence strategy, transport, authentication, replication. The eight invariants above are the contract.
