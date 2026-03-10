---
title: "feat: Project promise events into intent subspaces for visibility"
type: feat
status: active
date: 2026-03-10
---

# feat: Project promise events into intent subspaces for visibility

## Overview

The intent space currently only accepts INTENT messages. Expand it so promise events can be projected into the space for visibility while keeping the Promise Theory split intact:

- the intent space remains the body of desire
- the local promise log remains the body of commitment
- projected promise events are observational, not authoritative

The goal is not to turn the intent space into a promise engine. The goal is to let clients discover that promises are happening around an intent by scanning that intent's subspace.

## Problem Statement

Today the intent space distributes desire, but promise activity is visible only in local SQLite logs. That creates an observability gap:

- agents cannot easily see each other's promises
- monitoring clients and future UIs cannot inspect the promise conversation around an intent
- once agents are no longer co-located, local-only visibility becomes too narrow

What is missing is projection, not central authority.

## Proposed Solution

Promise events may be projected into the intent space after they are written to the local promise log. The projection is append-only and best-effort. It exists so clients can observe a promise conversation in the same subspace where the original coordination began.

The intent space does not become a source of promise truth:

- it stores projected events
- it sequences and echoes them
- it allows scanning by subspace
- it does not evaluate state machines
- it does not determine whether a promise is completed, fulfilled, broken, or released

Authoritative promise logic remains local to the promisor's promise log.

Data flow rule:
1. **Originated locally** → write to local promise log first, then optionally project to the space
2. **Observed in the space** → treat as projection/notification unless and until local authority confirms it

## Technical Approach

### Projection, not unification

This feature does not collapse the intent space and promise log into one substrate.

- The canonical promise event remains the local/logged event.
- The space copy is a projection shaped for discoverability.
- Clients may observe projected events in the space, but should not use the space alone to derive authoritative promise state.

This distinction is especially important for HMAC-signed human gates and for any future reconciliation logic.

### Subspace convention

There is no way to enforce this at the protocol level, but we can adopt a convention:

- promise projection should happen in the subspace of the intent it responds to
- initial coordination already happens in subspaces
- therefore the projected promise conversation should appear there too

Example:

```
root/
  loop/                              <- project subspace
    intent-abc  "add /health"        <- scan loop -> see this
      PROMISE   (agent-1)
      PROMISE   (agent-2)
      ACCEPT    (human)
      COMPLETE  (agent-1)
      ASSESS    (human, pass)
```

Scanning `loop` shows intents. Scanning `intent-abc` shows the projected promise conversation around that intent.

### Canonical vs projected message

The local promise log keeps the canonical event exactly as needed for protocol semantics and state transitions.

The space may receive a projected copy whose containment is shaped for observability. That means:

- containment in the space is a projection concern
- promise semantics remain a local/log concern

For `REVISE`, this matters most. The local/canonical message may preserve lineage semantics required by the promise protocol, while the projected copy may be contained under the intent subspace for visibility. The plan must treat those as two representations, not one.

### Space storage model

The space store generalizes from an `intents` table to a generic append-only `messages` table so it can persist both intents and projected promise events.

```sql
CREATE TABLE IF NOT EXISTS messages (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  message_id  TEXT,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_parent_seq ON messages(parent_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_intent_id
  ON messages(message_id) WHERE type = 'INTENT';
```

Key decisions:
- `seq` remains the scan cursor
- INTENT posts remain idempotent by `intentId`
- non-INTENT projected events are append-only
- the space stores projection history, not promise state

### Client event model

The client should emit a generic `'message'` event for any echoed stored message while keeping `'intent'` for backward compatibility.

That lets observers build UIs and monitors over projected events without implying those events are authoritative.

### Agent publish flow

After writing to the local promise log, the agent may project the event to the intent space.

The projection is:
- best-effort
- non-fatal on failure
- for visibility only

Initially, scope this to agent-originated events:
- `PROMISE`
- `DECLINE`
- `COMPLETE`
- `REVISE`
- `RELEASE`

### Human-originated events

Defer CLI publication for now.

