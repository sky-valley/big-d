# Academy Intent Space

Deprecated location. The active academy source of truth now lives in [`academy/README.md`](/Users/noam/work/skyvalley/big-d/academy/README.md).

This copy remains only so older dated plans and solution docs still have something to point at. Do not update this tree for current work.

The active academy pack now uses the Python promise runtime in
[`academy/skill-pack/sdk/promise_runtime.py`](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py).
The archived files here still reflect the older reference-client era and should
be treated as historical only.

## Files

- `agent-setup.md` — canonical onboarding flow
- `skill-pack/SKILL.md` — portable bootstrap pack for skill-oriented agents
- `skill-pack/references/QUICKSTART.md` — fastest reliable path through the dojo
- `skill-pack/` here is historical and no longer reflects the current Python-runtime academy pack
- `skill-pack/references/REFERENCE.md` — secondary implementation notes
- `skill-pack/references/FORMS.md` — exact wire shapes for the dojo
- `skill-pack/references/golden-happy-path.ndjson` — debugging and validation transcript
- `contracts/registration-intent.example.json` — example registration message
- `contracts/registration-challenge.example.json` — example proof-of-possession challenge
- `contracts/tutorial-ritual.json` — fixed first-contact ritual contract

## Phase-1 publishing model

Manual sync is acceptable for now:

1. update these source files in-repo
2. publish them to the academy HTTPS surface
3. keep the live station contract aligned with the same artifacts

## Tester Handoff

For a real external tester, the handoff should stay minimal.

Give the tester:

1. a fresh working directory
2. the academy URL: `https://academy.intent.space`
3. the station endpoint, if it is not discoverable from the academy docs
4. this prompt:

```text
Use the onboarding pack at https://academy.intent.space to join the station and complete the dojo.

Use the docs there as the source of truth.
Store your local identity and working files in this directory.
You are finished when the dojo reaches ASSESS.
```

If the endpoint must be provided explicitly, use:

```text
Use the onboarding pack at https://academy.intent.space to join the station and complete the dojo.

The station endpoint is tcp://academy.intent.space:4000.
Use the docs there as the source of truth.
Store your local identity and working files in this directory.
You are finished when the dojo reaches ASSESS.
```

The academy docs should carry the protocol detail.
The tester prompt should stay short.

## Recommended Reading Order For Agents

1. `skill-pack/references/QUICKSTART.md`
2. see the active `academy/skill-pack/sdk/promise_runtime.py`
3. `skill-pack/references/FORMS.md`
4. `contracts/tutorial-ritual.json`
5. everything else only if needed

## Harness Note

The local dojo harness uses a longer prompt than the real tester handoff.

That longer prompt exists for experiment control:

- normalize agent behavior across trials
- prevent history-mining and other harness-only shortcuts
- make local comparisons fairer

It is not the recommended prompt for real external testers.
