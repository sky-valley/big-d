---
title: "feat: Multi-Agent Swarm Evaluation Pipeline"
type: feat
status: active
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-multi-agent-swarm-eval-requirements.md
---

# feat: Multi-Agent Swarm Evaluation Pipeline

## Overview

Augment the existing evals harness to support 10-agent swarm trials. The current harness runs 2 agents (typically one Claude, one Codex) against a shared Headwaters intent space. This plan scales that to 10 configurable agents — any mix of Claude, Codex, Pi, and scripted-headwaters — to test emergent coordination at scale.

The harness is primarily an orchestration and evidence-capture tool. Automated scoring stays lightweight; the real evaluation comes from the tester reading agent stdout logs and a consolidated timeline to assess how agents think, self-organize, and respond to each other (see origin: `docs/brainstorms/2026-03-25-multi-agent-swarm-eval-requirements.md`).

## Problem Statement / Motivation

Two agents can demonstrate basic coexistence and simple collaboration, but they cannot reveal whether agents self-organize work division, avoid duplication, or form dependency chains deeper than a single handoff. The 10-agent swarm trial answers the question the 2-agent case cannot: does the intent-space coordination model produce meaningful emergent behavior at realistic scale?

Secondary motivation is simulating what a real multi-team or hackathon scenario looks like — many agents arriving, observing, and self-selecting work in a shared space. Space stress tolerance and pack robustness are useful diagnostics captured as side effects.

## Proposed Solution

Modify `evals/src/harness.ts` and `evals/scripts/headwaters-agent-pack-eval.ts` to:

1. Support instance-indexed agent directories so duplicate agent types don't collide
2. Add configurable staggered launches via `--stagger-ms`
3. Adapt scoring thresholds for N agents with per-agent breakdowns
4. Produce a consolidated timeline as the primary review artifact
5. Improve process isolation and I/O handling for 10 concurrent agents

All changes are backward-compatible. Existing `--agents claude,codex` invocations work identically.

## Technical Considerations

### Architecture Impacts

The changes are confined to the evals harness. No changes to the Headwaters server, intent-space protocol, agent-pack, or any other subproject.

The core architectural change is decoupling **agent type** (which recipe to use) from **agent instance** (which directory, session, and identity to assign). Currently these are conflated: the `AgentTarget` type serves as both the recipe selector and the directory name.

### Performance Implications

From institutional learnings:

- **SQLite single-writer**: The commons DB uses WAL mode with 5s `busy_timeout`. At agent speeds (seconds between posts), 10 concurrent writers serialize acceptably. During simultaneous signup/auth bursts, the stagger flag provides relief. (see: `docs/solutions/architecture-decisions/echo-broadcast-safety-validation-IntentSpace-20260309.md`)
- **Echo broadcast is O(N)**: With 10 agents holding ~10-30 connections total, this is within the documented safe range (<50 connections). (same source)
- **`appendFileSync` blocks the event loop**: The current `pipeToFile` uses synchronous writes. At 10 agents with active stdout, this creates backpressure. Switch to `createWriteStream`.
- **`execFileSync` buffer limit**: `readSpaceDb` uses `execFileSync` which defaults to 200KB `maxBuffer`. With 10 agents producing ~5-10x more DB rows, this can overflow. Increase to 10MB.

### Security Considerations

No new security surface. Agents already run with `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox` in the eval context. Each agent instance gets its own session-id (Claude) or workspace isolation (Codex).

### Key Architectural Decisions

**Stagger vs timeout semantics (addresses SpecFlow Q1):** Wall timeout starts from trial start. Idle timeout resets each time a new stagger-launched agent begins producing output. This means idle timeout cannot fire during the stagger window itself — only after all agents have launched and had a chance to produce output.

**Instance indexing (addresses SpecFlow Q2):** Per-type indexing. When a type appears more than once in the agent list, instances are numbered: `claude-01`, `claude-02`. When a type appears exactly once, the bare name is used: `codex`. This preserves backward compatibility for existing 2-agent runs.

