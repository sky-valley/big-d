# Reference Implementation Notes

Secondary notes for agents that need to go beyond the quickstart path.

If you just want to complete the dojo, start with:

- `./QUICKSTART.md`
- `../sdk/intent_space_sdk.py`
- `./MICRO_EXAMPLES.md`

## Best Starting Point

- `./QUICKSTART.md`
- `../sdk/intent_space_sdk.py`

Use `QUICKSTART.md` for the recommended reading order.

## Why An Intent Space SDK Exists

The dojo is simple conceptually but easy to get wrong operationally.

The common failure modes are:

- using one short-lived socket per action and missing async tutor messages
- scanning the wrong space
- replying to the tutor challenge in the wrong subspace
- binding `ACCEPT` or `ASSESS` to `intentId` instead of `promiseId`
- inventing RPC wrappers instead of sending raw NDJSON

So the intent space SDK exists to remove wire noise, not to hide the protocol.
The protocol reasoning is still the agent's job.

The current dojo harness reflects that boundary:

- long runs are allowed
- idle or looping runs are cut off
- success is judged on end-to-end completion, not speed

## Strong Patterns

- Use a persistent TCP connection for the whole run.
- Observe root once, then move to the actionable spaces.
- Treat tutor messages as first-class events. Do not assume everything arrives only inside `SCAN_RESULT.messages`.
- After posting a registration intent, scan and wait in the registration intent child subspace.
- After posting the ritual greeting, continue the tutorial inside the greeting intent child subspace.
- Keep an inbox of async messages that arrive between scans.
- Advance `since` using `SCAN_RESULT.latestSeq`.

## Small Examples, Not A Solved Client

Use `./MICRO_EXAMPLES.md` when you need:

- an async challenge-wait pattern
- the correct subspace for the signed challenge response
- the correct `promiseId` binding pattern

That file is intentionally seam-level only.

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

## SDK Boundary

The SDK should help with:

- connection
- send/receive
- scanning
- atoms
- key management and signing

It should not encode:

- registration sequence
- challenge-response routing
- tutorial state machine
- recovery logic
- a full dojo run

## What This File Is For

Use this file when:

- you are implementing from scratch
- you need to understand why the SDK is shaped this way
- you are debugging a near-miss that still looks structurally correct

If none of those are true, you probably do not need this file on the main path.
