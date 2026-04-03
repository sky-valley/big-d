---
date: 2026-04-03
title: Build HTTP Reference Station
status: proposed
owners:
  - codex
source_requirements: /Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-03-http-reference-station-requirements.md
---

# Build HTTP Reference Station

## Goal

Add a new sibling project,
[`http-reference-station/`](/Users/noam/work/skyvalley/big-d/http-reference-station),
that proves the HTTP carrier story for the intent-space spec without turning
HTTP into the semantic center of the system.

The new reference should demonstrate:

- Welcome Mat-compatible HTTP discovery and signup
- framed ITP messages carried in HTTP bodies
- distinct station support surfaces for scan and stream
- pure intent-space semantics with no steward, dojo, or product extras

It complements, rather than replaces, the existing
[`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station).

## Why This Change

The current repo already states an HTTP doctrine in the spec, but it does not
yet prove that doctrine with a runnable reference.

That leaves an important gap:

- the spec says HTTP can be a carrier without becoming the ontology
- the TCP reference proves the pure ITP station over a stream carrier
- but nothing runnable yet proves the HTTP-side claim

Without this reference, planning and future implementation are more likely to
drift into one of two bad directions:

- treating HTTP as a REST-shaped semantic rewrite
- smuggling the TCP station-auth ritual into HTTP in a way that breaks Welcome
  Mat compatibility

This work should make the HTTP stance executable and inspectable.

## Scope

In scope:

- create `http-reference-station/`
- implement Welcome Mat-compatible discovery/signup over HTTP
- implement `/itp`, `/scan`, and `/stream`
- carry framed ITP and station support messages in HTTP bodies
- reuse the existing append-only store model and space semantics
- provide a simple local dev mode
- add project docs for the new reference

Out of scope:

- steward or managed-space behavior
- dojo or tutorial flows
- replacing or mutating the spec
- changing the TCP reference into a shared library as a first step unless it is
  clearly needed
- marketplace repo changes

## Desired End State

### 1. New HTTP Reference Project

`http-reference-station/` exists as a sibling project and is runnable locally
with obvious defaults.

It should read as:

- a plain HTTP reference station
- Welcome Mat-compatible
- pure intent space

It should not read as:

- a product application
- a managed service
- an HTTP-flavored clone of academy/headwaters behavior

### 2. Clean Carrier Split

The two reference implementations demonstrate one semantic model over two
carriers:

- TCP reference: explicit ITP `AUTH` act and stream-carried framed messages
- HTTP reference: Welcome Mat-compatible HTTP auth/profile and framed messages
  in HTTP bodies

Both preserve the same:

- space semantics
- append-only visibility model
- containment model
- promise visibility boundaries

### 3. Minimal HTTP Surface

The live HTTP surface remains deliberately small:

- `/itp` for real ITP acts only
- `/scan` for private station read path
- `/stream` for SSE observation of visible stored acts in one space

This is small on purpose. The reference should prove the doctrine, not invent a
platform.

## Implementation Strategy

### Phase 1. Establish Project Skeleton And Shared Semantics

Create `http-reference-station/` with a minimal TypeScript/Node shape that
matches the repo’s reference-project style:

- package manifest
- entrypoint
- local guidance/readme
- test harness

At the same time, pin the shared semantic baseline:

- which store/runtime pieces can be reused directly from the TCP reference
- which pieces must stay carrier-specific
- how the new project will point back to `intent-space/` as the spec home

Deliverable:

- runnable project skeleton with explicit scope and no product creep

### Phase 2. Implement Welcome Mat-Compatible Discovery And Signup

Add the HTTP-facing discovery and signup surfaces:

- welcome discovery document
- terms/signup endpoints or equivalent Welcome Mat-compatible surface
- station credential issuance compatible with the HTTP doctrine

The key rule here is:

- keep the HTTP auth expression Welcome Mat-compatible
- do not recreate the pure TCP `AUTH` act as an HTTP body ritual

Deliverable:

- an agent can discover the station and obtain reusable participation materials
  over HTTP

### Phase 3. Implement HTTP-Carried Participation Surfaces

Add the participation endpoints:

- `/itp`
- `/scan`
- `/stream`

Rules:

- `/itp` carries framed ITP request/response bodies only
- `/scan` carries framed station read-path request/response bodies only
- `/stream` emits visible stored acts through SSE, one space per request, with
  framed acts carried in SSE `data:` payloads
- `/scan` and `/stream` both reuse the `since` cursor model

Deliverable:

- HTTP participation works without semantic translation into REST resources

### Phase 4. Reuse Or Extract Shared Store/Runtime Pieces Carefully

Bring over the append-only store and other reusable logic from the TCP
reference where appropriate.

Pressure test this phase carefully:

- do not force an early shared-library refactor unless it clearly reduces
  duplication without muddying project roles
- prefer duplicating a small amount of carrier-specific glue over creating a
  premature shared abstraction that hides the transport boundary

Deliverable:

- same append-only space model, cleanly implemented for HTTP

### Phase 5. Validation And Documentation

Add project docs and tests that prove the HTTP reference story:

- local startup docs
- signup/auth tests
- `/itp` carriage tests
- `/scan` parity tests
- `/stream` observation tests
- docs linking back to the spec and clarifying the HTTP-vs-TCP auth split

Deliverable:

- another team can read the spec and this reference and understand how to build
  an HTTP-compatible station

## Key Technical Decisions To Preserve

- HTTP discovery/signup stays Welcome Mat-compatible.
- HTTP does not expose a separate ITP `AUTH` act.
- `/itp` and `/scan` bodies are the same framed message bytes as the TCP
  profile.
- `/stream` carries framed stored acts inside SSE `data:` payloads.
- `/stream` is one-space-per-request and resumes from `since`.
- The append-only store model remains the same as in the TCP reference.

## File And Surface Targets

Primary additions:

- `http-reference-station/` (new)

Likely touch points:

- [`intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
- [`README.md`](/Users/noam/work/skyvalley/big-d/README.md)
- [`AGENTS.md`](/Users/noam/work/skyvalley/big-d/AGENTS.md)
- possibly selective code reuse or extraction from
  [`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)

## Validation

### HTTP Reference

- local startup works with obvious defaults
- an agent can discover the station over HTTP
- signup succeeds with Welcome Mat-compatible materials
- `/itp` accepts framed ITP bodies and persists visible acts correctly
- `/scan` returns framed `SCAN_RESULT` bodies matching the spec
- `/stream` emits visible stored acts for one space and resumes from `since`

### Semantic Parity

- visible acts remain append-only
- containment and scan semantics match the TCP reference
- no hidden promise authority is introduced
- no product-only flow is required for participation

### Docs

- repo docs present the HTTP reference as a sibling carrier implementation
- the auth docs stay explicit about HTTP vs pure TCP transport profiles
- the new reference is easy to find and run

## Risks And Mitigations

### Risk: HTTP semantics colonize ITP semantics

Mitigation:

- keep `/itp` for real ITP acts only
- keep `/scan` and `/stream` separate
- carry framed messages directly in HTTP bodies
- avoid resource-style endpoint sprawl

### Risk: HTTP auth drifts away from Welcome Mat compatibility

Mitigation:

- keep the HTTP profile explicitly Welcome Mat-compatible
- treat the pure TCP `AUTH` act as carrier-specific rather than universal
- define auth continuity in terms of shared materials and semantics

### Risk: Premature shared abstraction between TCP and HTTP references

Mitigation:

- share only what is obviously stable and semantic
- duplicate thin carrier-specific glue where needed
- keep project boundaries legible

### Risk: `/stream` becomes a second protocol

Mitigation:

- keep SSE payloads framed and message-shaped
- do not invent a new stream-only JSON schema
- scope streams to one space and `since`

## Promise-Native Architecture Check

### Autonomous Participants

The autonomous participants remain:

- human or agent participants posting visible ITP acts
- stations declaring their own service intents
- human or agent observers deciding when to scan or stream
- human or agent participants making and assessing promises outside the space’s
  authority boundary

The HTTP carrier does not introduce a hidden coordinator participant.

### Promises About Self

The HTTP reference station promises only its own behavior:

- discovery/signup surface behavior
- auth validation behavior
- append-only persistence
- scan and stream behavior
- containment preservation

It does not promise behavior on behalf of a steward, tutor, or managed service.

### State Authority

State authority remains split correctly:

- the station is authoritative for visible append-only space content and
  containment
- promise lifecycle truth remains outside the space
- HTTP auth materials support participation but do not become the source of
  social truth

### Lifecycle Acts

The space continues to carry explicit lifecycle acts where participants choose
to project them:

- `INTENT`
- `PROMISE`
- `DECLINE`
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

The HTTP reference does not shortcut these into service callbacks or synchronous
hidden workflows. `RELEASE` remains outside the minimum first-pass scope unless
needed by existing semantics/tests during implementation.

### Intent-Space Purity

Intent-space purity is preserved by:

- keeping HTTP as a carrier and signup profile, not the semantic center
- refusing to translate ITP into resource-style endpoint semantics
- keeping `/itp` for real ITP acts only
- leaving the space observational and containment-oriented

### Visibility And Containment

Visibility remains scoped by the space model:

- `/scan` and `/stream` are space-scoped
- `/stream` is one space per request
- only visible stored acts are emitted on `/stream`
- no operator log or auth lifecycle noise is leaked into the social stream

### Rejected Shortcut

Rejected shortcut:

- implement the HTTP reference as a JSON REST surface that merely approximates
  the same intent-space concepts

That would be easier to scaffold quickly, but it would undermine the repo’s
stated position that HTTP is a carrier for ITP rather than the ontology of the
space.

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

1. Scaffold `http-reference-station/` and pin the local dev surface.
2. Implement Welcome Mat-compatible discovery and signup.
3. Implement `/itp` and `/scan` with framed message bodies.
4. Implement `/stream` with SSE plus `since`.
5. Reuse or extract shared store/runtime pieces only where that clearly helps.
6. Add validation and doc updates.
