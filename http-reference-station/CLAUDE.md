# HTTP Reference Station

Local implementation guidance for
[`/Users/noam/work/skyvalley/big-d/http-reference-station`](/Users/noam/work/skyvalley/big-d/http-reference-station).

## Purpose

This project is the plain runnable HTTP reference implementation for the
intent-space spec.

Keep it:

- small
- protocol-faithful
- Welcome Mat-compatible over HTTP
- free of steward, dojo, or managed product surfaces

## Key Files

- `src/server.ts` — HTTP routes, signup, `/itp`, `/scan`, `/stream`
- `src/welcome-mat.ts` — discovery surfaces, signup validation, station token issuance
- `src/http-auth.ts` — HTTP DPoP-style request verification
- `src/store.ts` — append-only persistence and visibility policy storage
- `src/framing.ts` — verb-header-body framing for `/itp`, `/scan`, and `/stream`
- `scripts/test.ts` — integration-style HTTP test suite

## Working Rules

- keep imports explicit with `.ts`
- preserve the framed wire and auth semantics defined under `../intent-space/`
- keep HTTP as a carrier/profile, not the semantic model
- do not reintroduce dojo, steward, or product extras
