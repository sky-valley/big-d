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

Preferred entrypoints are the preset wrapper scripts from the repo root:

```bash
./evals/scripts/headwaters-agent-pack-smoke.sh
./evals/scripts/headwaters-agent-pack-baseline.sh
./evals/scripts/headwaters-agent-pack-profiled.sh
./evals/scripts/headwaters-agent-pack-observatory.sh
./evals/scripts/headwaters-agent-pack-compare.sh
```

Each wrapper accepts extra flags at the end if you want to override a default
such as `--output-dir`, `--timeout-ms`, or `--observation-ms`.

Use the raw harness entrypoint for uncommon experiments:

```bash
cd evals
npm run headwaters:agent-pack -- --agents scripted-headwaters --trials 1
```

## Presets

### Smoke

Fast scripted smoke run to confirm the harness boots and produces artifacts.

```bash
./evals/scripts/headwaters-agent-pack-smoke.sh
```

Defaults:

- agents: `scripted-headwaters`
- profile mode: `none`
- output dir: `evals/tmp/headwaters-agent-pack-smoke/`

### Baseline

Single-trial run with real agents and no built-in profiles.

```bash
./evals/scripts/headwaters-agent-pack-baseline.sh
```

Defaults:

- agents: `codex,claude`
- profile mode: `none`
- output dir: `evals/tmp/headwaters-agent-pack-baseline/`

### Profiled

Single-trial run with deterministic built-in profiles enabled.

```bash
./evals/scripts/headwaters-agent-pack-profiled.sh
```

Defaults:

- agents: `codex,claude,claude,pi`
- profile mode: `builtin`
- output dir: `evals/tmp/headwaters-agent-pack-profiled/`

### Observatory

Baseline run with the live observatory sidecar enabled.

```bash
./evals/scripts/headwaters-agent-pack-observatory.sh
```

Defaults:

- agents: `codex,claude`
- profile mode: `none`
- observatory: enabled
- output dir: `evals/tmp/headwaters-agent-pack-observatory/`

### Compare

Runs baseline and profiled presets sequentially into separate output roots for
direct comparison.

```bash
./evals/scripts/headwaters-agent-pack-compare.sh
```

Outputs:

- `evals/tmp/headwaters-agent-pack-compare-baseline/`
- `evals/tmp/headwaters-agent-pack-compare-profiled/`

## Raw CLI Examples

Baseline real-agent run:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude --trials 1 --observation-ms 8000
```

Deterministic profiled run:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude,claude,pi --trials 1 --observation-ms 8000 --profile-mode builtin
```

Live observatory sidecar:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude --trials 1 --observation-ms 8000 --with-observatory
```

Optional observatory port base:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude --trials 2 --with-observatory --observatory-port-base 4411
```

## Output

Default output root:

- `evals/tmp/headwaters-agent-pack-eval/`

Per trial:

- `summary.json`
- `agent-map.json`
- `timeline.md`
- `agents/<agent>/stdout.log`
- `agents/<agent>/stderr.log`
- `agents/<agent>/workspace/`
- `headwaters/headwaters.log`
- `headwaters/data/commons/intent-space.db`
- `observatory/observatory.log`
- `observatory/observatory.err.log` when `--with-observatory` is enabled

When the observatory sidecar starts successfully, the harness prints its URL in
the trial logs and records it in `summary.json`.

The observatory is a live read-only visualization of the staged Headwaters run.
It is not the source of truth for verdicts; scoring still comes from the eval
harness reading `messages` and `monitoring_events` from the commons DB.

## Profile Mode

Use `--profile-mode builtin` to assign each launched agent a deterministic
built-in profile. Omitting the flag, or passing `--profile-mode none`, preserves
the current baseline harness behavior.

Built-in roster, by launch order:

1. `frontend-builder`
2. `backend-builder`
3. `creative-product`
4. `systems-investigator`
5. `generalist-builder`
6. any additional agents also receive `generalist-builder`

Profile assignment follows launch order, not agent type. Duplicate agent types
still receive different profiles when they occupy different launch slots.

Profile data appears in:

- `summary.json`
- `agent-map.json`
- `timeline.md`
- `report.md`
- launch logs emitted by the harness

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
