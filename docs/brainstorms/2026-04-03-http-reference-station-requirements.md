---
date: 2026-04-03
topic: http-reference-station
---

# HTTP Reference Station

## Problem Frame

`big-d` now has:

- [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space) as the spec home
- [`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station) as the plain runnable TCP/ITP reference implementation

The next gap is the HTTP carrier.

The repo already states an HTTP doctrine:

- HTTP can carry the same ITP protocol without becoming the semantic center
- Welcome Mat is the right lineage for HTTP discovery and signup
- live participation over HTTP should stay Welcome Mat-compatible rather than
  forcing the TCP station-auth ritual into HTTP bodies

What is missing is a runnable reference implementation that proves this doctrine
in practice.

The goal of this work is to add a new sibling project,
`http-reference-station/`, that demonstrates a pure intent-space over HTTP:

- Welcome Mat-compatible discovery and signup
- framed ITP carriage over HTTP
- station support operations over HTTP without collapsing into REST semantics
- no steward
- no dojo
- no managed product layer

## Requirements

- R1. A new sibling project named `http-reference-station/` must be created as
  the HTTP reference implementation for the intent-space spec.

- R2. `http-reference-station/` must preserve the same intent-space semantics
  as the TCP reference:
  - observational body of desire
  - append-only visible acts
  - containment-oriented scanning and observation
  - no promise authority
  - no managed-space or orchestrator semantics

- R3. `http-reference-station/` must be Welcome Mat-compatible over HTTP:
  - discovery and signup follow the Welcome Mat style
  - HTTP auth remains DPoP-shaped and HTTP-native
  - HTTP participation must reuse the same conceptual auth materials and
    semantics rather than inventing a separate auth universe

- R4. Live ITP participation over HTTP must use framed ITP messages carried in
  HTTP request and response bodies rather than translating ITP into JSON
  resource endpoints. For `/itp`, the HTTP body must carry the same framed
  message bytes that the TCP reference carries on the wire.

- R5. Real ITP acts must be submitted only through `/itp`.

- R6. Non-ITP station support operations must stay distinct from `/itp` and
  first ship as:
  - `/scan`
  - `/stream`

- R7. `/scan` must return the same framed `SCAN_RESULT` message profile as the
  TCP reference rather than switching to a separate JSON-only response shape.
  The `/scan` request and response bodies must carry the same framed message
  bytes used by the TCP profile.

- R8. `/stream` must use SSE and stream only visible stored acts for one space
  per request.

- R9. `/stream` must emit framed stored acts in SSE `data:` payloads rather
  than inventing a separate stream-only JSON event schema.

- R10. `/stream` must use the same cursor model as scan by resuming from
  `since`.

- R11. Observe-before-act behavior must remain visible in the HTTP reference:
  service-intent introduction should be available through `/scan` and
  `/stream`, not injected into every write response.

- R12. Over HTTP, auth must not use a separate ITP `AUTH` act. Auth belongs to
  the HTTP carrier/profile. The explicit ITP `AUTH` act remains part of the
  pure TCP station profile only.

- R13. HTTP/TCP auth continuity must be defined explicitly in terms of shared:
  - keypair
  - station-issued token material
  - audience binding
  - proof-of-possession semantics

- R14. `http-reference-station/` must reuse the same append-only store model as
  the TCP reference rather than inventing a separate HTTP-specific space model.

- R15. `http-reference-station/` must stay pure:
  - no steward
  - no dojo teacher
  - no managed product extras

- R16. `http-reference-station/` must support a simple local dev mode with
  obvious startup defaults, in addition to being suitable as a remote HTTP
  reference.

## Success Criteria

- Another team can read the spec plus `http-reference-station/` and understand
  how to build an HTTP-compatible intent-space station.
- An agent can discover the station, sign up, and participate over HTTP
  without bespoke human instructions.
- The HTTP reference proves HTTP as a carrier for the same space semantics
  rather than as a semantic rewrite into REST or product-specific flows.

## Scope Boundaries

- This pass is not a steward or managed-space pass.
- This pass is not a dojo or tutorial pass.
- This pass does not replace the TCP reference; it complements it.
- This pass does not redefine the intent-space semantics or the framed ITP
  profile.
- This pass does not require browser-first UX beyond what is naturally enabled
  by HTTP plus SSE.

## Key Decisions

- The new project should be named `http-reference-station/`.
- The primary job of the HTTP reference is to prove the full HTTP-facing story,
  not merely tunnel bytes.
- Over HTTP, live participation should remain Welcome Mat-compatible.
- `/itp` carries real ITP acts only.
- `/scan` and `/stream` remain distinct station support surfaces.
- `/stream` is SSE-based, one space per request, and resumes from `since`.
- `/itp` and `/scan` carry the same framed message bytes as the TCP profile.
- `/stream` carries framed stored acts inside SSE `data:` payloads rather than
  a separate event schema.
- HTTP auth is HTTP-native; explicit ITP `AUTH` remains a pure TCP concern.
- HTTP/TCP continuity is defined by shared key, token, audience, and
  proof-of-possession semantics.
- The HTTP reference should stay in TypeScript/Node for this pass.
- The HTTP reference should reuse the same append-only store model as the TCP
  reference.

## Dependencies / Assumptions

- The current spec in [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space)
  remains the semantic source of truth.
- The current
  [`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)
  provides the closest implementation baseline for shared store and protocol
  behavior.
- Welcome Mat compatibility should be taken seriously over HTTP rather than
  approximated loosely.

## Outstanding Questions

### Deferred to Planning

- [Affects R3,R12,R13][Technical] What exact HTTP request/response auth material
  handling should the reference implement to stay Welcome Mat-compatible while
  remaining simple?
- [Affects R4,R5,R7][Technical] What is the cleanest framed-message mapping for
  `/itp` and `/scan` request/response bodies in the HTTP server code?
- [Affects R8,R9,R10,R11][Technical] How should `/stream` emit framed stored acts
  over SSE while preserving the existing cursor model and observe-before-act
  stance?
- [Affects R14][Technical] Which parts of the TCP reference store/runtime can be
  reused directly versus factored into shared code?
- [Affects R16][Technical] What exact local startup surface should the HTTP
  reference expose while still feeling like a plain reference station?

## Next Steps

→ /big-d:plan for structured implementation planning
