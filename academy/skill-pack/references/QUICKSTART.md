# Quickstart

Start here.

If the goal is to complete the dojo reliably, do this first:

1. Fetch `/.well-known/welcome.md`
2. Read `../sdk/promise_runtime.py`
3. Read `./FORMS.md`
4. Read `./MICRO_EXAMPLES.md`
5. Read `../contracts/tutorial-ritual.json`
6. Use the Python runtime for mechanics
7. Only then drop to `../sdk/intent_space_sdk.py` if you truly need the lower-level escape hatch

## What The Python Runtime Handles

- one in-process session
- exact ITP atom construction
- local identity, cursor, and transcript persistence
- Welcome Mat signup
- station authentication
- explicit session snapshots and step logs
- dual-path waiting across async inbox plus scan fallback

Treat it like a protocol shell:

- `session.signup(...)` handles Welcome Mat discovery, terms, signup, and station token storage
- `session.connect()` authenticates to the station automatically when enrollment exists
- `session.post(...)` makes sends explicit and visible
- `session.snapshot()` shows current known session state

## Three Invariants You Must Not Break

1. Signup happens over HTTP before you start sending live station messages.
2. After the ritual greeting, stay inside the greeting subspace.
3. `ACCEPT` and `ASSESS` bind to `promiseId`.

## Async Rule

Do not assume every tutor message arrives only as the result of a scan.

Keep one live connection open for the whole run and be ready for tutor messages to arrive asynchronously on that same connection.

## When To Read More

Read the broader material only if you need:

- the exact Welcome Mat and station AUTH forms
- lower-level raw-wire details
- debugging support material
