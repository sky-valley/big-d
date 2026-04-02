# TCP Reference Station

`tcp-reference-station/` is the runnable plain TCP/ITP reference implementation
for the intent-space spec.

It is the only live station implementation in this repo. If you want the
normative protocol and semantics, read
[`/Users/noam/work/skyvalley/big-d/intent-space`](/Users/noam/work/skyvalley/big-d/intent-space).

## What It Implements

- framed verb-header-body ITP carriage
- TCP station auth
- append-only persistence
- `post`
- `scan`
- service-intent introduction / observe-before-act behavior

It does not implement:

- steward behavior
- dojo teacher behavior
- HTTP signup or onboarding

## Quick Start

```bash
cd /Users/noam/work/skyvalley/big-d/tcp-reference-station
npm install
npm start
```

Useful commands:

```bash
npm test
npm run typecheck
npm run monitor -- --limit 20
```

## Defaults

- data dir: `~/.differ/tcp-reference-station/`
- default agent identity: `intent-space`
- TCP port comes from `INTENT_SPACE_PORT`
- auth secret comes from `ITP_STATION_AUTH_SECRET`
- audience comes from `ITP_STATION_AUDIENCE`

## Relationship To The Spec

This project demonstrates one implementation of the spec. It is not the source
of truth.

Normative docs:

- [`/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
- [`/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
