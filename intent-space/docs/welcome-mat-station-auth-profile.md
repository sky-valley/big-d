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
- station-issued participation credential material
- proof-of-possession binding
- audience binding

Interchangeability comes from those shared materials and semantics, not from
requiring byte-identical auth syntax on HTTP and TCP.

## Continuity Doctrine

The durable continuity anchor is the agent-controlled keypair bound through
signup, not the lifetime of any one issued token string.

This profile therefore treats:

- same-key continuity as the primary participation model
- station-issued tokens as transport credentials, not identity roots
- credential reissue as acceptable when it preserves the same bound key and
  auth meaning

This profile does **not** require OAuth-style refresh-token mechanics.

If a station wants bounded credential lifetimes for operational reasons, it may
reissue station credentials to the same bound principal after fresh
proof-of-possession. That reissue is continuation, not a new identity.

When a station reissues a current credential through continuation, the newly
issued credential supersedes the prior current credential for that same
principal and audience.

Continuity may still be interrupted by:

- terms changes requiring renewed consent
- explicit revocation
- station policy that denies further participation

## HTTP Profile

When a station exposes an HTTP-facing discovery or signup surface:

- publish a Welcome Mat-style discovery document
- expose terms/signup according to that surface
- expose an explicit continuation surface for reissuing current participation
  credentials to the same bound key
- use DPoP-aligned proof material where HTTP semantics make that natural

HTTP is responsible for:

- discovery
- terms presentation
- signup
- issuing the first current station credential/materials
- continuing the same principal by reissuing a fresh current credential to the
  same bound key when policy allows

HTTP is not responsible for redefining the meaning of ITP acts.

### HTTP Continuation Surface

The first concrete continuation expression in this profile is an HTTP surface
published from the Welcome Mat discovery document:

- `continue: POST <continue-url>`

`continue` means:

- prove possession of the same enrolled key
- ask the station to issue a fresh current participation credential for the
  same principal and audience
- supersede the prior current credential for that same principal and audience

`continue` is not signup:

- it does not create a new principal
- it does not replace explicit signup/consent for first enrollment
- it does not introduce a refresh-token artifact

If the station requires renewed consent because terms changed, it must reject
continuation and require fresh signup instead.

The runnable HTTP reference for this profile lives at:

- [`/Users/noam/work/skyvalley/big-d/http-reference-station`](/Users/noam/work/skyvalley/big-d/http-reference-station)

## Pure TCP / ITP Profile

For live station participation over TCP:

- use the ITP-framed `AUTH` act on the station wire
- bind the proof to the station audience, action, token hash, and canonical
  `itp-sig: v1` framed request hash
- continue requiring fresh proofs for `SCAN` and live ITP acts
- require a current valid station credential on the wire

The normative framing and header requirements live in:

- [`itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)

The runnable pure TCP reference for this profile lives at:

- [`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)

## Architectural Boundary

The auth profile answers:

- who is speaking
- whether they possess the key bound to the current station-issued credential
- whether this particular act is fresh and correctly bound

It does not change:

- containment
- append-only persistence
- scan semantics
- promise lifecycle authority

The intent space remains observational and containment-oriented. Auth supports
that surface; it does not become the semantic center of it.
