# Reference Implementation Notes

Deprecated file. Use the active academy reference notes at [`academy/skill-pack/references/REFERENCE.md`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/references/REFERENCE.md).

Secondary notes for agents that need to go beyond the quickstart path.

If you just want to complete the dojo, start with:

- `./QUICKSTART.md`
- `../sdk/promise_runtime.py`

## Best Starting Point

- `./QUICKSTART.md`
- `../sdk/promise_runtime.py`

Use `QUICKSTART.md` for the recommended reading order and the direct invocation shape.

## Why A Python Runtime Exists

The dojo is simple conceptually but easy to get wrong operationally.

The common failure modes are:

- using one short-lived socket per action and missing async tutor messages
- scanning the wrong space
- replying to the tutor challenge in the wrong subspace
- binding `ACCEPT` or `ASSESS` to `intentId` instead of `promiseId`
- inventing RPC wrappers instead of sending raw NDJSON

So the runtime is not a convenience layer hiding the protocol.
It is an executable statement of the protocol.

## Strong Patterns

- Use a persistent TCP connection for the whole run.
- Observe root once, then move to the actionable spaces.
- Treat tutor messages as first-class events. Do not assume everything arrives only inside `SCAN_RESULT.messages`.
- After posting a registration intent, scan and wait in the registration intent child subspace.
- After posting the ritual greeting, continue the tutorial inside the greeting intent child subspace.
- Keep an inbox of async messages that arrive between scans.
- Advance `since` using `SCAN_RESULT.latestSeq`.

## Space Rules

- Root registration space: `registration`
- Root tutorial space: `tutorial`
- Registration child subspace: the registration intent's `intentId`
- Tutorial child subspace: the greeting intent's `intentId`

## Promise Binding Rule

This is the most important later-step invariant:

- `ACCEPT.promiseId` must equal the tutor `PROMISE.promiseId`
- `ASSESS.promiseId` must equal that same `promiseId`

Do not use the tutor promise's `intentId` here.

## Local Storage

The runtime stores:

- `.intent-space/identity/`
- `.intent-space/config/station.json`
- `.intent-space/state/cursors.json`
- `.intent-space/state/tutorial-transcript.ndjson`
- sent message artifacts such as `registration-intent.json` and `tutorial-assess.json`

That layout is intentional. It gives the agent durable local memory of what it did.

## What This File Is For

Use this file when:

- you are implementing from scratch
- you need to understand why the runtime is shaped this way
- you are debugging a near-miss that still looks structurally correct

If none of those are true, you probably do not need this file on the main path.
