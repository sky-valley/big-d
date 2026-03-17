---
title: "Claude Dojo Failure Exposed Harness And Pack Bugs"
date: 2026-03-14
category: integration-issues
component: intent-space
tags: [claude, dojo, harness, academy, contracts, onboarding]
severity: medium
root_cause: "The initial Claude harness recipe delivered the prompt incorrectly, and the published academy challenge-response example contradicted the live tutor contract."
---

# Claude Dojo Failure Exposed Harness And Pack Bugs

## Problem

The first live Claude CLI dojo run failed immediately at `pre-dojo`, even though Codex and the scripted reference agent could complete the ritual.

At first glance this looked like a Claude limitation, but the investigation showed two real system problems:

- the harness recipe for Claude was wrong
- the academy challenge-response contract example was wrong

Only after fixing those could we see the true residual behavior gap.

## Root Cause

There were two concrete bugs:

1. **Harness bug**
   The Claude recipe passed the top-level instruction as a positional prompt while also using `--add-dir`, which caused Claude `--print` mode to exit with:
   `Input must be provided either through stdin or as a prompt argument when using --print`

2. **Pack / contract bug**
   The published `registration-challenge.example.json` showed the signed challenge response using the challenge intent id as `parentId`.
   The live tutor in `academy/src/tutor.ts` actually expects the signed response in the original registration intent subspace.

That meant a careful agent following the published contract could still fail the live dojo.

## Solution

### 1. Fix the Claude harness recipe

In [academy/src/harness.ts](/Users/noam/work/skyvalley/big-d/academy/src/harness.ts):

- added recipe-level input mode support
- changed the Claude recipe to deliver the top-level instruction over stdin
- kept the rest of the native Claude invocation intact

### 2. Fix the academy contract

In [academy/contracts/registration-challenge.example.json](/Users/noam/work/skyvalley/big-d/academy/contracts/registration-challenge.example.json):

- changed the signed response example to use the original registration intent id as `parentId`
- added an explicit note explaining the rule

In [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md) and [academy/skill-pack/SKILL.md](/Users/noam/work/skyvalley/big-d/academy/skill-pack/SKILL.md):

- clarified that local harness runs must obey the provided endpoint scheme literally
- clarified the challenge-response parentId rule
- clarified the ritual subspace rule
- clarified that writing helper code is not completion; the agent must actually execute it and reach `ASSESS`

### 3. Re-test to isolate the remaining issue

After these fixes:

- Claude no longer failed immediately on CLI input handling
- Claude progressed far enough to generate identity material and, in one run, post real registration and challenge-response messages
- later runs still timed out because Claude sometimes wrote helper code without executing it

So the remaining problem is no longer a broken harness contract. It is residual agent behavior under the current prompt/pack setup.

## Prevention Tip

When evaluating agents against a live protocol, treat the first failure as a contract audit, not just an agent score.

If an outside agent fails:

- verify the launcher actually delivered the prompt
- compare the published contract examples to the live participant behavior
- only after those align should you attribute the remaining gap to the agent

## Related Documentation

- [docs/runbooks/dojo-agent-evaluation-harness.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
- [docs/plans/2026-03-14-001-feat-dojo-agent-evaluation-harness-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-14-001-feat-dojo-agent-evaluation-harness-plan.md)
- [academy/agent-setup.md](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
- [academy/contracts/registration-challenge.example.json](/Users/noam/work/skyvalley/big-d/academy/contracts/registration-challenge.example.json)
