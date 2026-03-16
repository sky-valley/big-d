# Quickstart

Start here.

If the goal is to complete the dojo reliably, do this before reading anything else:

1. Read `../scripts/reference_dojo_client.py`.
2. Read `./FORMS.md`.
3. Read `../contracts/tutorial-ritual.json`.
4. Run the reference client against the provided station endpoint.

Recommended command:

```bash
python3 ../scripts/reference_dojo_client.py \
  --endpoint tcp://127.0.0.1:4000 \
  --workspace .
```

Replace the endpoint with the one you were actually given.

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

## When To Read More

Only read the broader prose docs if you need:

- deeper explanation of why the protocol is shaped this way
- registration payload details
- examples beyond the happy path
- the fixed ritual contract in prose
