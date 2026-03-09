---
module: intent-space
date: 2026-03-09
problem_type: architecture_issue
component: server_protocol
symptoms:
  - "Ad-hoc wire protocol with 6 bespoke message types outside ITP"
  - "Intent space not a true ITP participant"
  - "Flat schema with no parentId — no fractal containment"
  - "Push-based broadcast with O(N*M) scaling"
  - "Separate protocol for queries and errors alongside ITP"
root_cause: intent space evolved as a utility service with its own protocol rather than being designed as a first-class ITP participant
resolution_type: redesign
severity: high
tags:
  - promise-theory
  - itp
  - wire-protocol
  - fractal-containment
  - pull-model
  - separation-of-concerns
  - data-plane-vs-monitoring-plane
---

# Protocol Sprawl & Missing Fractal Containment in Intent Space

## Problem

The intent space had an ad-hoc wire protocol running alongside ITP. Six bespoke message types (`INTENT_BROADCAST`, `INTENT_SUMMARY`, `QUERY_RESULT`, `INTENT_SPACE_ERROR`, `IntentQuery`, `ClientMessage`/`ServerMessage` unions) created a dual-protocol system. The space was not a true ITP participant — it sat outside the protocol it was meant to serve. The schema was flat (no `parentId`), preventing fractal containment. Push-based broadcast scaled at O(N*M) — every intent echoed to every client on every post.

## Investigation

Consulted two expert perspectives:

**Jeff Dean (distributed systems):** Broadcast O(N*M) scaling, SQLite single-writer ceiling, no backpressure, `ALL_INTENTS` query as a time bomb (full table scan, no pagination), fractal structure trapped in a browser demo — "get it into the server."

**Mark Burgess (Promise Theory):** "Intent" doing double duty as both desires and service give-promises, flat topology (zero-dimensional with no containment), agent lifecycle coupling as an imposition on autonomy, intent duplication between intent space and promise log creating two sources of truth.

Both converged on the same conclusion: the fractal/recursive structure is the key insight, and it needs to be real — not just a browser demo. Adding `parentId` to the server schema solves both the scaling concern (partitioned reads) and the topology concern (dimensional structure through containment).

## Solution

Deleted all prior code and rebuilt around two message families:

1. **ITP INTENT messages** — semantic content, persisted to SQLite, echoed to all connected clients with a monotonic `seq` number.
2. **SCAN queries** — private reads from client to space, not persisted, scoped by `spaceId` (which maps to `parentId`) and a `since` cursor.

Key design decisions:

- **Self-describing space**: On connect, the space sends its own service intents as real ITP INTENT messages (persist, history, containment). Stored in its own log with deterministic IDs for idempotence across restarts.
- **Fractal containment via `parentId`**: One table, one compound index (`parent_id, seq`). Any intent can be a sub-space. Scan is always scoped by `spaceId` = `parentId`.
- **Idempotent posts**: Duplicate `intentId` returns the existing `seq` rather than inserting again.
- **Promises rejected**: The space accepts only INTENT and SCAN. Any other message type gets an ERROR. Body of desire only.
- **Pull-based reads**: Clients control when they scan. The space still echoes new intents to all connected clients, but history retrieval is pull-based via SCAN with cursor.
- **Observe before act**: The space finishes its introduction before accepting client messages. Temporal ordering encodes cooperative binding — no new message types needed. The client's act of posting after observing is the implicit use-promise.
- **Eight invariants codified**: append-only, monotonic seq, containment, idempotent posts, cursor-based reads, ITP native, self-describing, observe-before-act.

### Wire protocol types

```typescript
export interface StoredIntent {
  intentId: string;
  parentId: string;
  senderId: string;
  content: string;
  seq: number;
  timestamp: number;
}

export interface ScanRequest {
  type: 'SCAN';
  spaceId: string;
  since?: number;
}

export interface ScanResult {
  type: 'SCAN_RESULT';
  spaceId: string;
  intents: StoredIntent[];
  latestSeq: number;
}

export type IntentEcho = ITPMessage & { seq: number };
export type ServerMessage = IntentEcho | ScanResult | SpaceError;
```

### SQLite schema

```sql
CREATE TABLE IF NOT EXISTS intents (
  intent_id   TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  content     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intents_parent_seq ON intents(parent_id, seq);
```

## Prevention

- **Gate new message types on invariant review.** Before adding any wire message type, classify it as either an ITP primitive or a private read operation. If it fits neither family, that's a design smell — meet the need by composing existing primitives.
- **Treat the server as a protocol participant, not plumbing.** The intent space holds its own intents in the same schema it serves to clients. If the server needs to communicate state, it does so via ITP messages attributed to its own agent identity — never via out-of-band types.
- **Enforce "eat your own cooking" for fractal containment.** Any entity that manages sub-intents must itself be an intent in a parent space. If a feature requires nested structure, the schema must already support it before the feature ships.
- **Cap the protocol surface and fail the build if it grows.** Define the canonical message families in one place. A test that counts the families prevents quiet additions.

## Testing Recommendations

- **Protocol conformance test**: enumerate every message type the server can send/receive and assert each belongs to exactly one of the two families (ITP or SCAN).
- **Negative tests for rejected message shapes**: send PROMISE, ACCEPT, COMPLETE, ASSESS and assert ERROR responses.
- **Round-trip self-representation test**: assert the space's service intents are queryable through the same SCAN interface external clients use.
- **Schema snapshot test**: capture message types and table schemas as a snapshot; any diff requires explicit approval.

## Related Issues

- [intent-space-promise-theory-participant.md](../architecture-decisions/intent-space-promise-theory-participant.md) — Service intents as self-description
- [promise-theory-informed-architecture.md](../architecture-decisions/promise-theory-informed-architecture.md) — Promise Theory patterns
- [2026-03-06 intent history scalability brainstorm](../../brainstorms/2026-03-06-intent-history-scalability-brainstorm.md) — Push to pull model
- [2026-03-06 standalone intent space plan](../../plans/2026-03-06-feat-standalone-intent-space-plan.md) — Separation into standalone component
- [2026-03-06 intent summary pull model plan](../../plans/2026-03-06-feat-intent-summary-pull-model-plan.md) — Pull model design