The transcript and current direction do not require CLI changes in this phase. Human-originated `ACCEPT`, `ASSESS`, and `RELEASE` can remain local-only until there is a clearer need and a cleaner treatment of HMAC-bearing projections.

### Trust model

Projected events in the space are notifications/projections only.

Therefore:
- the agent must continue using the local promise log as authority
- `waitAccept()` and `waitAssess()` continue polling local state as today
- projected space events may aid visibility, but not authorization or lifecycle judgment

HMAC relay support is deferred. The plan should not claim that HMAC-bearing messages flow through the space "as-is" in this iteration.

### Service intent wording

If the space advertises this capability, the wording should reflect projection rather than authority. For example:

```typescript
{ key: 'events', content: 'I persist and echo projected promise events inside intent subspaces' },
```

## Implementation Phases

### Phase 1: Generalize the space for projection

No `loop/` changes yet. The space becomes capable of storing and echoing projected non-INTENT messages.

**Files:**

| File | Change |
|------|--------|
| `intent-space/src/store.ts` | Generalize schema to append-only `messages` storage, keep INTENT idempotency |
| `intent-space/src/space.ts` | Accept generic ITP posts, not just INTENT |
| `intent-space/src/types.ts` | Generalize stored/echoed types and scan results |
| `intent-space/src/client.ts` | Emit `'message'` for all echoed message types, keep `'intent'` |
| `intent-space/src/service-intents.ts` | Add projection-oriented service intent |
| `intent-space/scripts/test.ts` | Replace PROMISE rejection test with acceptance/projection tests |
| `intent-space/scripts/test.sh` | Update shell tests accordingly |
| `intent-space/CLAUDE.md` | Update description from INTENT-only space to intent space plus projected event visibility |

**Acceptance criteria:**
- [ ] Space accepts projected non-INTENT ITP messages
- [ ] INTENT idempotency is preserved
- [ ] Non-INTENT messages are append-only
- [ ] `SCAN` returns mixed stored messages by containment
- [ ] Echo broadcasts all stored message types
- [ ] Client emits `'message'` for any echoed stored message

### Phase 2: Agent projects local promise events

The agent projects its locally-originated promise events into the space after local write.

**Files:**

| File | Change |
|------|--------|
| `loop/src/loop/agent.ts` | Add best-effort projection helper and call it after local writes for agent-originated events |

**Acceptance criteria:**
- [ ] Agent projects `PROMISE`, `DECLINE`, `COMPLETE`, `REVISE`, and `RELEASE`
- [ ] Projected events appear in the relevant intent subspace by convention
- [ ] Projection failure is non-fatal
- [ ] Agent behavior remains correct with the space down

### Phase 3: Documentation

| File | Change |
|------|--------|
| `intent-space/INTENT-SPACE.md` | Clarify that projected promise events may flow through the space for visibility without making the space authoritative |
| `intent-space/README.md` | Update capability description to projection/visibility language |

## Acceptance Criteria

### Functional

- [ ] An observer can scan an intent subspace and see projected promise activity for that intent
- [ ] Multiple agents' projected promises appear as siblings under the same intent
- [ ] Agent-originated lifecycle events become visible in the space
- [ ] The system still functions when the intent space is unavailable

### Non-Functional

- [ ] The space does not evaluate promise state machines
- [ ] The local promise log remains authoritative
- [ ] Projection is best-effort and non-authoritative
- [ ] No new npm dependencies

## Deferred

- CLI projection of `ACCEPT`, `ASSESS`, and `RELEASE`
- HMAC-bearing message relay semantics
- Using projected space events to wake local polling loops earlier
- Reconciliation of projection gaps after outages
- Multi-agent self-release based on observed projections

## References

- Brainstorm: `docs/brainstorms/2026-03-10-promise-coordination-brainstorm.md`
- Transcript source of truth: Claude project session `805dbbd1-0024-4d23-a91b-634746056ba6.jsonl`
- Protocol sprawl solution: `docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`
- Echo broadcast safety: `docs/solutions/architecture-decisions/echo-broadcast-safety-validation-IntentSpace-20260309.md`
- Promise theory architecture: `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md`
