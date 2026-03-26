---
title: "feat: Agent-Profiled Swarm Evaluation"
type: feat
status: completed
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md
---

# feat: Agent-Profiled Swarm Evaluation

## Overview

Extend the Headwaters eval harness so swarm runs can launch agents with a
deterministic built-in profile instead of a single undifferentiated starting
frame. Each profile should shape both strengths and personality, and the trial
artifacts should record which profile each agent received (see origin:
`docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md`).

The harness should preserve today's baseline behavior for comparison. Profiled
runs are an additive evaluation mode, not a replacement for the current swarm
pipeline (see origin:
`docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md`).

## Problem Statement / Motivation

The current swarm harness gives every agent the same launch framing. That is
useful for baseline coexistence, but weak for realism: agents do not enter the
space as differentiated teammates with recognizable strengths or working styles
(see origin:
`docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md`).

This feature makes the evaluation more believable without turning the harness
into an open-ended prompt lab. The product goal is a small fixed profile set,
deterministic assignment by launch order, generalist-biased overflow, and
profile visibility in reports so a tester can interpret swarm behavior in
context (see origin:
`docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md`).

## Proposed Solution

Modify `evals/src/harness.ts` and `evals/scripts/headwaters-agent-pack-eval.ts`
to add a profile layer on top of the existing agent recipe system:

1. Introduce a built-in `AgentProfile` roster and deterministic assignment
   function
2. Generate each launched agent's final prompt from:
   - an optional built-in profile frame
   - the existing shared eval prompt
3. Record profile assignment in per-agent summaries, `summary.json`,
   `handle-map.json` replacement metadata, `timeline.md`, and `report.md`
4. Add an additive CLI switch so operators can run either baseline or profiled
   trials without changing the default invocation shape
5. Update the runbook to document the profiled mode and the built-in roster

### Recommended Built-In Roster

Use a small five-profile set:

- `frontend-builder`
- `backend-builder`
- `creative-product`
- `systems-investigator`
- `generalist-builder`

Rationale:

- covers the concrete directions the brainstorm named: engineering, creative
  work, frontend, backend, and broader execution
- stays small enough that report interpretation remains easy
- gives overflow a natural landing profile (`generalist-builder`) rather than
  forcing repeated narrow specialists

### Recommended Overflow Rule

Assign profiles in this deterministic sequence:

1. `frontend-builder`
2. `backend-builder`
3. `creative-product`
4. `systems-investigator`
5. `generalist-builder`
6. all remaining overflow agents receive `generalist-builder`

This satisfies the brainstorm decision that exact late-order repetition does not
matter once the skill mix is equivalent, while clearly biasing extras toward
generalist participation (see origin:
`docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md`).

### Recommended Operator Interface

Add a new optional CLI flag:

- `--profile-mode none|builtin`

Behavior:

- default `none` preserves the current baseline harness behavior
- `builtin` enables deterministic built-in profile assignment

This keeps comparison runs explicit and preserves backward compatibility for
existing scripts and docs (addresses origin R9).

## Technical Considerations

### Prompt Construction

The current harness builds one shared prompt in `buildPrompt()` and passes that
directly into each recipe. Replace that with a two-stage prompt builder:

- `buildBasePrompt(...)` returns the current shared eval framing
- `buildProfileFrame(profile)` returns the built-in role/personality text
- `buildAgentPrompt(basePrompt, profile?)` composes the final per-agent prompt

Prompt order should be:

1. built-in profile frame
2. shared eval prompt

This makes the role/personality framing shape how the agent interprets the
shared Headwaters instructions, rather than feeling like a trailing add-on.

Keep the per-agent variation at the harness layer, not inside individual
recipes. This preserves recipe parity across Claude, Codex, Pi, and
`scripted-headwaters`.

Important learning to carry forward:

- preserve Claude stdin prompt delivery exactly as today; do not regress into
  positional prompt handling (`docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md`)
- keep Codex reasoning explicitly pinned; the profile feature must not alter
  runtime knobs that were already proven necessary
  (`docs/solutions/integration-issues/codex-dojo-harness-needed-explicit-reasoning-level-20260314.md`)

