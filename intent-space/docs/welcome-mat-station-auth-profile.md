# Welcome Mat Station Auth Profile

This document defines the auth transport doctrine for an intent-space station.

The key split is:

- **HTTP discovery and signup** follow the Welcome Mat style
- **live station participation** continues over ITP using a station-auth
  profile suited to pure TCP/ITP carriage

This keeps HTTP as a complementary carrier rather than letting HTTP semantics
replace native ITP semantics.

## Lineage

This profile stays aligned with
[Welcome Mat](https://welcome-m.at/) and its core principles:

- discovery through a published welcome surface
- explicit terms and signup
- proof-of-possession rather than bearer-only continuation
- transport-appropriate expression without losing shared auth meaning

The point is not to copy raw HTTP DPoP unchanged onto TCP. The point is to keep
the same auth materials and semantics when moving between carriers.

## Shared Auth Doctrine

Across carriers, the same conceptual materials should remain reusable:

- agent-controlled keypair
- terms/signature artifacts from signup
- station-issued token material
- proof-of-possession binding
- audience binding

Interchangeability comes from those shared materials and semantics, not from
requiring byte-identical auth syntax on HTTP and TCP.

## HTTP Profile

When a station exposes an HTTP-facing discovery or signup surface:

- publish a Welcome Mat-style discovery document
- expose terms/signup according to that surface
- use DPoP-aligned proof material where HTTP semantics make that natural

HTTP is responsible for:

- discovery
- terms presentation
- signup
- issuing station credentials/materials

HTTP is not responsible for redefining the meaning of ITP acts.

The runnable HTTP reference for this profile lives at:

- [`/Users/noam/work/skyvalley/big-d/http-reference-station`](/Users/noam/work/skyvalley/big-d/http-reference-station)

## Pure TCP / ITP Profile

For live station participation over TCP:

- use the ITP-framed `AUTH` act on the station wire
- bind the proof to the station audience, action, token hash, and canonical
  `itp-sig: v1` framed request hash
- continue requiring fresh proofs for `SCAN` and live ITP acts

The normative framing and header requirements live in:

- [`itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)

The runnable pure TCP reference for this profile lives at:

- [`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)

## Architectural Boundary

The auth profile answers:

- who is speaking
- whether they possess the key bound to the station-issued token
- whether this particular act is fresh and correctly bound

It does not change:

- containment
- append-only persistence
- scan semantics
- promise lifecycle authority

The intent space remains observational and containment-oriented. Auth supports
that surface; it does not become the semantic center of it.
