---
title: "Headwaters exposed that spawned spaces need per-space auth and runtime handoff"
date: 2026-03-23
status: active
category: architecture
tags:
  - headwaters
  - intent-space
  - runtime
  - auth
  - welcome-mat
  - spawned-spaces
---

# Headwaters exposed that spawned spaces need per-space auth and runtime handoff

## Problem

Headwaters was the first product in the repo that needed to provision real new intent spaces and then hand an agent off into one of those spaces immediately.

That looked straightforward at first because the repo already had:

- a generic station in `intent-space/`
- Welcome Mat + station auth for academy
- a Python protocol-shell runtime that agents were comfortable using

But the first real spawned-space flow exposed that some of those “generic” seams were still academy-shaped.

## Root Cause

Two assumptions had remained hidden while there was only one meaningful station per flow:

1. **Station auth still assumed one default audience/secret shape.**
   Academy had already moved auth out of the tutorial ritual, but the live station still largely assumed “the station” as one thing.

2. **The Python runtime assumed one station per session.**
   The runtime could sign up and participate well, but it did not yet model: “same agent key, new token, new audience, new endpoint, keep going.”

Headwaters broke both assumptions immediately because the product flow is:

- join commons
- ask steward for a home space
- receive a fresh endpoint/token/audience
- connect into that new space directly

That is not a variation of the dojo. It is a real spawned-space handoff with a
new audience and token binding, even when the product later reuses one shared
station endpoint.

## Solution

The working cut was:

1. make station auth audience explicit per `IntentSpace` instance
2. make auth secret explicit per `IntentSpace` instance
3. add a publish hook so the commons can drive a steward without inventing a second protocol family
4. extend the Python runtime with a generic `connect_to(...)` handoff for newly issued spaces

That produced a clean Headwaters first slice:

- a public commons
- a canonical steward
- explicit `create-home-space`
- provisioning of a real dedicated home space
- direct connection into the new space with fresh credentials

## What Changed

### 1. `intent-space` became per-space auth aware

Files:

- [auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)
- [space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)

Key changes:

- `defaultStationAudience()` replaced the older implicit single-audience assumption
- `verifyAuthRequest(...)` now accepts an explicit audience
- `verifyPerMessageProof(...)` now accepts an explicit audience
- `IntentSpace` now accepts:
  - `stationAudience`
  - `authSecret`
  - `authResult`
  - `onStoredMessage`
- `IntentSpace.publish(...)` was added so a service participant can publish through the same station instead of side-channeling around it

This kept the protocol clean:

- still one station runtime
- still one message family
- still no Headwaters-only wire protocol

### 2. The runtime learned to change stations without changing identity

File:

- [promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

Key change:

- `PromiseRuntimeSession.connect_to(...)`

That method reuses the same local key material but switches the live session to:

- a new endpoint or reused shared endpoint
- a new station token
- a new audience

That was the missing mechanic for spawned-space flows.

The important point is that Headwaters did **not** need a separate new runtime.
It needed the existing protocol-shell runtime to become honest about
multi-space participation with per-space auth artifacts.

### 3. Headwaters itself surfaced a consistency bug in service discovery

Files:

- [main.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/main.ts)
- [welcome-mat.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/welcome-mat.ts)

The initial local dogfood run failed because the Headwaters welcome surface advertised `localhost` while the runtime was using `127.0.0.1`.

That caused the expected failure:

- access token audience was signed for one origin
- signup validated against another

The fix was to make Headwaters publish a self-consistent origin and commons endpoint from the actual runtime configuration instead of relying on mismatched defaults.

### 4. Real spawned spaces exposed real ops constraints

File:

- [provisioner.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/provisioner.ts)

The first home-space provisioning attempts failed locally because per-space Unix socket paths under long temporary directories exceeded platform limits.

The practical fix was to shorten the spawned-space socket path under the system temp dir.

The deeper lesson is useful:

- “real dedicated spaces” means real lifecycle and ops concerns appear immediately
- not just product semantics

## Result

Headwaters now has a real vertical slice:

- sign up to Headwaters over HTTP
- authenticate into the commons
- address the steward
- request `create-home-space`
- receive a reply containing:
  - endpoint
  - new audience
  - new station token
- connect directly into the spawned home space
- post there successfully

The later Headwaters hosting cut kept this learning but clarified the product
shape:

- spawned spaces now normally share one station endpoint
- the real handoff is audience/token/space binding, not necessarily a new port
- the canonical generic runtime docs now live in the marketplace pack, while
  Headwaters still serves a local runtime copy for convenience

Validated by:

- `cd headwaters && npm test`
- `cd academy && npm test`
- `cd headwaters && npm run headwaters:happy -- --headwaters-url http://127.0.0.1:8090 --host 127.0.0.1 --port 4010 --workspace /tmp/headwaters-agent-dogfood`

## Prevention

- Treat station audience as an instance-level concern, not a global default, whenever a product can mint or host more than one real space.
- Keep the Python runtime focused on mechanics, but ensure it can hand off into newly issued spaces with the same local identity.
- Validate Welcome Mat discovery against the exact live origin/endpoint values the product will publish; `localhost` vs `127.0.0.1` drift is enough to break PoP flows.
- Expect “real dedicated spaces” to surface runtime and lifecycle constraints early. Do not assume subspace-era local defaults will survive a spawning product unchanged.

## Related Docs

- [2026-03-23-headwaters-managed-intent-spaces-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md)
- [2026-03-23-002-feat-headwaters-managed-intent-spaces-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-23-002-feat-headwaters-managed-intent-spaces-plan.md)
- [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
- [protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
