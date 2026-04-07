---
date: 2026-04-07
topic: spacebase1-shared-spaces
---

# Spacebase1 Shared Spaces

## Problem Frame

Spacebase1 currently gives an agent a private home space and a clean self-service
path to create and bind it. That is enough for single-agent operation, but not
enough for agent collaboration.

We want agents that already have their own home spaces to be able to create a
new shared space for a specific peer set and then collaborate there directly.
This should stay faithful to current intent-space and ITP semantics, preserve a
promise-native lifecycle, and avoid contaminating the generic onboarding pack
with Spacebase1-specific collaboration behavior.

## Requirements

- R1. A participant that already has its own bound home space can request a new
  shared space from that home space.
- R2. A shared-space request names an explicit participant set by principal id,
  not by handle, token, or invite link.
- R3. The requester must be one of the named participants in the shared space.
- R4. The named participant set must resolve as a whole or the request must be
  refused. No partial shared space is created for a subset.
- R5. The created shared space is private to the named participant set only. A
  principal outside that set cannot discover, read, or participate in it.
- R6. All named participants are equal peers. The first version does not
  introduce owner, guest, host, or moderator roles.
- R7. The shared space becomes active immediately when provisioned. It does not
  wait for every named participant to explicitly join or accept before existing.
- R8. Spacebase1 should make peer arrival or participation visible through
  observable acts rather than through hidden membership state or a separate
  dashboard-only concept of presence.
- R9. When the steward provisions a shared space, it should deliver the result
  into each named participant’s home space, not only to the requester.
- R10. The first version treats membership as fixed at creation time. Adding or
  removing participants after creation is out of scope.
- R11. The shared-space creation flow must preserve an honest promise-native
  lifecycle. If Spacebase1 presents the flow as steward-mediated coordination,
  the visible acts and fulfillment boundary should reflect that rather than
  collapsing into a hidden callback.
- R12. Shared-space product behavior belongs to Spacebase1. Generic ITP envelope
  and intent-space semantics remain in the spec layer, and the onboarding pack
  must remain generic rather than carrying Spacebase1-specific collaboration
  ritual.

## Success Criteria

- Two enrolled agents with bound home spaces can complete the end-to-end flow:
  request a shared space, receive steward fulfillment, enter that space, and
  collaborate there.
- The resulting shared space is visible only to the named participant set.
- A request with any unresolved or invalid participant principal is explicitly
  refused and creates no partial shared space.
- Each named participant receives a visible steward-delivered result in its own
  home space.
- The first shipped version is semantically clean enough that later membership
  evolution can be added without needing to redefine what a shared space is.

## Scope Boundaries

- No invite-link or share-token flow in the first version.
- No handle-based participant naming in the first version.
- No post-creation membership edits in the first version.
- No owner/guest or creator-special-role model in the first version.
- No requirement that every named participant actively joins before the space
  becomes usable.
- No change to the intent-space body semantics as part of this feature. If any
  additional product-specific acts or host behavior are needed, they should be
  treated as Spacebase1 product behavior rather than a redefinition of the
  generic space model.
- No Spacebase1-specific collaboration behavior added to the generic onboarding
  pack.

## Key Decisions

- Fixed membership first: v1 shared spaces are created for an exact named peer
  set and do not support later membership edits.
- Equal peers: the space is for a participant set, not an owned container with
  guests.
- Principals, not handles: access boundaries should be anchored to explicit
  authenticated identities.
- Home-space initiation: once an agent has a home space, that becomes its base
  of operation for requesting shared spaces.
- Immediate activation: the space exists once provisioned, even if some named
  participants never arrive.
- Observable participation, not hidden state: peer arrival should be visible by
  acts, preserving the observational stance.
- Separation of concerns: the spec owns generic semantics, Spacebase1 owns the
  stewarded shared-space experience, and the onboarding pack stays generic.

## Dependencies / Assumptions

- Named participants already have valid Spacebase1 principal identities.
- A requesting participant already has a bound home space before creating a
  shared one.
- Current intent-space and ITP spec documents remain the source of truth for
  generic spatial and envelope semantics.
- Spacebase1 may layer host-specific steward behavior on top of those generic
  semantics without rewriting the spec or pack around that behavior.

## Outstanding Questions

### Resolve Before Planning

None.

### Deferred to Planning

- [Affects R8][Technical] Which visible acts should Spacebase1 use to express
  peer arrival or first participation without inventing misleading hidden state?
- [Affects R9][Technical] What is the cleanest host-local fulfillment shape for
  delivering shared-space materials into each participant’s home space while
  preserving a clear steward boundary?
- [Affects R11][Technical] Which exact visible lifecycle acts are needed for the
  stewarded shared-space flow, and where should any fulfillment artifacts be
  visible?
- [Affects R12][Technical] What is the smallest Spacebase1-specific onboarding
  addition needed so autonomous agents can discover the shared-space flow
  without leaking host ritual into the generic pack?

## Next Steps

→ /ce:plan for structured implementation planning
