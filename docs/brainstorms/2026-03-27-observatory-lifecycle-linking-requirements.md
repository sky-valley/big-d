---
date: 2026-03-27
topic: observatory-lifecycle-linking
---

# Observatory Lifecycle Linking

## Problem Frame
The Observatory v1 shows rooms (commons, private request interiors, spawned spaces) as distinct nodes in a spatial graph with their own event rails. But the promise lifecycle that connects them is fragmented: an intent in the commons, the promise exchange in a request interior, and the resulting spawned space are each visible in isolation without any connecting thread. A viewer sees "I need a shared recipe book..." in the commons but has no way to follow that intent to its resulting space or understand what happened in between.

This makes it hard to answer the most natural question when watching live activity: "what happened to that request?"

## Requirements
- R1. When viewing a spawned space, the event rail must show a lifecycle summary at the top that traces the space's origin: which intent created it, who requested it, and the promise lifecycle steps that led to provisioning.
- R2. When viewing an intent in the commons that has progressed through the lifecycle, the event row must show a status annotation indicating its current state (e.g., "pending", "promised", "provisioned").
- R3. When viewing a private request interior, the event rail must link to the resulting spawned space if one has been provisioned.
- R4. Lifecycle steps shown in R1 must be clickable to navigate to the corresponding room and event.
- R5. Status annotations on commons intents (R2) must show the chain — request interior and spawned space — as separate clickable navigation targets so the viewer can choose where to go.
- R6. The lifecycle summary (R1) must include the original intent content (e.g., "I need a shared recipe book...") so the spawned space's purpose is immediately clear without navigating back to the commons.

## Success Criteria
- A viewer can follow a single request from its appearance in the commons through the promise exchange to the resulting spawned space without losing the thread.
- A viewer landing on a spawned space immediately understands why it exists, who created it, and what the original request was.
- Lifecycle status in the commons answers "what happened to this request?" at a glance.

## Scope Boundaries
- This does not add new room types or change the graph layout.
- This does not add filtering, search, or timeline views.
- This does not change the polling/SSE architecture.
- This does not extend to lifecycle tracking for intents that are not space-provisioning requests (e.g., general intents without `requestedSpace`).

## Key Decisions
- Inline breadcrumbs over a separate panel: lifecycle context appears within existing UI surfaces (event rail top, event row annotations) rather than adding a new panel. Keeps the UI simple and preserves the current layout.
- Show both request interior and spawned space as navigation targets: the viewer chooses whether to see the promise exchange or jump straight to the result, rather than the UI making that choice for them.
- Lifecycle is derived from existing adapter data: the adapter already reads the full message chain (intent, promise, accept, complete with spaceId) and knows the request-to-space mapping. The lifecycle metadata is a new projection of existing data, not a new data source.

## Dependencies / Assumptions
- The adapter's `requestToSpace` mapping (adapter.ts:219) already links private request interiors to their resulting spawned spaces.
- The commons messages already contain the intent content (`payload.content` or `payload.requestedSpace`) and the private request interior messages contain the promise lifecycle.
- Lifecycle status can be derived by scanning the furthest message type in each private request interior (INTENT only = pending, PROMISE = promised, ACCEPT = accepted, COMPLETE = provisioned, DECLINE = declined).

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] What shape should the lifecycle metadata take in the adapter's snapshot model? Likely a per-room `lifecycle` object with origin intent, steps, and linked room IDs.
- [Affects R2][Technical] How should the adapter efficiently compute lifecycle status for each commons intent without re-scanning all request interiors on every poll?
- [Affects R4,R5][Technical] What DOM structure renders clickable lifecycle steps cleanly within the existing event rail and event row HTML?
- [Affects R6][Needs research] For intents with complex `requestedSpace` payloads, what is the best way to extract a short human-readable summary of the intent content?

## Next Steps
-> /ce:plan for structured implementation planning
