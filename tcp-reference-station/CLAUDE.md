# TCP Reference Station

Local implementation guidance for
[`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station).

## Purpose

This project is the plain runnable TCP/ITP reference implementation for the
intent-space spec.

Keep it:

- small
- protocol-faithful
- free of steward, dojo, or HTTP product surfaces

## Key Files

- `src/space.ts` — server, connection handling, auth gate, scan/post dispatch
- `src/store.ts` — append-only persistence and visibility policy storage
- `src/auth.ts` — TCP station-auth verification
- `src/framing.ts` — verb-header-body framing
- `src/client.ts` — small client used by tests and local smoke runs
- `src/service-intents.ts` — observe-before-act self-description
- `scripts/test.ts` — integration-style test suite

## Working Rules

- keep imports explicit with `.ts`
- preserve the framed wire and auth semantics defined under `../intent-space/`
- prefer simplifying the implementation over adding features
- do not reintroduce HTTP onboarding, tutor logic, or managed-space behavior
