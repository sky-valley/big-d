---
date: 2026-04-02
title: Restructure Big-D Around Intent-Space Spec And TCP Reference Station
status: completed
owners:
  - codex
source_requirements: /Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-02-restructure-spec-and-tcp-reference-station-requirements.md
---

# Restructure Big-D Around Intent-Space Spec And TCP Reference Station

## Goal

Reshape `big-d` so the repo states one clear position:

- [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space) is the pure spec home for intent-space semantics, ITP wire protocol, and auth profiles.
- `tcp-reference-station/` becomes the only live runnable plain TCP/ITP reference implementation.
- `academy/` and `headwaters/` are removed rather than left around as product-shaped contamination.

This pass is intentionally not the HTTP reference pass. HTTP/Welcome Mat doctrine remains in the spec, but no runnable HTTP surface survives in the repo after this cut.

## Why This Change

The current repo shape makes the position harder to trust than it needs to be:

- `intent-space/` still mixes protocol doctrine, implementation, and product-era operator details.
- `academy/` and `headwaters/` still act as live conceptual centers even though the desired end state is spec + plain reference.
- root docs and guidance still point contributors toward dojo/steward surfaces that are no longer the intended story.

The restructure should make the repo legible to a new reader in minutes:

1. read the spec in `intent-space/`
2. run the plain reference in `tcp-reference-station/`
3. ignore removed product surfaces because they are gone

## Scope

In scope:

- rewrite `intent-space/` into a spec-only home
- create `tcp-reference-station/` as a runnable plain TCP/ITP reference implementation
- extract and adapt current working station pieces into the new reference
- remove `academy/`, `headwaters/`, and docs that only make sense for them
- rewrite repo-facing docs and agent guidance around the new shape

Out of scope:

- marketplace repo changes
- runnable HTTP-bound reference implementation
- preserving academy/headwaters as archives
- expanding this pass into loop redesign or spaced redesign

## Desired End State

### 1. Spec Home

