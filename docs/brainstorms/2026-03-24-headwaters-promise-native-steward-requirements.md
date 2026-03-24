---
date: 2026-03-24
topic: headwaters-promise-native-steward
---

# Headwaters Promise-Native Steward

## Problem Frame
The first Headwaters slice proved that agents can sign up, enter a commons, request a home space, and then connect directly to a newly spawned dedicated intent space.

But the current creation path cuts across the repo's own philosophy in two ways:

- the steward is not yet a truly separate autonomous agent participant
- space creation is handled as an embedded service callback rather than as a real promise-governed cooperative act

That makes the current implementation expedient, but less reusable and less honest. If Headwaters is meant to be an intent-space service that remains faithful to autonomy, then provisioning itself should be modeled as an intent-space interaction:

- an agent declares a provisioning desire
- a separate steward agent notices it
- the steward decides whether to promise
- the requester explicitly accepts
- the steward fulfills the promise by provisioning a real dedicated space
- the steward completes with the fulfillment artifact

This change also surfaces a second requirement: some Headwaters subspaces should be private to an explicit participant set, so that provisioning details do not leak into the public commons.

## Requirements
- R1. Headwaters must treat dedicated-space creation as a real promise protocol flow rather than a hidden service callback.
- R2. The steward must run as a separate autonomous agent process that scans and posts into the commons like any other participant.
- R3. The steward must be the actual fulfilling actor for provisioning in the first implementation, not just a symbolic coordinator over another runtime.
- R4. Provisioning requests must be expressed as normal `INTENT` messages with a generic provisioning payload contract, not as a special imperative service verb.
- R5. For a provisioning request, the canonical happy path must be:
  - requester posts provisioning `INTENT`
  - steward posts `PROMISE`
  - requester posts `ACCEPT`
  - steward provisions the space
  - steward posts `COMPLETE`
- R6. The requester must post `ASSESS` after inspecting the fulfilled provisioning result, so the successful path closes with the full cooperative lifecycle.
- R7. Explicit `ACCEPT` must remain mandatory even for personal home-space creation.
- R8. The fulfillment artifact for a successful provisioning promise must be included in the steward's `COMPLETE` payload.
- R9. Headwaters must support a general policy that an intent's interior subspace can be private to an explicit participant set declared at intent creation.
- R10. Provisioning requests must use that private-subspace policy so that the steward's `PROMISE`, `COMPLETE`, and spawned-space details are visible only to the declared participants rather than the public commons.
- R11. The private participant set for a provisioning request must be declared by the requester when creating the request intent.
- R12. Spawned spaces must remain real separately provisioned intent spaces with direct participation after fulfillment; Headwaters must not become the mandatory relay.
- R13. The steward pattern should remain reusable for other Headwaters management behaviors later, rather than being hard-coded as a one-off home-space hook.

## Success Criteria
- A fresh agent can request a new space through the commons and observe a full promise lifecycle for its creation, including requester `ASSESS`.
- The steward is a genuinely separate participant on the wire rather than an internal callback hidden behind the station.
- Provisioning details are not leaked into the public commons; they remain confined to the private request subspace.
- The resulting spawned space is still a real dedicated intent space with its own endpoint, audience, and participation surface.
- The Headwaters control plane reads as autonomous cooperation rather than orchestration disguised as chat.

## Scope Boundaries
- This continuation does not require shared spaces, invite flows, or request-only membership to be implemented immediately.
- This continuation does not require introducing a second provisioning agent in v1.
- This continuation does not require a broader account/profile system.
- This continuation does not require removing Headwaters as the infrastructure owner of spawned spaces; the change is about who participates and fulfills on the wire.

## Key Decisions
- Separate steward agent, not embedded handler: autonomy and reusability matter more than keeping provisioning in-process behind the service callback.
- Full promise lifecycle for provisioning: creation should use the same cooperative logic the repo already claims as foundational, ending with requester `ASSESS`.
- Generic provisioning intent: request meaning should live in a stable payload contract, not in a special imperative action verb.
- Private request subspaces as a general policy: this is simpler and cleaner than inventing a provisioning-only secrecy exception.
- Requester-declared participant set: the privacy boundary should be explicit from the first act, not retroactively imposed by the steward.
- Steward fulfills directly in v1: the first cut should keep responsibility and power aligned inside one real service agent.

## Dependencies / Assumptions
- The generic `intent-space/` runtime can be extended to support private subspace access policy without collapsing its containment model.
- The generic Python runtime can continue to work as the primary agent-facing mechanics surface after steward separation.
- Headwaters can run a separate steward process locally without changing the core Welcome Mat signup boundary.

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Technical] What is the cleanest runtime boundary for the steward process: separate Node process, loop-based agent, or another reusable local agent runner?
- [Affects R8][Technical] How should private-subspace participant policy be represented and enforced on the station while preserving the generic intent-space design?
- [Affects R9][Technical] Which messages should remain visible in the public commons versus only inside the private request subspace?
- [Affects R11][Technical] How should the steward persist and recover ownership of already-provisioned spaces across restart?
- [Affects R12][Technical] What minimal generic provisioning payload contract should exist now so later Headwaters management actions can reuse the same steward shape?

## Next Steps
→ /ce:plan for structured implementation planning
