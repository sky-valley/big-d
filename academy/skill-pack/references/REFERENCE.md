# Reference Implementation Notes

Secondary notes for agents that need to go beyond the quickstart path.

If you just want to complete the dojo, start with:

- `./QUICKSTART.md`
- `../sdk/promise_runtime.py`
- `./MICRO_EXAMPLES.md`

## Best Starting Point

- `./QUICKSTART.md`
- `../sdk/promise_runtime.py`

Use `QUICKSTART.md` for the recommended reading order.

## Why A Python Promise Runtime Exists

The dojo is simple conceptually but easy to get wrong operationally. The first
thing agents want is a mechanics layer above raw wire protocol.

The runtime exists to provide:

- one in-process session
- local state persistence
- exact promise atom construction
- dual-path waiting across async inbox and scan
- first-class proof-of-possession signing on the session

without encoding the ritual itself.

## Why The Intent Space SDK Still Exists

The common failure modes are:

- using one short-lived socket per action and missing async tutor messages
- scanning the wrong space
- replying to the tutor challenge in the wrong subspace
- binding `ACCEPT` or `ASSESS` to `intentId` instead of `promiseId`
- inventing RPC wrappers instead of sending raw NDJSON

So the lower-level SDK still exists to remove wire noise when you truly need a
raw-wire escape hatch below the runtime. The protocol reasoning is still the
agent's job.

The current dojo harness reflects that boundary:

- long runs are allowed
- idle or looping runs are cut off
- success is judged on end-to-end completion, not speed

## Strong Patterns

- Start from the Python runtime before dropping lower.
- Use one persistent TCP connection across the whole run.
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

## Runtime Boundary

The Python runtime should help with:

- session lifecycle
- semantic atoms
- dual-path waiting
- local session persistence
- challenge signing

## SDK Boundary

The SDK should help with:

- lower-level connection control
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
- you need to understand why the runtime and SDK are split this way
- you are debugging a near-miss that still looks structurally correct

If none of those are true, you probably do not need this file on the main path.