**Scoring thresholds (addresses SpecFlow Q4):** Orientation stays `every` (all must pass) — if an agent can't orient, it's a meaningful failure. Coexistence uses `ceil(N/2)` — a majority must demonstrate presence. Collaboration uses `max(2, ceil(N/3))` — a low bar, since automated scoring is not the primary signal; the tester reads the logs.

**Timeline format (addresses SpecFlow Q5):** Markdown table with columns: timestamp, agent-label, event-type, summary. Written to `timeline.md` in the trial directory alongside `summary.json`. Agent labels use the instance-indexed names so the tester can cross-reference with directory names.

## System-Wide Impact

- **Interaction graph**: The harness spawns agent CLI processes and a Headwaters server process. No callbacks, middleware, or observers. Changes are self-contained.
- **Error propagation**: Agent process failures are already isolated via separate `spawn()` calls. The plan adds per-agent error boundaries in `launchAgents` so one bad recipe doesn't take down the whole trial.
- **State lifecycle risks**: Directory collision is the current data-corruption risk. Instance indexing eliminates it.
- **API surface parity**: No API changes. The harness exports `runHeadwatersAgentPackEval()` with an expanded `EvalOptions` type (new optional `staggerMs` field).
- **Integration test scenarios**: (1) `--agents claude,claude,codex,codex` produces 4 distinct directories with no collision. (2) `--stagger-ms 5000` with 4 agents produces launch gaps visible in the timeline. (3) Existing `--agents claude,codex` produces the same directory structure as before.

## Acceptance Criteria

### Phase 1: Instance Isolation (fix the collision bug)

- [ ] `launchAgents` assigns per-instance directories: `agents/claude-01/`, `agents/claude-02/`, `agents/codex/` (bare name when only one of that type)
- [ ] Each instance gets its own `workspace/`, `stdout.log`, `stderr.log`
- [ ] `discoverHandle` reads from the correct per-instance workspace
- [ ] `AgentRunSummary` includes an `instanceLabel` field (e.g., `"claude-01"`)
- [ ] `RunningAgent` carries both the `AgentTarget` (for recipe) and `instanceLabel` (for identity)
- [ ] `getRecipe` remains unchanged — it selects by type, not by instance
- [ ] `scripted-headwaters` agent-id uses instance label + UUID instead of `Date.now()` to avoid collision
- [ ] `--agents claude,codex` (no duplicates) produces the same directory structure as today: `agents/claude/`, `agents/codex/`
- [ ] Existing `report.json` schema remains backward-compatible (new fields are additive)

**Files:** `evals/src/harness.ts` (types, `launchAgents`, `discoverHandle`, `getRecipe` for scripted agent-id)

### Phase 2: Staggered Launch

- [ ] `EvalOptions` gains optional `staggerMs: number` (default 0)
- [ ] CLI parser gains `--stagger-ms` flag
- [ ] `launchAgents` becomes async, inserting `staggerMs` delay between each agent spawn
- [ ] Wall timeout starts from trial start (unchanged)
- [ ] Idle timeout in `awaitAgentsCompletion` resets when a new stagger-launched agent produces its first output byte
- [ ] The observation timer (`observationMs`) is measured from the first agent launch, not the last — this preserves the current "quiet period then intent appears" semantics

**Files:** `evals/src/harness.ts` (`launchAgents`, `awaitAgentsCompletion`, `EvalOptions`), `evals/scripts/headwaters-agent-pack-eval.ts` (CLI parser)

### Phase 3: Scoring & Per-Agent Verdicts

- [ ] `scoreOrientation` unchanged: all agents must pass (already N-aware via `every`)
- [ ] `scoreCoexistence` threshold becomes `ceil(N/2)` where N is the number of agents with handles
- [ ] `scoreCollaboration` threshold becomes `max(2, ceil(N/3))`
- [ ] `AgentRunSummary` gains per-stage fields: `orientationPassed: boolean`, `coexistencePassed: boolean`, `collaborationPassed: boolean`
- [ ] `TrialSummary` gains aggregate counts: `orientationPassCount`, `coexistencePassCount`, `collaborationPassCount`
- [ ] `renderMarkdownReport` shows per-agent breakdowns and aggregate counts

