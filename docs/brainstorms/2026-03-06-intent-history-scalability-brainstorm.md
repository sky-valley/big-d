---
title: "Intent History: From Imposition to Promise"
date: 2026-03-06
status: complete
tags: [promise-theory, scalability, intent-space, protocol-design]
---

# Intent History: From Imposition to Promise

## What We're Changing

The intent space currently pushes full `INTENT_HISTORY` to every connecting client. This is a unilateral data dump — an imposition dressed as helpfulness. Per Promise Theory, scoping is the observer's responsibility, not the publisher's.

## Why

Three experts converge on the same answer:

**Jay Kreps (Kafka):** "You're replaying the entire log on every connection. That's offset=0 every time. Your `getLatestSeq()` is already consumer offsets — use them."

**Martin Kleppmann (DDIA):** "This is the event sourcing snapshot problem. Compacted snapshot for cold-start, incremental feed for warm clients. Your `seq` column is already a write-ahead log."

**Mark Burgess (Promise Theory):** "Pushing full history is a +b with no matching -b. The client didn't ask for it. You're violating scoping-is-the-observer's-responsibility. Revise your promise."

## Key Insight

The `INTENT_HISTORY` message conflates two things:
- **Identity** — the intent space announcing itself (service intents)
- **History** — past intents from humans/other agents

Identity is always pushed, always small. History is queryable, not imposed.

## The Revised Connect Flow

1. **Intent space pushes** its service intents (self-announcement — identity, not history)
2. **Intent space sends** a summary: `{ type: 'INTENT_SUMMARY', totalIntents, latestSeq }`
3. **Client decides** what to query (observer scopes itself):
   - Returning client: `{ type: 'QUERY', query: 'INTENTS_SINCE', seq: N }`
   - New agent bootstrapping: `{ type: 'QUERY', query: 'RECENT_INTENTS', limit: 100 }`
   - Bulk export: `{ type: 'QUERY', query: 'ALL_INTENTS' }` (explicit, opt-in)
4. **Broadcasts** flow for anything new (unchanged — proper cooperative binding)

## Promise Revision

| Before | After |
|--------|-------|
| "I intend to provide full intent history on every new connection" | "I intend to make my history available to those who ask" |

The service intent `intent-space:history` content changes to reflect the revised promise.

## Key Decisions

- **Service intents are always pushed** — they're identity, not history
- **History is pull-only** — observer decides scope via QUERY
- **`INTENT_HISTORY` replaced by `INTENT_SUMMARY`** — count + latestSeq, not the full payload
- **New query types**: `INTENTS_SINCE` (seq-based delta) and `RECENT_INTENTS` (count-limited)
- **`ALL_INTENTS` remains** — but as an explicit opt-in query, not a default push
- **Sequence numbers are the sync primitive** — clients track their position in the log

## Resolved Questions

- **What does "recent" mean?** → Count-based (last N), not time-based. Simpler, predictable.
- **Should full history be available?** → Yes, via `ALL_INTENTS` query. Just not auto-pushed.
- **What about brand new clients?** → They get service intents + summary on connect, then query for what they need. The agent is autonomous — it decides its own scope.

## Open Questions

None — ready for planning.
