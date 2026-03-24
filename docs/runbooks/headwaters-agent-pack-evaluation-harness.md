# Headwaters Agent-Pack Evaluation Harness

Run a local Headwaters-backed evaluation against the root-level `agent-pack/`
without using the guided Headwaters walkthrough as the test contract.

This harness:

- stages a local Headwaters backend
- gives agents only the local `agent-pack/` directory plus a staged base URL
- injects a delayed commons intent after a quiet observation window
- scores from read-only `messages` and `monitoring_events` in the commons
  `intent-space.db`

## Run

```bash
cd evals
npm run headwaters:agent-pack -- --agents scripted-headwaters --trials 1
```

Example with real agents:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude --trials 1 --observation-ms 8000
```

## Output

Default output root:

- `evals/tmp/headwaters-agent-pack-eval/`

Per trial:

- `summary.json`
- `agents/<agent>/stdout.log`
- `agents/<agent>/stderr.log`
- `agents/<agent>/workspace/`
- `headwaters/headwaters.log`
- `headwaters/data/commons/intent-space.db`

## Current First-Cut Verdicts

- `orientation`
  Passes when each evaluated agent shows successful auth and scan evidence in
  the commons monitoring log.
- `coexistence`
  Passes when multiple agents show actual shared-space observation or message
  activity rather than one agent alone doing all visible work.
- `collaboration`
  Passes when at least two evaluated agents post non-injected commons messages
  after the delayed shared build intent appears.

These verdicts are intentionally simple first-cut heuristics backed by the
station DB. Tighten them as the evaluation loop matures.
