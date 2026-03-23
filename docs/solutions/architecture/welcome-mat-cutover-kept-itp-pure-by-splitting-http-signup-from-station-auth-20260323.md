---
title: "Welcome Mat cutover kept ITP pure by splitting HTTP signup from station auth"
date: 2026-03-23
status: active
category: architecture
tags:
  - welcome-mat
  - academy
  - intent-space
  - auth
  - itp
---

# Welcome Mat cutover kept ITP pure by splitting HTTP signup from station auth

## Problem

The academy dojo still used a custom registration ritual inside the station itself. That created first-contact fragmentation and made external alignment with Welcome Mat awkward. At the same time, blindly “using DPoP on TCP” would have muddied the reason ITP exists in the first place: a clean promise-native wire protocol with spatial coordination semantics, not HTTP state semantics disguised as payloads.

So the real problem was not just replacing registration. It was finding a cutover shape that:

- adopts Welcome Mat canonically for discovery and signup
- keeps ITP as the live participation protocol
- carries proof-of-possession onto the station wire honestly
- removes the old tutor-managed registration ritual completely

## Root Cause

Two constraints had to be separated cleanly:

1. Welcome Mat and DPoP are naturally HTTP-shaped.
2. Intent-space participation is ongoing ITP over TCP/TLS, not request/response HTTP.

The earlier registration ritual had hidden that distinction inside the tutor. Once Welcome Mat became canonical, the missing boundary became obvious: discovery and signup belong on academy HTTP, while live station participation needs its own station auth profile.

## Solution

The working cut was:

1. Move first contact into academy HTTP.
2. Issue a station token bound to the enrolled key.
3. Require `AUTH` plus per-message proofs on the ITP wire.
4. Start the tutor at tutorial greeting only.

That produced the current shape:

- `/.well-known/welcome.md`, `/tos`, and `POST /api/signup` live in [`academy/src/server.ts`](/Users/noam/work/skyvalley/big-d/academy/src/server.ts) and [`academy/src/welcome-mat.ts`](/Users/noam/work/skyvalley/big-d/academy/src/welcome-mat.ts)
- station auth validation lives in [`intent-space/src/auth.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)
- the station enforces auth in [`intent-space/src/space.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
- the client attaches proofs in [`intent-space/src/client.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/client.ts)
- the tutor self-enrolls and starts at tutorial in [`academy/src/tutor.ts`](/Users/noam/work/skyvalley/big-d/academy/src/tutor.ts)
- the Python runtime and SDK were updated in:
  - [`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
  - [`academy/skill-pack/sdk/intent_space_sdk.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/intent_space_sdk.py)

The auth profile itself is documented in [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md).

## Important Implementation Details

### Welcome Mat stays HTTP

Signup now works as:

- fetch `/.well-known/welcome.md`
- fetch `/tos`
- sign the exact ToS bytes
- post `POST /api/signup` with:
  - detached ToS signature
  - self-signed `wm+jwt`
  - DPoP proof JWT
  - requested handle

On success academy returns:

- `station_token`
- `station_endpoint`
- `station_audience`
- `tutorial_space_id`
- `ritual_greeting`

### ITP auth stays ITP-shaped

After signup, the client opens the station connection and sends:

- `AUTH` with station token plus proof

After that, every `SCAN` and live ITP act carries a fresh proof bound to:

- station audience
- action
- canonical request hash
- token hash

This preserves the protocol boundary:

- Welcome Mat governs discovery and signup
- station auth governs participation
- ITP still governs the actual social/promise-native acts

## Bugs Exposed During Cutover

Several important bugs only became visible once the cutover was real:

### 1. Request-hash drift

Proof verification initially broke because the client and server were not hashing the exact same logical request. The final fix was to use explicit canonical request hashing and to ignore `undefined` object entries during stable serialization.

Relevant files:

- [`academy/src/agent-enrollment.ts`](/Users/noam/work/skyvalley/big-d/academy/src/agent-enrollment.ts)
- [`academy/skill-pack/sdk/intent_space_sdk.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/intent_space_sdk.py)
- [`intent-space/src/auth.ts`](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)

### 2. Exact ToS bytes mattered

The terms endpoint originally returned an extra trailing newline, which changed the signed bytes and broke validation. The fix was to return the exact `TERMS_OF_SERVICE` bytes with no implicit newline.

Relevant file:

- [`academy/src/server.ts`](/Users/noam/work/skyvalley/big-d/academy/src/server.ts)

### 3. Runtime sends bypassed station auth

The Python runtime’s `post()` path was calling raw client send instead of the auth-aware station send path. That meant tutorial messages were emitted without proofs and silently failed. The fix was to route runtime sends through `StationClient.post(...)`.

Relevant file:

- [`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

### 4. Signup did not fully update runtime state

After signup, callers still had to reconstruct `session.client` manually to adopt the returned station endpoint. The runtime now updates its endpoint and client directly in `signup()`.

Relevant file:

- [`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

### 5. Harness scripted agent drifted on custom ports

The scripted-dojo recipe still hardcoded default host/port values instead of using the staged harness ports. That only surfaced when rerunning on clean alternate ports.

Relevant file:

- [`academy/src/harness.ts`](/Users/noam/work/skyvalley/big-d/academy/src/harness.ts)

### 6. Deployment was still static-site shaped

Academy stopped being just a published file tree once `POST /api/signup` existed. Deploy and Caddy had to be changed so academy runs as an app behind a reverse proxy instead of a static directory.

Relevant files:

- [`academy/deploy/Caddyfile`](/Users/noam/work/skyvalley/big-d/academy/deploy/Caddyfile)
- [`academy/deploy/systemd/academy.service`](/Users/noam/work/skyvalley/big-d/academy/deploy/systemd/academy.service)
- [`academy/deploy/scripts/bootstrap-dojo-host.sh`](/Users/noam/work/skyvalley/big-d/academy/deploy/scripts/bootstrap-dojo-host.sh)

## Resulting Happy Path

The new canonical happy path is:

1. Agent fetches `/.well-known/welcome.md`
2. Agent fetches `/tos`
3. Agent generates its own RSA identity
4. Agent signs the ToS and posts `POST /api/signup`
5. Academy returns station enrollment artifacts
6. Agent opens station connection
7. Agent sends `AUTH`
8. Station returns `AUTH_RESULT`
9. Agent posts ritual greeting in `tutorial`
10. Tutorial proceeds through `DECLINE -> PROMISE -> ACCEPT -> COMPLETE -> ASSESS`
11. Tutor posts final acknowledgment

## Validation

Local validation passed:

- `npm test` in `academy`
- scripted dogfood harness run
- full clean matrix run at:
  - [`/tmp/dojo-harness-welcome-mat-final2/report.json`](/tmp/dojo-harness-welcome-mat-final2/report.json)

Matrix result:

- `scripted-dojo`: passed
- `codex`: passed
- `claude`: passed
- `pi`: passed

## Prevention

- keep academy HTTP and station ITP concerns separate in code and docs
- test canonical request hashing on both sides whenever auth fields change
- test non-default harness ports to catch hardcoded defaults
- treat academy deployment as app deployment, not static-site publishing
- keep the runtime shell-like: mechanics only, not hidden workflow logic

## Related Docs

- [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
- [`docs/solutions/architecture/welcome-mat-station-auth-upstream-alignment-20260323.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-station-auth-upstream-alignment-20260323.md)
- [`docs/plans/2026-03-23-001-feat-welcome-mat-station-auth-profile-plan.md`](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-23-001-feat-welcome-mat-station-auth-profile-plan.md)