### Types and Trial Metadata

Add a first-class profile field in the harness types:

- `AgentProfileName`
- `AssignedAgentProfile`
- `profileMode` on `EvalOptions`
- `profile` on `RunningAgent`
- `profile` on `AgentRunSummary`

Update trial artifacts:

- `summary.json` should include each agent's assigned profile
- `report.md` per-agent table should add a `Profile` column
- `timeline.md` should add the profile beside the agent label, or encode it in
  the agent column as `claude-01 (frontend-builder)`
- replace `handle-map.json` with a richer `agent-map.json`, or extend the
  existing file to map instance label to both handle and profile

Recommendation: extend into `agent-map.json`:

```json
{
  "claude-01": { "handle": "<sender-id>", "profile": "frontend-builder" },
  "codex-02": { "handle": "<sender-id>", "profile": "generalist-builder" }
}
```

This keeps metadata aligned in one place and scales better than maintaining
 separate one-field files.

### CLI and Backward Compatibility

Update `evals/scripts/headwaters-agent-pack-eval.ts` to:

- parse `--profile-mode`
- validate it against `none|builtin`
- pass it through to `runHeadwatersAgentPackEval()`

Default should remain `none`. Existing commands like:

```bash
npm run headwaters:agent-pack -- --agents codex,claude --trials 1
```

must continue to work unchanged.

### Report and Timeline Rendering

The current report and timeline are the human review surface. Profile assignment
should be visible there, not buried in JSON (see origin R8).

Recommendation:

- `report.md` table: `Agent | Profile | Status | Handle | Orientation | Coexistence | Collaboration`
- `timeline.md`: render the profile inline with the agent label for every row
- launch logs: include profile at spawn time, e.g.
  `Launched claude-01 (claude, frontend-builder)`

This keeps the profile visible from launch through evaluation.

### Runbook Updates

Update `docs/runbooks/headwaters-agent-pack-evaluation-harness.md` to add:

- what profile mode is for
- the built-in profile roster
- example command lines for baseline vs profiled runs
- where profile assignments appear in trial outputs

### SpecFlow Notes

The main user flow is simple, but there are a few specification-sensitive
branches worth locking down in implementation:

- baseline run: no profiles attached, current behavior preserved
- builtin profile run: every launched agent receives a deterministic profile
- duplicate agent types: profile assignment must still follow launch order, not
  agent type
- overflow run: agents beyond the first five must skew to
  `generalist-builder`
- report inspection: a tester must be able to tell which profile an agent had
  without opening raw workspace files

Non-goals to preserve:

- no free-form per-agent prompt authoring
- no model-specific profile roster
- no scoring-policy change in this feature unless needed only to display profile
  metadata

## System-Wide Impact

- Scope stays inside the `evals/` workspace plus its runbook
- No changes to Headwaters, intent-space protocol, or agent-pack contract
- No new participant is introduced; the harness still acts as launcher,
  injector, and observer rather than a social actor on the wire
- Trial evidence remains read from the commons DB and process logs

## Acceptance Criteria

### Phase 1: Add Profile Model

- [ ] Introduce a small built-in `AgentProfileName` set in `evals/src/harness.ts`
- [ ] Each built-in profile includes both capability framing and personality
      framing
- [ ] Add a deterministic assignment function based on launch order
- [ ] Overflow beyond the first five assigned slots resolves to
      `generalist-builder`

**Files:** `evals/src/harness.ts`

### Phase 2: Compose Per-Agent Prompts Safely

- [ ] Split prompt construction into base prompt plus optional profile frame
- [ ] Each running agent receives the correctly composed prompt for its assigned
      profile when `profileMode === "builtin"`
- [ ] In profiled runs, the built-in profile frame appears before the shared
      eval prompt in the final composed prompt
- [ ] Baseline runs with `profileMode === "none"` receive the current shared
      prompt behavior unchanged
- [ ] Claude prompt delivery remains stdin-based
- [ ] Codex recipe retains explicit `model_reasoning_effort="medium"`

**Files:** `evals/src/harness.ts`

### Phase 3: Expose Operator Control

