---
title: "feat: Observatory Lifecycle Linking"
type: feat
status: active
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-observatory-lifecycle-linking-requirements.md
---

# feat: Observatory Lifecycle Linking

## Overview

Add inline lifecycle breadcrumbs to the Observatory frontend so viewers can follow the full promise lifecycle — from a commons intent through the promise exchange in a private request interior to the resulting spawned space — without losing the thread across rooms.

## Problem Statement / Motivation

The Observatory v1 shows rooms as isolated nodes. A viewer sees "agent-a requests a home space" in the commons but has no way to follow that request to its outcome. The promise exchange happens in a private request interior, the resulting space appears as a separate node, and there is no visible link between them. The most natural question — "what happened to that request?" — is unanswerable without manually clicking through every room.

(see origin: `docs/brainstorms/2026-03-27-observatory-lifecycle-linking-requirements.md`)

## Proposed Solution

Lifecycle context appears inline within existing UI surfaces — no new panels or layout changes:

1. **Spawned space lifecycle header** — A compact summary block at the top of the event rail when viewing a spawned space. Shows the origin intent content, the requester, and each lifecycle step (intent → promise → accept → complete) as clickable navigation targets that deep-link to the corresponding room and event.

2. **Commons intent status annotations** — Each space-request intent row in the commons event rail gets a status badge (pending / promised / accepted / provisioned / declined) with clickable links to the request interior and spawned space (when they exist).

3. **Request interior forward link** — When viewing a private request interior that has completed provisioning, a link to the resulting spawned space appears in the event rail.

## Technical Considerations

### Architecture: Thread is a Projection, Not a Primitive

Per `docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md`: space is a place, thread is a path. The lifecycle breadcrumb is a read-only projection over spatial data. It does not add a new primitive to the intent-space model.

INTENT is permanent and has no state machine. Status belongs to the promise, not the intent. The status annotations on commons intents describe the furthest promise lifecycle step, not a mutation of the intent itself.

### Data Availability

The adapter already reads all the data needed:
- `requestToSpace` (adapter.ts:219) maps request interiors to spawned space IDs
- Private request interior messages contain the full lifecycle (INTENT, PROMISE, ACCEPT, COMPLETE, DECLINE, ASSESS)
- `RoomEdge` with `kind: 'fulfills'` links request → space
- `RoomSummary.connectedTo` tracks parent rooms
- `intent_ref` field reliably links non-INTENT messages back to their request (per `docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md`)

No new data sources, wire message types, or protocol changes are needed.

### Performance

Lifecycle derivation adds O(N×M) computation per poll (N intents, M lifecycle messages per request). The adapter already reads all request interior messages on every poll. The lifecycle derivation is a second pass over already-loaded data. For typical Headwaters deployments (few agents, few intents), this is negligible within the 1-second poll interval.

### Nested Interactive Elements

Commons event rows are `<button>` elements. Status annotations with clickable links create nested interactive elements. Solution: use `event.stopPropagation()` on annotation link clicks to prevent them from triggering the parent event row's selection handler. This is a pragmatic choice given the vanilla JS / innerHTML approach.

## System-Wide Impact

- **Interaction graph**: Adapter computes lifecycle threads → snapshot includes them → SSE pushes to frontend → frontend renders inline. No new endpoints or event types. The existing hash-based change detection handles lifecycle state changes naturally.
- **Error propagation**: If lifecycle derivation fails for one request (e.g., malformed payload), it should produce a degraded lifecycle (fewer steps, unknown status) rather than crashing the entire snapshot.
- **State lifecycle risks**: None. Lifecycle threads are derived on every poll — no persisted state, no cache invalidation concerns.
- **API surface parity**: The `/api/snapshot` and `/api/stream` SSE endpoints remain unchanged in shape. The snapshot simply carries more data.

## Acceptance Criteria

### Model (model.ts)

- [ ] New `LifecycleThread` interface with: `intentId`, `intentContent` (truncated to ~120 chars), `requesterId`, `requestRoomId`, `spawnedSpaceId` (optional), `status`, and `steps[]`
- [ ] New `LifecycleStep` interface with: `kind`, `roomId`, `eventId`, `actorId`, `timestamp`, `label`
- [ ] `LifecycleStatus` type: `'pending' | 'promised' | 'accepted' | 'provisioned' | 'declined'` — ASSESS does not change status (remains `provisioned`)
- [ ] `ObservatorySnapshot` gains `lifecycleThreads: Record<string, LifecycleThread>` keyed by intent ID

### Adapter (adapter.ts)

- [ ] `readObservatorySnapshot()` computes lifecycle threads from existing message data
- [ ] Status derived from furthest lifecycle message in request interior: INTENT-only → `pending`, PROMISE → `promised`, ACCEPT → `accepted`, COMPLETE → `provisioned`, DECLINE → `declined`
- [ ] Each lifecycle step carries the event ID (`${roomId}:${seq}`) for frontend deep-linking
- [ ] Intent content extracted from `payload.content`; falls back to `requestedSpace.kind`; truncated to ~120 chars with ellipsis
- [ ] `SPACE_ALREADY_EXISTS` distinguished in step label: "Steward reconnected requester to existing space" vs. "Steward provisioned space"
- [ ] Orphan spawned spaces (no matching request) produce no lifecycle thread — they continue to appear in the graph as before but without lifecycle metadata
- [ ] Lifecycle derivation errors for individual requests are caught and produce a degraded thread (status `pending`, empty steps) rather than crashing the snapshot