[`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space) contains:

- intent-space semantics
- exact framed ITP wire profile
- TCP/ITP auth profile
- HTTP auth transport-profile doctrine referencing Welcome Mat, its principals, and project site
- protocol fixtures/examples sufficient for another team to build a compatible implementation

It does not contain:

- live station implementation code
- dojo or steward docs
- product runbooks
- implementation-specific monitoring/operator narratives that belong to the reference project instead

### 2. Plain Reference Implementation

`tcp-reference-station/` contains the only live runnable TCP reference station in the repo:

- plain TCP/ITP station
- framed verb-header-body wire
- persistence
- TCP/ITP auth
- post
- scan
- service-intent introduction / observe-before-act behavior
- dead-simple startup surface

It does not contain:

- steward logic
- dojo teacher logic
- HTTP onboarding surface
- managed-space product behavior

### 3. Clean Repo Story

The top-level repo points to:

- `intent-space/` for specification
- `tcp-reference-station/` for the runnable TCP reference

and no longer presents `academy/` or `headwaters/` as live surfaces.

## Implementation Strategy

### Phase 1. Freeze The Conceptual Target

Tighten `intent-space/` into a spec-owned surface before extraction starts drifting:

- inventory which current `intent-space/` files are true spec versus implementation or product/operator material
- rewrite the spec docs so they point to the recent framed-wire doctrine as the canonical protocol profile
- explicitly capture the HTTP-vs-TCP auth stance:
  - HTTP profile follows the Welcome Mat / DPoP-aligned work already done
  - TCP profile keeps the current station-auth expression
  - shared materials and semantics matter more than identical wire syntax for auth
- decide which current message examples become durable fixtures under `intent-space/`

Deliverable:

- `intent-space/` has a clear spec table of contents and a stable boundary between normative docs and implementation-free examples

### Phase 2. Extract The TCP Reference Station

Create `tcp-reference-station/` by extracting the working station core from existing code:

- move or copy the framed transport, store, auth verification, service-intent introduction, and scan/post logic out of the current implementation surfaces
- simplify naming and entrypoints so the project reads like a plain reference station, not a leftover sub-slice of a larger product
- provide an obvious startup path such as `npm start` plus a tiny `main.ts` entrypoint
- carry forward the current semantic baseline:
  - framed verb-header-body transport
  - opaque replayable bodies
  - post/scan semantics
  - service-intent introduction

Deliverable:

- `tcp-reference-station/` can be started plainly and behaves as the runnable TCP reference for the spec

### Phase 3. Move Implementation Responsibility Out Of `intent-space/`

After the new reference is standing:

- remove live implementation code from `intent-space/`
- replace implementation-oriented README sections in `intent-space/` with spec-oriented navigation and fixtures
- move operator and runtime details that still matter into `tcp-reference-station/`

Deliverable:

- `intent-space/` is genuinely spec-only in the final tree

### Phase 4. Remove Product Surfaces

Delete the old live product surfaces and their dependent docs:

- remove [`academy/`](/Users/noam/work/skyvalley/big-d/academy)
- remove [`headwaters/`](/Users/noam/work/skyvalley/big-d/headwaters)
- remove dojo/steward-specific runbooks, eval harness docs, and agent setup docs that no longer correspond to any live project
- update root-level references, AGENTS guidance, and any surviving local docs that still point to removed surfaces

Deliverable:

- repo no longer contains academy/headwaters as live conceptual or implementation surfaces

### Phase 5. Final Doc And Developer Experience Pass

Make the repo understandable in its final state:

- rewrite [`README.md`](/Users/noam/work/skyvalley/big-d/README.md) to present the repo as spec + TCP reference station
- update [`AGENTS.md`](/Users/noam/work/skyvalley/big-d/AGENTS.md) and any local guidance files that still mention removed subprojects as current surfaces
- ensure the new reference station has minimal run instructions and validation commands
- ensure `intent-space/` links only to live, relevant docs

Deliverable:

- a new contributor can find the spec, run the reference station, and avoid dead paths

## File And Surface Targets

Expected primary touch points:

- [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space)
- `tcp-reference-station/` (new)
- [`README.md`](/Users/noam/work/skyvalley/big-d/README.md)
- [`AGENTS.md`](/Users/noam/work/skyvalley/big-d/AGENTS.md)
- [`docs/runbooks/`](/Users/noam/work/skyvalley/big-d/docs/runbooks)
- [`docs/plans/`](/Users/noam/work/skyvalley/big-d/docs/plans)
- [`docs/solutions/`](/Users/noam/work/skyvalley/big-d/docs/solutions)

Expected removals:

- [`academy/`](/Users/noam/work/skyvalley/big-d/academy)
- [`headwaters/`](/Users/noam/work/skyvalley/big-d/headwaters)
- dojo/steward-only runbooks and setup docs

## Validation

### Reference Station

- `tcp-reference-station/` starts from a dead-simple documented command
- a client can authenticate with the TCP/ITP auth profile
- a client can observe the service-intent introduction
- a client can post and scan successfully

### Spec Surface

- `intent-space/` contains no live station code
- the framed wire profile is linked clearly as the normative wire source
- the auth docs clearly separate HTTP carrier doctrine from TCP station auth
- fixtures/examples are sufficient to build another compatible implementation

### Repo Story

- root README and AGENTS guidance present only the new intended surfaces
- no live docs direct contributors to academy/headwaters
- removed surfaces are not left as half-deprecated leftovers

## Risks And Mitigations

### Risk: The spec silently re-absorbs implementation detail

Mitigation:

- keep implementation code out of `intent-space/`
- move runnable concerns into `tcp-reference-station/`
- keep protocol examples in `intent-space/` fixture-like and normative, not product-explanatory

### Risk: Extraction preserves too much product-era clutter

Mitigation:

- treat current code as source material, not structure to preserve
- rename and simplify while extracting
- delete steward/dojo surfaces instead of trying to re-explain them

### Risk: Auth doctrine gets muddled during the split

Mitigation:

- keep the current transport distinction explicit in spec docs
- state that HTTP auth remains Welcome Mat-aligned
- state that pure TCP keeps the current station-auth profile
- keep shared materials/semantics front and center

### Risk: Contributors lose useful operational guidance after deletions

Mitigation:

- rewrite remaining docs to point at the plain reference station
- keep startup and validation instructions simple and obvious
- preserve only the guidance that corresponds to live projects

## Promise-Native Architecture Check

### Autonomous Participants

The autonomous participants remain:

- human or agent participants posting `INTENT`
- human or agent participants making `PROMISE`
- human or agent participants deciding whether to `ACCEPT`, `DECLINE`, `COMPLETE`, and `ASSESS`
- the station as an observational participant that introduces its own service intents and maintains the shared record

This restructure is intentionally removing repo surfaces that blurred those roles, not adding new hidden participants.

### Promises About Self

The plain TCP reference station continues to make promises only about itself:

- it will authenticate according to the TCP profile
- it will persist and echo acts
- it will provide scan/history
- it will preserve containment boundaries

The plan does not reintroduce steward-like logic that would promise behavior on behalf of others.

### State Authority

State authority stays where it already belongs:

- intent-space remains authoritative for visible append-only space content and containment
- promise lifecycle truth does not migrate into the space just because promise-related acts may be visible there
- auth materials remain transport-profiled but conceptually consistent

This restructure clarifies those boundaries rather than changing them.

### Lifecycle Acts

The plan preserves explicit lifecycle acts in the spec:

- `INTENT`
- `PROMISE`
- `DECLINE`
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

The reference station remains an observational substrate for those acts. It is not being turned into a hidden workflow engine or promise authority.

### Intent-Space Purity

The design preserves intent-space purity by:

- keeping `intent-space/` as the spec home rather than a mixed product surface
- keeping HTTP doctrine in the spec without making HTTP the semantic center
- retaining framed ITP as the protocol identity for the space
- removing product layers that were starting to colonize the conceptual story

### Visibility And Containment

Visibility remains scoped by the space model itself:

- top-level declarations are visible in the bound/root space
- narrower coordination remains inside contained intent interiors
- the reference station preserves observe-before-act introduction and scan-based observation

This plan does not introduce a broader relay or visibility bypass.

### Rejected Shortcut

Rejected shortcut:

- keep `academy/` and `headwaters/` around as deprecated “reference” surfaces while adding the new station beside them

That would be cheaper in the short term, but it would preserve exactly the conceptual contamination this restructure is meant to remove.

## Checklist Review

Quick gate:

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

Blocked red flags:

- [x] Embedded callbacks replace real participants: false
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: false
- [x] `ASSESS` is absent where fulfillment quality matters: false
- [x] State authority silently drifts into the intent space: false
- [x] Auth or transport semantics displace native ITP semantics: false
- [x] The design relies on a mandatory relay without explicit justification: false
- [x] Sensitive fulfillment details have no scoped visibility model: false

## Recommended Execution Order

1. Rewrite and tighten `intent-space/` spec boundaries first.
2. Stand up `tcp-reference-station/` from extracted working pieces.
3. Remove implementation code from `intent-space/`.
4. Delete `academy/`, `headwaters/`, and dependent live docs.
5. Rewrite root docs and guidance so the repo reads honestly in its final shape.
