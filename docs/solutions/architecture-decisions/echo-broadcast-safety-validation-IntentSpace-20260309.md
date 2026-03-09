---
module: intent-space
date: 2026-03-09
problem_type: architecture_decision
component: server/echo-broadcast
symptoms:
  - "Echo broadcast pushes every new intent to all connected clients"
  - "Concern that push-based broadcast contradicts the pull-based SCAN redesign"
  - "Question whether echo is a one-way door or future scaling problem"
root_cause: >
  Conflation of two distinct broadcast patterns: the retired O(N*M) full-table-scan
  polling (every client re-fetching all intents every tick) versus the retained O(N)
  per-intent echo to open socket connections. The former was the scaling problem;
  the latter is standard pub/sub fan-out.
resolution_type: no_change
severity: low
tags:
  - scalability
  - broadcast
  - pull-vs-push
  - architecture-validation
  - scan
  - echo
---

# Echo Broadcast Safety Validation

## Analysis

The intent space was redesigned to use pull-based SCAN for history retrieval, replacing the original O(N*M) broadcast. But the server still echoes every new intent to all connected clients in real-time. The question: does this repeat the scaling mistake?

Two distinct patterns, often conflated:

- **What was retired (O(N*M)):** Every client polling for ALL intents on every tick. Full table scan, no pagination. Scales quadratically with clients and intents.
- **What remains (O(N)):** New intents echoed to all currently connected sockets. One `socket.write()` per client per new intent. Standard chat/pub-sub pattern.

The space has two layers serving different purposes:

- **Echo layer (push):** Real-time notification to connected agents. N writes per intent. No persistence guarantee beyond the SQLite write that precedes it.
- **SCAN layer (pull):** History retrieval via cursor-based `SCAN(spaceId, since)`. Client controls read position. Natural backpressure. Durable contract.

## Decision

Echo stays. It is not a one-way door.

**SCAN is the durable contract.** A client that ignores echo entirely and polls via SCAN is fully functional today. Echo is an optimization that can be removed, filtered, or sharded without breaking any client that follows the protocol.

**Echo is not a one-way door** for three reasons:

1. **SCAN works independently.** No protocol change is needed to stop echoing. Clients fall back to polling.
2. **parentId is a natural partition key.** Filtered echo — where a client subscribes only to specific sub-spaces — is a future refinement, not a redesign. The data model already supports it.
3. **TCP transport enables sharding.** Multiple intent space instances can each own a subtree. The fractal structure of parentId-based sub-spaces makes horizontal scaling a deployment topology change, not a protocol change.

## Escape Hatches

1. **Drop echo entirely.** Clients fall back to SCAN polling. Zero protocol change required.
2. **Filtered echo.** Clients subscribe to specific parentId sub-spaces. Reduces per-client write fan-out from "all intents" to "intents in my subtree."
3. **Sharded intent spaces.** Multiple instances, each owning a subtree. TCP transport makes this a deployment decision.
4. **Rate-limited echo.** Batch or throttle echo under high throughput. Clients that need real-time poll with short intervals; others receive batched echo.

## When Echo Breaks

**Connection count:**
- Watch at ~50 concurrent connections (broadcast loop becomes measurable)
- Act at ~200 (write amplification dominates event loop)

**Intent throughput:**
- Watch at ~100 intents/second (SQLite + broadcast serialization pressure)
- Act at ~500 (TCP backpressure from slow clients stalls broadcast loop)

**Structural indicators:**
- Need multiple intent space instances (broadcast doesn't compose across instances)
- Clients only care about specific sub-spaces (broadcast wastes bandwidth)
- Clients on high-latency links (slow reads block event loop)

## Principles for Layered Push/Pull Design

1. **Pull is the contract. Push is the optimization.** Every correctness property must hold if push disappears.
2. **Push must be derivable from pull.** Any echoed message must be independently discoverable via SCAN. No echo-only messages.
3. **Clients own their cursor, not the server.** Server never tracks per-client read position. Server can restart, lose all connection state, and clients recover by SCANning from their last known seq.
4. **Push filtering is additive, not subtractive.** Subscribe to sub-space X (opt-in), never "unsubscribe from everything except X."
5. **Dedup is the client's responsibility.** Echo and SCAN can overlap. Clients dedup by seq.
6. **Push failure is silent. Pull failure is loud.** Echo drops silently on write error. SCAN errors propagate — they indicate data loss.

## Testing Recommendations

- **Echo-disabled test:** Run against an intent space where `broadcast()` is a no-op. Clients must discover all intents via SCAN alone.
- **Echo-delayed chaos test:** Inject random delays before each broadcast write. Clients must process intents in seq order, not arrival order.
- **Echo-duplicated test:** Send every echo twice. Clients must dedup by intentId or seq.
- **Late-join test:** Start client after intents have been posted. Must discover all via SCAN. No echo for past intents.
- **Reconnect-after-gap test:** Disconnect mid-session, reconnect, SCAN from last known seq. Echo during the gap is lost.

**Invariant:** The set of intents a client processes is identical whether echo is enabled or disabled. Echo may change *when* the client sees an intent, but never *whether* it sees it.

## Related Issues

- [Protocol Sprawl & Missing Fractal Containment](../architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md) — Original redesign that replaced O(N*M) broadcast with SCAN
- [Observe-Before-Act Gate](../integration-issues/observe-before-act-gate-IntentSpace-20260309.md) — Connection ordering invariant
- [Intent History Scalability Brainstorm](../../brainstorms/2026-03-06-intent-history-scalability-brainstorm.md) — Push-to-pull model analysis
- [Intent Summary Pull Model Plan](../../plans/2026-03-06-feat-intent-summary-pull-model-plan.md) — Pull model implementation plan
- [Promise Theory Informed Architecture](promise-theory-informed-architecture.md) — Foundational patterns