**Files:** `evals/src/harness.ts` (scoring functions, types, report renderer)

### Phase 4: Consolidated Timeline & Report Enhancement

- [ ] After evidence collection, produce `timeline.md` in the trial directory
- [ ] Timeline merges `monitoring_events` and `messages` from the intent-space DB, sorted chronologically
- [ ] Each timeline row includes: timestamp (ISO), agent instance label, event type, one-line summary
- [ ] Agent handles are mapped to instance labels using a `handle-map.json` artifact produced after all agents have enrolled
- [ ] `handle-map.json` maps `{ "claude-01": "<handle>", "claude-02": "<handle>", ... }`
- [ ] The markdown report references the timeline file path and includes a trial-level summary section with aggregate statistics: `7/10 oriented, 5/10 coexisted, 3/10 collaborated`
- [ ] `pipeToFile` switches from `appendFileSync` to `createWriteStream`
- [ ] `readSpaceDb` `execFileSync` call gets `maxBuffer: 10 * 1024 * 1024`

**Files:** `evals/src/harness.ts` (new timeline generation function, `pipeToFile`, `readSpaceDb`, report renderer), `evals/scripts/read_space_db.py` (verify output size at 10 agents)

### Phase 5: Robustness

- [ ] `launchAgents` wraps each agent spawn in try/catch so one bad recipe doesn't crash the trial
- [ ] Agents that fail to spawn get `unavailableReason` set (already exists in the type)
- [ ] `--agents` CLI flag validates each agent name against the supported set and fails fast with a clear error
- [ ] Warn (don't hard-fail) if agent count exceeds 10

**Files:** `evals/src/harness.ts` (`launchAgents`), `evals/scripts/headwaters-agent-pack-eval.ts` (validation)

## Success Metrics

- A 10-agent trial with `--agents claude,claude,claude,claude,claude,codex,codex,codex,codex,codex` completes without directory collision, log corruption, or silent data loss
- The consolidated timeline is the first artifact the tester opens and provides a scannable overview of all 10 agents' activity
- The tester can drill from the timeline into any individual agent's full stdout log via the instance label
- Staggered launches produce visible late-arrival dynamics in the timeline
- Existing 2-agent invocations are unaffected

## Dependencies & Prerequisites

- No external dependencies. All changes are within the `evals/` subproject.
- The Headwaters server and intent-space protocol are unchanged.
- The agent-pack is unchanged.
- Assumes the test machine can run 10 concurrent CLI processes (Claude/Codex). The `--stagger-ms` flag provides a pressure-relief valve.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-25-multi-agent-swarm-eval-requirements.md](docs/brainstorms/2026-03-25-multi-agent-swarm-eval-requirements.md) — key decisions carried forward: configurable agent mix (not fixed), simple automated scoring + human review via logs, instance-indexed directories, configurable stagger, consolidated timeline as primary output

### Internal References

- Harness entry point: `evals/src/harness.ts:105` (`runHeadwatersAgentPackEval`)
- Agent launch: `evals/src/harness.ts:268` (`launchAgents`)
- Recipe selection: `evals/src/harness.ts:333` (`getRecipe`)
- Scoring functions: `evals/src/harness.ts:612-644`
- Report renderer: `evals/src/harness.ts:647` (`renderMarkdownReport`)
- CLI script: `evals/scripts/headwaters-agent-pack-eval.ts`
- DB evidence reader: `evals/scripts/read_space_db.py`
- Broadcast scaling: `docs/solutions/architecture-decisions/echo-broadcast-safety-validation-IntentSpace-20260309.md`
- Process management: `docs/solutions/integration-issues/persistent-session-needed-for-managed-local-stacks-20260313.md`
- Runtime pinning: `docs/solutions/integration-issues/codex-dojo-harness-needed-explicit-reasoning-level-20260314.md`
- Original eval requirements: `docs/brainstorms/2026-03-23-agent-pack-evaluation-requirements.md`
