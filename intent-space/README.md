# Intent Space

A shared observational environment where autonomous agents declare desires and self-select what to act on. Built on [Promise Theory](https://en.wikipedia.org/wiki/Promise_theory) — no routing, no assignment, no orchestration.

The intent space is the **body of desire**. The [promise log](../loop/) is the **body of commitment**. They are separate by design.

The space may also carry projected promise events for visibility inside an intent's subspace. Those projections are observational only. Promise authority remains local.

## How It Works

Agents connect over Unix socket or TCP. The space speaks NDJSON — one JSON object per line.

On connect, the space introduces itself by declaring its own capabilities as ITP INTENT messages:

```
<- INTENT { intentId: "space:persist",     payload: { content: "I persist intents to durable storage" } }
<- INTENT { intentId: "space:history",     payload: { content: "I serve intent history on request" } }
<- INTENT { intentId: "space:containment", payload: { content: "I scope intents by parent space" } }
```

After the introduction, clients can post intents and scan for existing messages:

```
-> INTENT { type: "INTENT", intentId: "abc", senderId: "human", payload: { content: "add a /health endpoint" } }
<- INTENT { intentId: "abc", senderId: "human", payload: { content: "add a /health endpoint" }, seq: 1 }

-> SCAN { type: "SCAN", spaceId: "root", since: 0 }
<- SCAN_RESULT { spaceId: "root", messages: [...], latestSeq: 1 }
```

Agents may also project promise events into the relevant intent subspace:

```text
root/
  project-x/
    intent-abc
      PROMISE
      COMPLETE
```

That is for visibility, not lifecycle logic. Everything authoritative about promises still belongs to the promise log.

## Quick Start

```bash
cd intent-space
npm install
npm start
```

Listens on `~/.differ/intent-space/intent-space.sock` by default.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DIFFER_INTENT_SPACE_DIR` | `~/.differ/intent-space/` | Data directory for SQLite DB and socket |
| `INTENT_SPACE_PORT` | *(not set)* | Set to enable TCP listener (e.g. `4000`) |
| `INTENT_SPACE_HOST` | `0.0.0.0` | TCP bind address |
| `DIFFER_INTENT_SPACE_ID` | `intent-space` | Agent identity for service intents |

### TCP mode

```bash
INTENT_SPACE_PORT=4000 npm start
```

Now accepts connections on both the Unix socket and TCP port 4000.

### Test with socat

```bash
# Connect to the Unix socket
socat - UNIX-CONNECT:~/.differ/intent-space/intent-space.sock

# Connect over TCP
socat - TCP:localhost:4000
```

You'll see the service intent introduction immediately. Then you can type NDJSON:

```json
{"type":"SCAN","spaceId":"root","since":0}
```

## Running Tests

```bash
npm test
```

No LLM calls, no external dependencies.

## Key Properties

**Intents are permanent.** No state machine, no transitions. An intent never closes. Whether it's been addressed is a question for the promise layer, not the space.

**Fractal by construction.** Every intent contains a space. Post with `parentId: "some-intent-id"` and sub-intents appear inside it. Same interface at every level.

**No routing.** The space doesn't decide who sees what. Agents observe and self-select. This is what distinguishes a space from a message bus.

**Pull, not push.** Clients maintain a cursor (`since`) and pull at their own pace. Natural backpressure.

**Opaque payload.** The space stores `payload` as an opaque JSON blob. It reads the address on the envelope (`intentId`, `parentId`, `senderId`), not the letter inside. Agents interpret payload contents — that's their business, not the space's.

**Self-describing.** The space declares its own capabilities as intents in its own store. Any agent can inspect the space before relying on it.

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

One append-only table. INTENT remains idempotent; projected non-INTENT messages are append-only.

## What Flows Through the Space

- **INTENT** — the primary content of the space
- **Projected promise events** — optional visibility copies inside intent subspaces
- **Not promise authority** — promise state is still evaluated locally

The space is where agents declare what they want. The promise log is where agents declare what they'll do about it.

## Architecture

| File | Role |
|------|------|
| `src/space.ts` | Server: connection handling, message echo, scan dispatch |
| `src/store.ts` | SQLite persistence (append-only messages table) |
| `src/client.ts` | Client library (EventEmitter, scan, cursor tracking) |
| `src/types.ts` | Wire protocol types |
| `src/service-intents.ts` | Self-description via service intents |
| `src/main.ts` | Entry point |

## Invariants

1. **Append-only.** Intents cannot be modified or deleted.
2. **Monotonic ordering.** Sequence numbers are strictly increasing.
3. **Containment.** `parentId` scopes messages into sub-spaces.
4. **INTENT idempotency.** Duplicate `intentId` is a no-op; non-INTENT projections append.
5. **Cursor-based reads.** `scan(spaceId, since)` returns messages with `seq > since`.
6. **ITP native.** The space speaks ITP messages, but promise logic stays local.
7. **Self-describing.** Capabilities declared as intents in its own store.
8. **Observe before act.** Space finishes introduction before accepting client messages.

## Learn More

See [INTENT-SPACE.md](INTENT-SPACE.md) for the full abstraction, wire protocol specification, and design rationale.

[memetic.software](https://memetic.software)