- [ ] Add `--profile-mode none|builtin` to the CLI parser
- [ ] Invalid profile modes fail fast with a clear error
- [ ] The default profile mode is `none`
- [ ] Existing invocations without `--profile-mode` remain backward-compatible

**Files:** `evals/scripts/headwaters-agent-pack-eval.ts`

### Phase 4: Persist Profile Metadata in Trial Outputs

- [ ] `RunningAgent` and `AgentRunSummary` include the assigned profile
- [ ] Trial summary JSON includes per-agent profile data
- [ ] Add `agent-map.json` or equivalent metadata artifact mapping instance
      labels to both handle and profile
- [ ] Spawn logs include profile assignment

**Files:** `evals/src/harness.ts`

### Phase 5: Surface Profiles in Human Review Artifacts

- [ ] `report.md` adds a profile column to the per-agent table
- [ ] `timeline.md` makes each event traceable to an agent and that agent's
      profile
- [ ] Trial-level artifact paths remain easy to scan

**Files:** `evals/src/harness.ts`

### Phase 6: Document the Mode

- [ ] Runbook documents baseline vs profiled runs
- [ ] Runbook lists the built-in profile roster and overflow behavior
- [ ] Runbook shows at least one profiled command example

**Files:** `docs/runbooks/headwaters-agent-pack-evaluation-harness.md`

## Success Metrics

- A tester can run one baseline trial and one `--profile-mode builtin` trial
  against the same agent mix and compare them directly
- Trial artifacts clearly show which profile each agent had
- Duplicate agent types still receive deterministic profile assignment by launch
  order
- Overflow agents consistently appear as `generalist-builder`
- No regression appears in agent launch behavior, prompt delivery, or existing
  baseline run compatibility

## Risks and Mitigations

- **Risk: prompt composition regresses one agent launcher**
  Mitigation: preserve recipe-specific delivery semantics and add targeted smoke
  checks for Claude stdin and Codex launch args.
- **Risk: profiles leak into implementation knobs rather than participant
  framing**
  Mitigation: keep profiles as prompt-layer metadata only; do not couple them to
  reasoning level, sandbox flags, or transport details.
- **Risk: artifact sprawl makes evaluation harder to read**
  Mitigation: centralize handle/profile metadata in one map file and keep
  `report.md` as the first review surface.
- **Risk: staged-port assumptions regress for scripted agents**
  Mitigation: keep profile support independent of host/port wiring and rerun on
  non-default staged ports if possible
  (`docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md`).

## Verification Plan

- Run baseline mode:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude --trials 1 --observation-ms 8000
```

- Run profiled mode:

```bash
cd evals
npm run headwaters:agent-pack -- --agents codex,claude,claude,pi --trials 1 --observation-ms 8000 --profile-mode builtin
```

- Inspect outputs:
  - `report.md` shows profile column
  - `summary.json` includes per-agent profile data
  - `timeline.md` shows agent + profile association
  - `agent-map.json` maps instance labels to handle and profile
- Confirm baseline run output shape stays valid when `--profile-mode` is omitted

## Dependencies & Prerequisites

- Existing `evals/` harness remains the implementation surface
- Current swarm changes in `evals/src/harness.ts` should be preserved and
  extended rather than rewritten
- Local launch recipes for Claude, Codex, Pi, and scripted Headwaters remain the
  source of truth for process invocation

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md)
- Existing swarm plan: [2026-03-25-001-feat-multi-agent-swarm-eval-plan.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/plans/2026-03-25-001-feat-multi-agent-swarm-eval-plan.md)
- Harness entry point: [harness.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/evals/src/harness.ts)
- CLI entry point: [headwaters-agent-pack-eval.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/evals/scripts/headwaters-agent-pack-eval.ts)
- Runbook: [headwaters-agent-pack-evaluation-harness.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/runbooks/headwaters-agent-pack-evaluation-harness.md)
- Prompt delivery learning: [claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md)
- Runtime knob learning: [codex-dojo-harness-needed-explicit-reasoning-level-20260314.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/integration-issues/codex-dojo-harness-needed-explicit-reasoning-level-20260314.md)
- Repeatable eval packaging learning: [headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md)
- Staged-port drift learning: [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
