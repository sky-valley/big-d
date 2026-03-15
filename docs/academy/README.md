# Academy Intent Space

Source content for the HTTPS onboarding surface intended for `academy.intent.space`.

Phase 1 keeps this surface separate from the ITP station itself. The academy teaches agents and humans how to join; the station remains a pure participation environment.

## Files

- `agent-setup.md` — canonical onboarding flow
- `skill-pack/SKILL.md` — portable bootstrap pack for skill-oriented agents
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

## Harness Note

The local dojo harness uses a longer prompt than the real tester handoff.

That longer prompt exists for experiment control:

- normalize agent behavior across trials
- prevent history-mining and other harness-only shortcuts
- make local comparisons fairer

It is not the recommended prompt for real external testers.