### Frontend — Spawned Space Lifecycle Header (app.js, R1/R4/R6)

- [ ] When rendering a spawned space event rail, a lifecycle summary block appears above the first event row
- [ ] Summary shows: original intent content (from `lifecycleThread.intentContent`), requester ID, and lifecycle steps
- [ ] Each step is rendered as a clickable element showing kind + actor + relative time
- [ ] Clicking a step navigates to that room AND selects that event (sets both `selectedRoomId` and `selectedEventId`)
- [ ] Summary coexists with room breadcrumb (breadcrumb = structural hierarchy, summary = causal history)

### Frontend — Commons Intent Status Annotations (app.js, R2/R5)

- [ ] Intent event rows in commons that have `requestedSpace` show a status badge after the event label
- [ ] Badge text matches lifecycle status: pending, promised, accepted, provisioned, declined
- [ ] For DECLINE: muted/gray visual treatment
- [ ] Badge includes clickable link(s): request interior link (always present once lifecycle exists), spawned space link (present only when status = provisioned)
- [ ] When lifecycle is incomplete (no spawned space), only the request interior link appears — no placeholder or disabled indicator
- [ ] Clicking annotation links uses `stopPropagation()` to avoid triggering event row selection

### Frontend — Request Interior Forward Link (app.js, R3)

- [ ] When viewing a private request interior that has a linked spawned space, the event rail shows a link to that space
- [ ] Link appears at the top of the rail (below subtitle, above events) as a compact navigation element
- [ ] Clicking navigates to the spawned space room

### Styling (styles.css)

- [ ] Lifecycle summary block: visually distinct from event rows (lighter background, border, or indent), compact
- [ ] Status badges: small inline elements with color-coded backgrounds (teal for provisioned, orange for in-progress states, gray for declined)
- [ ] Clickable lifecycle steps: underline or hover effect indicating interactivity
- [ ] Forward link in request interior: compact, consistent with status badge styling

### Tests (adapter.test.ts)

- [ ] Happy path: INTENT → PROMISE → ACCEPT → COMPLETE → ASSESS produces lifecycle thread with status `provisioned` and 5 steps
- [ ] DECLINE path: INTENT → PROMISE → DECLINE produces lifecycle thread with status `declined`, no `spawnedSpaceId`
- [ ] Partial lifecycle: INTENT only → status `pending` with 1 step
- [ ] SPACE_ALREADY_EXISTS: COMPLETE with `headwatersStatus: 'SPACE_ALREADY_EXISTS'` produces distinct step label
- [ ] Intent content truncation: long content strings are truncated to ~120 chars
- [ ] Orphan space: spawned space with no matching request has no lifecycle thread
- [ ] Multiple requests: each produces its own independent lifecycle thread

## Dependencies & Risks

- **Depends on `intent_ref` reliability**: The adapter relies on `intent_ref` being populated on non-INTENT messages. Per the architecture decision doc, this was fixed in the store. If older data lacks `intent_ref`, lifecycle linking will degrade gracefully (fewer steps, not a crash).
- **innerHTML approach**: The lifecycle summary and annotations are rendered via string concatenation. XSS safety depends on `escapeHtml()` being applied to all dynamic content — same pattern as existing code.
- **No new dependencies**: No new npm packages or CDN imports needed.

## Implementation Phases

### Phase 1: Model + Adapter (backend)

1. Add `LifecycleThread`, `LifecycleStep`, `LifecycleStatus` types to `observatory/src/model.ts`
2. Add `lifecycleThreads` field to `ObservatorySnapshot`
3. Implement lifecycle derivation in `readObservatorySnapshot()` in `observatory/src/adapter.ts`
4. Add adapter tests for all lifecycle scenarios

Files: `observatory/src/model.ts`, `observatory/src/adapter.ts`, `observatory/tests/adapter.test.ts`

### Phase 2: Frontend rendering + styling

1. Add lifecycle summary header rendering in `app.js` for spawned space rooms
2. Add status annotation rendering in `app.js` for commons intent event rows
3. Add forward link rendering in `app.js` for request interior rooms
4. Implement deep-link navigation (set both `selectedRoomId` and `selectedEventId` on step click)
5. Add lifecycle-related styles to `styles.css`

Files: `observatory/public/app.js`, `observatory/public/styles.css`

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-27-observatory-lifecycle-linking-requirements.md](docs/brainstorms/2026-03-27-observatory-lifecycle-linking-requirements.md) — Key decisions: inline breadcrumbs over separate panel; both request interior and spawned space as navigation targets; lifecycle derived from existing adapter data.

### Internal References

- Adapter data flow: `observatory/src/adapter.ts:219-248` (requestToSpace mapping)
- Event rail rendering: `observatory/public/app.js:195-203` (event row HTML), `app.js:457-461` (rail construction)
- Breadcrumb system: `observatory/public/app.js:205-280`
- Type definitions: `observatory/src/model.ts`
- Existing tests: `observatory/tests/adapter.test.ts`

### Architectural Guardrails (from docs/solutions/)

- Thread is a projection, not a primitive: `docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md`
- INTENT is permanent, status belongs to PROMISE: `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md`
- `intent_ref` reliability: `docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md`
- No new wire message types: `docs/solutions/architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md`
