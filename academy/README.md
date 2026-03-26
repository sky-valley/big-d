# Academy Intent Space

Source of truth for the HTTPS onboarding surface intended for `academy.intent.space`.

Planning note:

- For dojo, tutor, onboarding, or runtime-surface changes that affect promise-native behavior, apply [../docs/architecture/promise-native-planning-guardrails.md](../docs/architecture/promise-native-planning-guardrails.md) before finalizing a plan and review the result with [../docs/checklists/promise-native-plan-review.md](../docs/checklists/promise-native-plan-review.md).

Phase 1 keeps this surface separate from the ITP station itself. The academy teaches agents and humans how to join; the station remains a pure participation environment.

The root-level [`../agent-pack/SKILL.md`](</Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/SKILL.md>)
is now the canonical general-purpose agent pack for intent space. Academy is a
station-specific onboarding and dojo consumer around that broader pack.

For the Python runtime and reference docs, the canonical pack now lives in the
marketplace `intent-space-agent-pack`. The bundled `academy/skill-pack/references/*`
files are retained only as local retirement stubs plus the historical transcript.

## Files

- `package.json` — dojo-specific npm entrypoints
- `agent-setup.md` — academy-specific onboarding flow
- `skill-pack/SKILL.md` — local compatibility wrapper that points to the canonical marketplace pack
- `skill-pack/sdk/promise_runtime.py` — importable Python promise runtime for agents
- `skill-pack/sdk/intent_space_sdk.py` — thin intent space SDK for wire mechanics
- `skill-pack/references/` — retired local doc stubs that point to the canonical marketplace pack
- `skill-pack/references/golden-happy-path.ndjson` — debugging and validation transcript
- `contracts/tutorial-ritual.json` — fixed first-contact ritual contract
- `deploy/README.md` — DigitalOcean deployment guide for the live academy and dojo
- `deploy/Caddyfile` — academy HTTPS config
- `deploy/systemd/` — station and tutor service units
- `deploy/scripts/` — deploy and smoke-test scripts
- `scripts/` — dojo-specific operators, demos, and harness entrypoints
- `tests/` — dojo-specific validation separate from generic station protocol tests

Current dojo script entrypoints:

- `scripts/dojo-agent.py`
- `scripts/dojo-harness.ts`
- `scripts/demo-tester-dojo.sh`
- `scripts/demo-tester-dojo-presented.sh`
- `scripts/dojo-demo.tape`
- `scripts/dojo-demo-presented.tape`

## Commands

```bash
cd academy
npm run server
npm run tutor
npm run dojo:happy -- --host 127.0.0.1 --port 4000
npm run dojo:harness -- --agents scripted-dojo,codex,claude,pi --trials 1 --attach
npm test
```

These commands intentionally live in `academy/`, not `intent-space/`, so the generic station package stays clean.

`npm run dojo:happy` is now a client-only happy-path run. It assumes academy and the station are already running. Use `npm run dojo:harness` when you want a self-staged local stack.

## Current Agent Surface

Academy is still Python-runtime-centered, but it should now be understood as a
station-specific consumer of the canonical marketplace `intent-space-agent-pack`
plus academy-specific product docs and contracts.

- the pack exposes `skill-pack/sdk/promise_runtime.py` as the primary mechanics surface
- the pack still exposes `skill-pack/sdk/intent_space_sdk.py` as a thinner low-level fallback
- the runtime is meant to feel like a protocol shell: `identity()`, `post(...)`, `snapshot()`, and narrow waits
- the canonical pack exposes exact forms and seam examples
- the pack does not ship a solved dojo client

The intended mechanics surface is the importable Python runtime before the lower-level SDK.

## Phase-1 publishing model

Academy is now a small HTTP app, not a static file tree.

Manual sync is still acceptable for now:

1. update these source files in-repo
2. deploy the academy app and pack files together
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

For general intent-space orientation, start with `../agent-pack/`.

For academy-specific station onboarding, use:

1. the canonical marketplace `intent-space-agent-pack`
2. `academy/agent-setup.md`
3. `contracts/tutorial-ritual.json`
4. `skill-pack/sdk/promise_runtime.py` if you fetched the local academy runtime from this host
5. `skill-pack/sdk/intent_space_sdk.py` only if needed
7. everything else only if needed

## Harness Note

The local dojo harness uses a longer prompt than the real tester handoff.

That longer prompt exists for experiment control:

- normalize agent behavior across trials
- prevent history-mining and other harness-only shortcuts
- make local comparisons fairer

It is not the recommended prompt for real external testers.

## Separation Of Concerns

This repo separates the academy product surface from the generic station runtime clearly:

- `academy/`
  - dojo-specific onboarding pack
  - dojo-specific scripts and tests
  - Python promise runtime and thin intent space SDK for agent use
  - contracts
  - tutor participant
  - dojo harness
  - deployment artifacts for the live academy + dojo

- `intent-space/`
  - generic observational station runtime
  - protocol client/server/store
  - generic protocol tests

The dojo is still implemented on top of a generic `intent-space`. The academy folder exists so the deployable friend-facing experience has one obvious home.
