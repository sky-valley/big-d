---
title: "Headwaters needed a separate steward and private request subspaces to keep space creation promise-native"
date: 2026-03-24
status: active
category: architecture
tags:
  - headwaters
  - intent-space
  - steward
  - promises
  - autonomy
  - privacy
  - provisioning
---

# Headwaters needed a separate steward and private request subspaces to keep space creation promise-native

## Problem

The first Headwaters slice worked, but space creation was not actually happening through the promise protocol.

An agent would post a provisioning intent in the commons, and the service would notice that stored message and provision a space through an embedded callback. That got a home-space flow running quickly, but it had two bad properties:

- the steward was not a real autonomous participant
- space creation skipped the cooperative lifecycle that the rest of intent-space is supposed to make endemic

That made Headwaters less reusable and less faithful to the repo's architectural stance than it looked from the outside.

## Root Cause

Two shortcuts were doing too much hidden work.

### 1. The steward lived inside the service instead of the space

`HeadwatersService` was acting like both:

- the commons station host
- the provisioning actor

So stewardship was implemented as a stored-message hook, not as an agent that scans, promises, accepts commitments, and fulfills them.

### 2. Provisioning details were returned as a direct service reply

The original flow treated space creation as:

- request intent
- service callback
- reply with endpoint/token/audience

That bypassed:

- `PROMISE`
- requester `ACCEPT`
- requester `ASSESS`

It also risked leaking fulfillment details into a public commons-shaped conversation unless Headwaters added a real privacy boundary.

## Solution

The working cut was to make provisioning a genuine promise-native interaction.

### 1. Move the steward into a separate process

Files:

- [headwaters/src/steward.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward.ts)
- [headwaters/src/steward-main.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward-main.ts)
- [headwaters/src/steward-process.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward-process.ts)
- [headwaters/src/main.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/main.ts)

Headwaters now starts the commons service and a distinct steward process.

The steward:

- authenticates to the commons like any other participant
- publishes its own presence
- scans the commons
- decides what to promise
- provisions the new space directly
- publishes `PROMISE` and `COMPLETE` through ITP rather than through a side-channel callback

That restores a real autonomy boundary:

- Headwaters hosts the commons
- the steward is the actor that makes and fulfills provisioning promises

### 2. Use the full successful promise lifecycle

Files:

- [headwaters/src/steward.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/steward.ts)
- [headwaters/tests/test-home-space.ts](/Users/noam/work/skyvalley/big-d/headwaters/tests/test-home-space.ts)
- [headwaters/scripts/headwaters-agent.py](/Users/noam/work/skyvalley/big-d/headwaters/scripts/headwaters-agent.py)

The new happy path is:

1. requester posts provisioning `INTENT`
2. steward posts `PROMISE`
3. requester posts `ACCEPT`
4. steward provisions the space and posts `COMPLETE`
5. requester posts `ASSESS`

The fulfillment artifact lives in `COMPLETE`.

For home spaces that includes one space descriptor plus the issued access
artifacts for the requester.

For shared spaces the same lifecycle now returns one shared space descriptor
plus participant-specific access artifacts rather than one flat top-level token
for everyone.

That made space creation look like the same kind of cooperative act the rest of the system already uses, instead of a service-shaped exception.

### 3. Add private request subspaces as a real policy

Files:

- [intent-space/src/types.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/types.ts)
- [intent-space/src/store.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/store.ts)
- [intent-space/src/space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)

Provisioning conversations now use a declared private participant set on the request intent.

For Headwaters home-space provisioning, that means the request subspace is private to:

- the requester
- the steward

This is not a one-off Headwaters hack. The store and scan layer now understand a general private-space policy, and live broadcasting/filtering respects it too.

That solved the privacy problem cleanly:

- the request can start in the commons
- the cooperative lifecycle happens in the request interior
- fulfillment details do not leak to unrelated participants

### 4. Persist enough identity binding for a separate steward to mint new station tokens

Files:

- [headwaters/src/enrollment-registry.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/enrollment-registry.ts)
- [headwaters/src/server.ts](/Users/noam/work/skyvalley/big-d/headwaters/src/server.ts)

Once the steward became a real separate process, it could no longer rely on HTTP-signup-local state hidden inside the service object.

The first steward cut persisted enough enrollment-key binding for the separate
steward to mint spawned-space tokens. Headwaters later tightened this further by
introducing explicit station-local `principal_id` records and keying durable
ownership to those principals rather than to the self-chosen handle.

That was the missing bridge between:

- HTTP enrollment
- autonomous in-space provisioning
- direct participation in the spawned space

## What Broke Along The Way

One generic `intent-space` bug appeared immediately once provisioning became a real multi-step lifecycle.

Files:

- [intent-space/src/store.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/store.ts)

Non-`INTENT` messages were not reliably preserving `intentId` when written to the store. That had not mattered much before, but the steward now depends on reconstructing:

- which `PROMISE` belongs to which request
- which `ACCEPT` binds which promise
- which `COMPLETE` fulfills which request thread

The fix was to persist a separate `intent_ref` for non-`INTENT` messages and return it during scans.

So the steward refactor also proved that promise-native flows need message persistence to preserve thread linkage for every lifecycle act, not just intents.

## Result

Headwaters now behaves like a real managed intent-space service without stepping outside the protocol family it is supposed to demonstrate.

An agent can:

- sign up over Welcome Mat
- authenticate to the commons
- post a provisioning intent with a private participant set
- receive a steward `PROMISE`
- `ACCEPT` it
- receive `COMPLETE` with dedicated-space credentials
- `ASSESS` the fulfillment
- connect directly to the spawned home space
- post there successfully

This was validated through:

- `cd intent-space && npm test`
- `cd headwaters && npm test`
- `cd academy && npm test`
- the updated Claude eval loop at [headwaters-claude-eval-loop.sh](/Users/noam/work/skyvalley/big-d/evals/scripts/headwaters-claude-eval-loop.sh)

The fresh-agent loop also confirmed that the public Headwaters pack remained usable after the steward cutover. The main runtime change needed was only a small ergonomics fix: `wait_for_promise()` and `wait_for_complete()` had to accept explicit parent/request ids for provisioning threads.

## Prevention

- If a managed intent-space product claims that an action is promise-native, do not implement fulfillment with embedded service callbacks. Put a real participant in the space and make it use the lifecycle.
- When a commons conversation can yield sensitive fulfillment artifacts, give the request interior an explicit participant policy from the first act.
- Treat per-message thread linkage as persistence-critical. `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS` all need durable request association, not just `INTENT`.
- When splitting a service actor out of the HTTP host, explicitly persist whatever identity binding that actor will need later. Do not rely on hidden in-memory signup context.
- Keep the public agent pack in the validation loop whenever the workflow changes. The pack staying comfortable after the steward refactor mattered as much as the refactor itself.

## Refresh Note

Two later Headwaters changes matter when reading this learning now:

- durable ownership and wire identity are now principal-based, not handle-based
- shared-space provisioning extends the same promise-native request-interior
  pattern to a fixed participant set

Those changes refine the identity and fulfillment details, but they do not
change the core learning that the steward had to become a real participant and
that the provisioning lifecycle belongs in the private request interior.

## Related Docs

- [headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
- [headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md)
- [2026-03-24-headwaters-promise-native-steward-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-promise-native-steward-requirements.md)
- [2026-03-24-001-feat-headwaters-promise-native-steward-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-24-001-feat-headwaters-promise-native-steward-plan.md)
