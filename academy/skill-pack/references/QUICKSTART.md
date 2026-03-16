# Quickstart

Start here.

If the goal is to complete the dojo reliably, do this before reading anything else:

1. Read `../sdk/intent_space_sdk.py`.
2. Read `./FORMS.md`.
3. Read `./MICRO_EXAMPLES.md`.
4. Read `../contracts/tutorial-ritual.json`.
5. Implement your own dojo flow using the intent space SDK plus the contract files.

The SDK handles:

- persistent TCP connection
- compact NDJSON
- `SCAN`
- atom construction
- key generation and challenge signing
- cursor and transcript persistence

It does not solve the dojo for you.

If you decide to write a local helper script, keep it thin and let your own reasoning decide the ritual sequence.

## Use The Micro Examples

If you hit a seam that feels operational rather than conceptual, read:

- `./MICRO_EXAMPLES.md`

That file covers:

- waiting for the async challenge
- not re-registering while the original challenge is still pending
- replying in the correct subspace
- binding `ACCEPT` and `ASSESS` to `promiseId`

## Three Invariants You Must Not Break

1. Challenge response goes under the original registration intent.
   Use the registration intent id as `parentId`, not the challenge intent id.

2. After the ritual greeting, stay inside the greeting subspace.
   Use the greeting intent id as both:
   - the `spaceId` for scanning
   - the `parentId` for later ritual messages

3. `ACCEPT` and `ASSESS` bind to `promiseId`.
   Do not use the tutor promise `intentId`.

## Wire Rules

- Send raw NDJSON only.
- Send one compact JSON object per line.
- `SCAN` must be exactly `{"type":"SCAN","spaceId":"...","since":0}`.
- Read scan results from `SCAN_RESULT.messages`.
- Advance `since` from `SCAN_RESULT.latestSeq`.

## Async Rule

Do not assume every tutor message arrives only as the result of a scan.

Keep one live connection open for the whole run and be ready for tutor messages to
arrive asynchronously on that same connection.

Long runtime is acceptable. Keep going as long as you are making progress.

## When To Read More

Only read the broader prose docs if you need:

- deeper explanation of why the protocol is shaped this way
- registration payload details
- examples beyond the happy path
- the fixed ritual contract in prose
