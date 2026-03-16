# Dojo Agent Evaluation Harness Runbook

**Date:** 2026-03-14
**Status:** Draft

## Purpose

Run a local evaluation matrix against the academy + station + tutor dojo using real native agent CLIs, one top-level instruction, and persisted artifacts for every trial.

This harness is for local protocol-pack evaluation, not for deployed internet-station testing.

## Components

### Harness Core

- `academy/src/harness.ts`
- `academy/scripts/dojo-harness.ts`

Responsibilities:
- stage or attach to the local dojo
- launch agent recipes
- capture transcripts and workspace artifacts
- classify failure stage
- classify cleanliness of success
- classify helper generation / execution mode
- write per-run summaries and aggregate reports

### Reference Scripted Agent

- `academy/scripts/dojo-agent.ts`

Responsibilities:
- serve as a deterministic happy-path reference
- validate harness staging, transcript capture, and classification without relying on paid CLI runs

### Existing Dojo Substrate

- `academy/src/tutor.ts`
- `academy/agent-setup.md`
- `academy/skill-pack/SKILL.md`

## Output Layout

Default output root:

- `/tmp/dojo-harness/`

Per run:

- `report.json`
- `report.md`
- `<agent>/trial-01/summary.json`
- `<agent>/trial-01/stdout.log`
- `<agent>/trial-01/stderr.log`
- `<agent>/trial-01/station-transcript.jsonl`
- `<agent>/trial-01/workspace/`

Current `summary.json` fields also include:

- dominant `agentId`
- all observed `agentIds`
- `cleanliness` (`single-pass` vs `self-repaired`)
- `repairSignals`
- `helperMode` (`none`, `generated-not-executed`, `generated-executed`)
- `helperFiles`
- `helperLanguage`

## Supported Targets

Current recipes:

- `scripted-dojo`
- `codex`
- `claude`
- `pi`

Notes:
- `pi` is treated as a native target, but if the CLI command is not installed locally the harness records it as `unavailable`.
- The harness must not do the protocol work for these targets.

## How To Run

### 1. Attach to an already running local dojo

Example:

```bash
cd academy
npm run dojo:harness -- --agents codex,claude,pi --trials 3 --attach --output-dir tmp/dojo-harness-matrix
```

### 2. Run a quick scripted validation

```bash
cd academy
npm run dojo:harness -- --agents scripted-dojo --trials 1 --attach --output-dir tmp/dojo-harness-smoke
```

### 3. Bound agent runtime with a shorter timeout

```bash
cd academy
npm run dojo:harness -- --agents codex --trials 1 --attach --timeout-ms 120000
```

## Prompt Contract

Each recipe gets one top-level instruction only.

The current prompt includes:
- skill-pack path
- academy doc path / URL
- local station endpoint
- per-run workspace path
- terminal success condition

The harness should not add hidden step-by-step protocol guidance beyond that.

Important:

- the harness prompt is intentionally longer than the real external tester prompt
- that extra length is for local experiment control and fair comparison
- the real tester handoff should stay short and defer protocol detail to `https://academy.intent.space`

See:

- [academy/README.md](/Users/noam/work/skyvalley/big-d/academy/README.md)
- [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)

## Failure Stages

Current classifier stages:

- `pre-dojo`
- `registration`
- `challenge-response`
- `tutorial-navigation`
- `decline-recovery`
- `accept`
- `assess`
- `completed`
- `timeout`
- `unavailable`
- `unknown`

These are derived primarily from station transcript evidence, not from agent self-report.

## Healthy Signals

- report file is written
- each run has a `summary.json`
- workspace artifacts are captured
- scripted-dojo passes
- successful native agents reach `completed`
- successful runs clearly distinguish single-pass vs self-repaired behavior
- helper usage is explicit in the report, not inferred later by hand
- failed native agents still produce enough transcript to classify where they broke

## Failure Signals

- agent CLI exits with no artifacts
- transcript is missing despite a live dojo
- runs hang without `ASSESS` and without useful logs
- report generation omits failed or unavailable targets

## Recipe Model

Recipes are defined in `academy/src/harness.ts` and should specify:

- command name
- argument builder from:
  - repo root
  - workspace dir
  - top-level prompt

To add a new agent recipe:

1. add a new target to `AgentTarget`
2. add a recipe entry in `getRecipe()`
3. ensure the recipe uses one top-level instruction only
4. verify output capture works
5. run at least one local trial and inspect artifacts

Do not add per-agent semantic adapters that perform registration, signing, or ritual recovery on the agent’s behalf.

## Monitoring Notes

The harness is local-only for now, so “monitoring” means:

- inspect `report.json`
- inspect `report.md`
- inspect `summary.json` per run
- inspect `station-transcript.jsonl` for classification mismatches

## Known Current Results

Current local validation shows:

- `scripted-dojo`, `codex`, `claude`, and `pi` can all complete the dojo under the harness
- Codex required an explicit `model_reasoning_effort="medium"` pin in the recipe to behave reliably
- the matrix results are now honest about helper generation and self-repair instead of compressing everything into pass/fail
- duplicate tutor noise seen in one earlier matrix turned out to be caused by two managed local-station sessions running at once, not by the ritual contract itself
