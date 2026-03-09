---
title: "Intent Space Self-Description through Service Intent Declaration"
date: 2026-03-06
category: integration-issues
component: intent-space
tags: [promise-theory, self-description, graceful-degradation, service-intents, bootstrap]
severity: medium
root_cause: "Intent space lacked autonomous identity and self-declaration capability per Promise Theory principles"
---

# Intent Space Self-Description through Service Intent Declaration

## Problem

The intent space was a "dumb server" — it persisted and broadcast intents but had no identity, no self-awareness, and clients had no fallback if it went down. Per Promise Theory (Mark Burgess), every component should be an autonomous agent that declares what it does. The intent space served ITP messages but didn't speak as a participant itself.

## Root Cause

Architectural gap — the intent space was modeled as infrastructure rather than as a Promise Theory participant. The key insight: bootstrapping a connection IS the agent advertising its intents. No new message types are needed — the intent space should eat its own dog food.

## Solution

Six changes, all in `src/intent-space/`:

1. **Added `hasIntent()` to IntentStore** (`intent-store.ts`) — simple existence check for idempotent service intent posting.

2. **Created `service-intents.ts`** — pure data module defining 4 service capabilities. `buildServiceIntents(agentId)` creates ITPMessage objects via `createIntent()` with deterministic intentIds (`${agentId}:${key}`).

3. **Gave IntentSpace identity** (`intent-space.ts`) — added `agentId` constructor parameter (default: `process.env.DIFFER_INTENT_SPACE_ID ?? 'intent-space'`). Added `declareServiceIntents()` called in `start()` before server listens.

4. **Updated main.ts** — logs agent ID on startup.

5. **Added client-side cache** (`intent-client.ts`) — `cachedIntents` array updated on INTENT_HISTORY and INTENT_BROADCAST. `getCachedIntents()` returns copy. Cache NOT cleared on disconnect for graceful degradation.

6. **Added 3 tests** — service intents in history, idempotent restart, cache survives disconnect.

### Key Design Decisions

- No new message types — service intents are regular ITPMessage objects
- Deterministic intentIds (`intent-space:persist`, etc.) prevent duplication across restarts
- Service intents posted BEFORE server listens, so all clients see them in INTENT_HISTORY
- The running process IS the implicit promise — no need for explicit PROMISE messages
- Client cache is shallow (last known state), not full offline mode

## Prevention Strategies

### Identity-First Design
Always assign an explicit `agentId` to every component before it becomes operational. During code review, ask: "Can this component identify itself?" If not, it's being modeled as dumb infrastructure rather than an autonomous agent.

### Capability Self-Declaration
Require components to self-declare their capabilities using the system's own protocol before accepting clients. This forces you to think through what the component actually promises, and creates a queryable capability registry without a separate metadata layer.

### Deterministic Initialization
Use deterministic, stable identifiers for self-declarations rather than UUIDs. This ensures restarts re-declare with the same identity, making self-declarations idempotent.

### Pre-Connection Declaration Ordering
Strict initialization: (1) create identity, (2) declare capabilities, (3) accept connections. All clients see capabilities immediately — no race conditions.

### Client-Side Graceful Degradation
Every client should cache component capabilities locally. When unavailable, fall back to stale data rather than failing hard. Document staleness explicitly.

## Best Practices

- **Use the system's own protocol for self-description.** Don't create a separate metadata language. One protocol to understand, one audit trail.
- **Test restart idempotency explicitly.** Start, declare, stop, restart, verify same identity and no duplicates.
- **Treat unavailability as degradation, not failure.** Return cached data with staleness info rather than throwing errors.

## Related Documentation

- `docs/brainstorms/2026-03-06-intent-space-separation-brainstorm.md` — Brainstorm on separating intent space per Promise Theory
- `docs/plans/2026-03-06-feat-standalone-intent-space-plan.md` — Implementation plan for standalone intent space
- `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md` — Promise Theory patterns from CFEngine, Kubernetes, Cisco ACI
- `docs/brainstorms/2026-03-05-exoskeleton-generalization-brainstorm.md` — Agent generalization with Promise Theory alignment
- `loop/CLAUDE.md` — Promise Protocol documentation, state machine, conventions
