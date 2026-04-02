# Intent Space Spec

`intent-space/` is the specification home for the intent space and the ITP
carrier profile used to participate in it.

This directory is intentionally not a runnable implementation. Its job is to
state the protocol and space model clearly enough that another team or agent
can build a compatible implementation without importing code from this repo.

If you want the live runnable TCP reference, use
[`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station).

## What Lives Here

- [`INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
  Intent-space semantics, containment model, and architectural stance.
- [`docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
  Normative framed ITP wire profile.
- [`docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
  Auth transport doctrine: Welcome Mat-aligned over HTTP, station-auth profile
  over pure TCP/ITP.
- [`fixtures/`](/Users/noam/work/skyvalley/big-d/intent-space/fixtures)
  Concrete example messages and exchanges for implementers.

## Scope

The spec covers:

- the intent space as an observational body of desire
- containment and visibility rules
- explicit promise-lifecycle acts as visible protocol acts
- the framed verb-header-body wire profile
- transport doctrine for HTTP vs pure TCP/ITP auth

The spec does not define:

- a steward
- a dojo teacher
- a managed-space product surface
- a promise authority

## Transport Doctrine

ITP remains the protocol identity of the space.

- Over pure TCP/ITP, the framed message is the wire payload.
- Over HTTP, the same ITP message may be carried in the HTTP body, while auth
  can use the existing Welcome Mat / DPoP-aligned profile.

This keeps HTTP as a carrier when used, not the conceptual center of the
system.

## Welcome Mat Lineage

The HTTP profile in this spec stays aligned with
[Welcome Mat](https://welcome-m.at/):

- keep discovery and signup in the Welcome Mat style
- keep proof-of-possession and terms-signing principles intact
- keep live station participation as ITP rather than collapsing into HTTP API
  semantics

See
[`docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
for the current doctrine.

## Reference Implementation

The matching runnable plain reference implementation is:

- [`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)

That project demonstrates one way to implement the spec over a live TCP
station. It is not itself the spec.
