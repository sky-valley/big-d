---
date: 2026-04-02
topic: restructure-spec-and-tcp-reference-station
---

# Restructure Spec And TCP Reference Station

## Problem Frame

`big-d` currently mixes three different concerns in a way that makes the repo
hard to understand and hard to trust:

- `intent-space/` contains both protocol/spec material and live implementation
- `academy/` and `headwaters/` add product-specific surfaces, dojo behavior,
  steward logic, and HTTP onboarding concerns
- the result is that the core position of the repo is scattered across multiple
  subprojects instead of being legible in one spec home plus one plain
  reference implementation

The goal of this restructure is to make the repo state its position clearly:

- `intent-space/` should become the pure spec home for the intent space and ITP
- one new `tcp-reference-station/` should become the plain runnable TCP/ITP
  reference implementation
- `academy/` and `headwaters/` should be removed so they no longer contaminate
  the repo’s current stance

This pass is intentionally not the HTTP-bound reference pass. It should keep
the HTTP/Welcome-Mat doctrine in the spec, but not keep a runnable HTTP product
surface in the repo.

## Requirements

- R1. `intent-space/` must become a spec-only home for:
  - intent-space semantics
  - the precise ITP wire protocol
  - the TCP/ITP auth profile
  - the HTTP auth transport-profile doctrine
  - protocol fixtures/examples sufficient for another agent or team to build a
    compatible implementation

- R2. `intent-space/` must explicitly preserve the current doctrine from the
  recent protocol work:
  - verb-header-body framing
  - opaque replayable body bytes
  - explicit lifecycle acts
  - transport/carrier distinction
  - Welcome Mat-aligned HTTP auth references and lineage

- R3. A new sibling project named `tcp-reference-station/` must be created as
  the only live plain reference implementation in the repo.

- R4. `tcp-reference-station/` must be runnable out of the box with a dead
  simple entrypoint such as `python main.py` or equivalently obvious startup.

- R5. `tcp-reference-station/` must implement the plain TCP/ITP station with:
  - persistence
  - service-intent introduction / observe-before-act behavior
  - TCP/ITP station auth
  - post
  - scan
  - no steward
  - no dojo teacher
  - no HTTP onboarding surface

- R6. The implementation for `tcp-reference-station/` may reuse the current
  working TypeScript/Node pieces as temporary source material, but the final
  repo state must not leave the old implementation living under
  `intent-space/`.

- R7. `academy/` and `headwaters/` must be removed from the final repo state in
  this pass. They may be used only as temporary source material while the new
  reference implementation is being created.

- R8. Repo-level docs and agent guidance must be rewritten so the main story of
  the repo becomes:
  - `intent-space/` as spec
  - `tcp-reference-station/` as the plain runnable reference implementation

- R9. Product-specific docs, runbooks, evals, and guidance that only make sense
  for `academy/` or `headwaters/` must be removed in this pass rather than
  left around as live documentation.

- R10. The marketplace repo and canonical pack are out of scope for this pass.
  This restructure should stabilize `big-d` first without requiring a same-pass
  marketplace migration.

## Success Criteria

- A new contributor can open the repo and immediately see the intended shape:
  spec in `intent-space/`, plain reference implementation in
  `tcp-reference-station/`.
- Another team could read `intent-space/` alone and understand how to build a
  compatible implementation of the space and protocol.
- The repo no longer contains `academy/` and `headwaters/` as live product
  surfaces.
- The new reference station can be started plainly and used as the runnable TCP
  reference for the spec.
- The repo’s top-level docs no longer muddle the core position with dojo or
  steward-specific surfaces.

## Scope Boundaries

- This pass is not the HTTP-bound reference implementation pass.
- This pass does not require marketplace repo changes.
- This pass does not require preserving academy/headwaters as archives or
  deprecated leftovers.
- This pass does not require a full conformance suite beyond protocol
  fixtures/examples in the spec.

## Key Decisions

- `tcp-reference-station/` is a sibling of `intent-space/`: this keeps
  `intent-space/` pure as the spec home and avoids the implementation silently
  becoming the spec again.
- `academy/` and `headwaters/` are temporary source material only: they can be
  consulted while building the replacement, but must not survive in the final
  repo state.
- The new reference implementation stays in TypeScript/Node for this pass:
  language churn is not the goal; repo clarity is.
- The new reference implementation should preserve service-intent introduction:
  that behavior is part of the station’s current stance and should remain in
  the plain reference.
- HTTP doctrine remains in the spec without a runnable HTTP implementation:
  Welcome Mat, its principals, and its site/project references remain important
  conceptual lineage, but the runnable HTTP-bound reference comes later.
- No archive layer for removed product surfaces: the final repo should state
  its current position cleanly rather than carrying live historical clutter.

## Dependencies / Assumptions

- The recent framed-wire and proof-recut work in `big-d` provides the current
  semantic baseline that the new spec and reference implementation should carry
  forward.
- The current working `intent-space/`, `academy/`, and `headwaters/` code is
  sufficient source material for extracting the plain reference station.

## Outstanding Questions

### Deferred to Planning

- [Affects R3,R5][Technical] What is the cleanest extraction path from the
  current `intent-space/` implementation into `tcp-reference-station/` without
  leaving spec/implementation tangles behind?
- [Affects R8,R9][Technical] Which top-level docs, runbooks, and evals should
  be deleted outright versus rewritten to point at the new structure?
- [Affects R4,R5][Technical] What exact startup surface should the reference
  station expose while still feeling plain and language-agnostic from the repo
  story?
- [Affects R2][Needs research] Which existing protocol examples should become
  durable fixtures inside `intent-space/` so another implementation can rely on
  them?

## Next Steps

→ /big-d:plan for structured implementation planning
