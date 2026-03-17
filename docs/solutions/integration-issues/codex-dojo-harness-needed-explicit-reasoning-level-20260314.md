---
title: "Codex Dojo Harness Needed Explicit Reasoning Level"
date: 2026-03-14
category: integration-issues
component: intent-space
tags: [codex, dojo, harness, reasoning, academy, onboarding]
severity: medium
root_cause: "The Codex dojo harness relied on ambient CLI reasoning defaults, but harnessed Codex runs were actually executing with reasoning effort `none`, which was unreliable for the multi-step live dojo bootstrap. Pinning the Codex recipe to `model_reasoning_effort=\"medium\"` stabilized the run."
---

# Codex Dojo Harness Needed Explicit Reasoning Level

## Problem

The dojo evaluation harness could get Claude and Pi through the tutorial reliably, but Codex was inconsistent.

In repeated harnessed runs, Codex often:

- read the skill pack and contract files correctly
- described the next implementation step correctly
- then stalled before writing or running the helper client

At first this looked like a vague “Codex is being flaky” problem, but the investigation showed a specific runtime difference in how the harnessed Codex runs were being configured.

## Root Cause

The important difference was not the protocol contract anymore. It was the effective reasoning level of the Codex run.

We verified all of the following:

1. The local model catalog for `gpt-5.4` reports `default_reasoning_level: "medium"` in `~/.codex/models_cache.json`.
2. A direct `codex exec` run launched outside the harness reported `reasoning effort: xhigh` and immediately completed a trivial file-writing task.
3. A Node-spawned `codex exec` run also reported `reasoning effort: xhigh` and immediately completed the same kind of task.
4. The dojo harness runs that were stalling reported `reasoning effort: none`.
5. An explicit `codex exec -c 'model_reasoning_effort="none"' ...` run reports `reasoning effort: none`, while an explicit `... "medium"` run reports `reasoning effort: medium`.

So `none` is not just a display alias for the model default. It is a distinct setting with different behavior.

For the dojo task, that difference mattered. Under `none`, Codex was often able to understand the task but not reliably carry it through the whole live bootstrap flow. Under `medium`, the same harnessed Codex recipe completed the dojo successfully.

## Solution

### 1. Pin the Codex harness recipe to `medium`

In `academy/src/harness.ts`, the Codex recipe now adds:

```ts
'-c',
'model_reasoning_effort="medium"',
```

That makes the harness stop relying on whatever ambient reasoning configuration Codex would otherwise pick up.

### 2. Re-run the live dojo against the fixed recipe

After pinning the reasoning level:

- the Codex harness run launched with `reasoning effort: medium`
- Codex created `dojo_client.py`
- Codex completed registration, challenge-response, tutorial greeting, decline-recovery, promise, accept, complete, and assess
- the harness recorded `status: "passed"` and `failureStage: "completed"`

The successful report is in `/tmp/dojo-harness-codex-medium/report.json`.

### 3. Document the validated reasoning behavior

The investigation also established an important operational fact for future harness work:

- `none` is a real reasoning mode
- it does **not** silently map to `medium`
- `gpt-5.4` still advertises `medium` as its model default

That means future harnesses should not assume “if reasoning isn’t pinned, the model will behave like the documented default.”

## Evidence Trail

- Harness recipe change: `intent-space/src/harness.ts:340`
- Successful Codex dojo report: `/tmp/dojo-harness-codex-medium/report.json`
- Successful Codex run transcript: `/tmp/dojo-harness-codex-medium/codex/trial-01/workspace/.intent-space/state/tutorial-transcript.ndjson`
- Direct `none` reasoning check: `/tmp/codex-root-cause/reason-none/out.txt`
- Direct `medium` reasoning check: `/tmp/codex-root-cause/reason-medium/out.txt`
- Model catalog showing default reasoning level: `~/.codex/models_cache.json`

## Prevention Tip

When evaluating agents through a harness, pin the runtime knobs that materially affect behavior.

For Codex specifically:

- do not rely on ambient reasoning defaults for multi-step protocol tests
- set `model_reasoning_effort` explicitly in the harness recipe
- treat header-reported reasoning mode as a real debugging signal, not a cosmetic label

## Related Documentation

- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
- [docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/claude-dojo-failure-exposed-harness-and-pack-bugs-20260314.md)
- [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
- [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md)
