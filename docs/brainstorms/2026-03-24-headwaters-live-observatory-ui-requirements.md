---
date: 2026-03-24
topic: headwaters-live-observatory-ui
---

# Headwaters Live Observatory UI

## Problem Frame
A five-minute demo of intent spaces needs a UI that makes “space” legible without collapsing the system into a chat app, task board, or hidden orchestration console. The demo should follow real live Headwaters activity while the operator drives agents externally, and it should make containment, privacy, and promise-native provisioning obvious to an audience that has not internalized the protocol.

This is a throwaway demo project, but it should still respect intent-space principles:
- spaces are observational environments, not assignment surfaces
- interiors are real and matter
- private request subspaces are visible as bounded spaces, not hidden implementation details
- the provisioning lifecycle is promise-native and should remain legible as such

## Requirements
- R1. The UI must present Headwaters as a spatial environment centered on the commons rather than as a list, inbox, or chat transcript.
- R2. The UI must follow live Headwaters activity rather than replaying canned traces.
- R3. The UI must support emergent rooms: new private request interiors and spawned spaces should appear as they are created during the demo.
- R4. The UI must make containment obvious by showing spaces as connected rooms in a spatial graph rooted in the commons.
- R5. The UI must make private request interiors visibly distinct from public/open spaces while still showing them as real rooms in the world.
- R6. The UI must prioritize spatial understanding first, event readability second, and actor identity third.
- R7. Inside each room, the UI must present human-readable semantic events first, with raw protocol details available on demand.
- R8. The operator must retain manual control over navigation and pacing; live activity may signal attention, but it must not forcibly steal focus.
- R9. The UI must be optimized around Headwaters for this first cut, not around a generic all-products intent-space browser.
- R10. The UI must be structured around a thin presentation-neutral room/event view model so the initial terminal-modern hybrid aesthetic can later be replaced without changing the underlying logic.
- R11. The UI must consume live Headwaters activity through a thin adapter that converts protocol-visible state into the UI room/event model.

## Success Criteria
- In a five-minute live demo, a viewer can understand that Headwaters has a commons, private request interiors, and spawned spaces as distinct but connected places.
- A viewer can follow a live provisioning flow without needing to understand raw NDJSON or internal implementation details.
- Private request interiors read as bounded spaces rather than hidden backend steps.
- The demo can tolerate the operator creating more than one request or spawned space during the session.
- The first visual theme can be changed later without reworking the event/space semantics.

## Scope Boundaries
- This first cut is not a generic UI for all intent-space products.
- This first cut is not a full interactive client for posting, accepting, or administering Headwaters.
- This first cut does not need to cover academy/dojo directly, even if the broader demo mentions both products.
- This first cut does not need to expose every raw protocol message or operator diagnostic by default.
- This first cut does not need autoplay or guided story mode.

## Key Decisions
- Headwaters only for v1: narrowing the surface makes the demo more legible and reduces throwaway complexity.
- Spatial rooms over lists or columns: the demo’s job is to teach containment and interiors, not just show messages.
- Live observatory over replay: the operator wants to drive real agents and let the UI follow actual activity.
- Commons as anchor with emergent connected rooms: this supports multiple requests/spawned spaces without baking in a single scripted flow.
- Private rooms are shown, not hidden: privacy should appear as a bounded visible concept, not an implementation artifact.
- Human-readable semantic events first: the audience should understand the promise-native flow without reading wire shapes.
- Manual operator control over attention: the UI is a stageable observatory, not an autoplay dashboard.
- Thin adapter + themeable view model: semantics and aesthetics should be separable so the look can change later.

## Dependencies / Assumptions
- The UI can observe enough live Headwaters activity to derive a room/event model without adding hidden control paths.
- The demo operator will run real agents and generate live activity during the presentation.
- A thin translation layer from live protocol-visible events to semantic room events is acceptable for demo readability.

## Outstanding Questions

### Deferred to Planning
- [Affects R2,R11][Technical] What is the cleanest live observation source for the UI: direct station client connection, mirrored event feed, or a small server-side adapter attached to Headwaters?
- [Affects R3,R4,R5][Technical] What exact room graph model best represents commons, private request interiors, and spawned spaces without leaking backend implementation details?
- [Affects R7][Technical] What semantic event vocabulary should the adapter emit so the UI stays readable but still faithful to the live protocol?
- [Affects R8][Technical] What navigation/camera model gives the operator manual control while still surfacing peripheral activity clearly?
- [Affects R10][Technical] What interface boundary cleanly separates room/event semantics from theme/styling so a later reskin is cheap?

## Next Steps
→ /ce:plan for structured implementation planning
