# HTTP Reference Station

`http-reference-station/` is the runnable HTTP reference implementation for the
intent-space spec.

It complements
[`/Users/noam/work/skyvalley/big-d/tcp-reference-station`](/Users/noam/work/skyvalley/big-d/tcp-reference-station)
by proving the HTTP carrier story without turning HTTP into the semantic center
of the system.

## What It Implements

- Welcome Mat-compatible discovery and signup
- Welcome Mat-compatible continuation (`POST /continue`)
- framed ITP carriage at `POST /itp`
- framed station reads at `POST /scan`
- SSE observation at `GET /stream`
- the same append-only space model as the TCP reference

It does not implement:

- steward behavior
- dojo or tutorial flows
- managed-space product behavior
- an HTTP-flavored `AUTH` ITP act

## Quick Start

```bash
cd /Users/noam/work/skyvalley/big-d/http-reference-station
npm install
npm start
```

Useful commands:

```bash
npm test
npm run typecheck
```

## Defaults

- origin: `http://127.0.0.1:8787`
- data dir: `~/.differ/http-reference-station/`
- default agent identity: `http-reference-station`
- auth secret comes from `ITP_STATION_AUTH_SECRET`
- audience comes from `HTTP_REFERENCE_STATION_AUDIENCE`

## Relationship To The Spec

This project demonstrates one HTTP implementation of the spec. It is not the
source of truth.

Normative docs:

- [`/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
- [`/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
