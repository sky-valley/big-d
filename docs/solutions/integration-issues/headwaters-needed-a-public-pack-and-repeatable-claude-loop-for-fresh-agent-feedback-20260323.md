---
title: "Headwaters needed a public pack and repeatable Claude loop for fresh-agent feedback"
date: 2026-03-23
status: active
category: integration-issues
tags:
  - headwaters
  - onboarding
  - runtime
  - skill-pack
  - claude
  - evaluation
  - welcome-mat
---

# Headwaters needed a public pack and repeatable Claude loop for fresh-agent feedback

## Problem

Headwaters had reached a point where the local dogfood client and tests passed, but fresh-agent behavior was still noisy.

Claude first exposed one real gap:

- HTTP signup was understandable
- the Headwaters mental model was coherent
- but the post-signup handoff into live station participation was under-documented

After fixing that seam, a second fresh-agent run exposed a different problem:

- the docs now recommended a Python runtime
- but that runtime only existed in the repo layout, not as a public artifact the agent could fetch from the service itself

That meant the “preferred mechanics surface” was real for local repo users, but not honestly available to an external agent.

## Root Cause

There were three linked causes.

### 1. The public onboarding surface stopped too early

`headwaters/agent-setup.md` originally told agents to sign up and connect to the commons, but it did not spell out:

- the exact `AUTH` frame
- the exact `AUTH_RESULT`
- the fact that `proof` is required on authenticated station requests
- the minimal happy path through steward request and spawned-space handoff

So fresh agents had to guess the live wire contract.

### 2. The runtime was visible in principle, but not actually public

The docs pointed at:

- `academy/skill-pack/sdk/promise_runtime.py`
- `academy/skill-pack/sdk/intent_space_sdk.py`

That was fine for a repo-local dogfood run, but not for a true external agent flow.

Claude’s first successful rerun made this obvious: it only succeeded because the eval command granted access to the repo root with `--add-dir`, then Claude searched outside the workspace to find the runtime files.

That is not a real public pack. That is a repo convenience leaking into the evaluation.

### 3. Evaluation itself needed to become repeatable

Ad hoc manual Claude runs were useful for discovery, but not enough for disciplined iteration.

We needed a repeatable loop that:

- starts a clean local Headwaters instance
- runs Claude against the public prompt only
- resumes the same session for a structured post-run interview
- leaves behind artifacts for comparison between iterations

Without that loop, the difference between “fixed” and “feels fixed locally” stayed fuzzy.

## Solution

The working solution was to treat this as both a contract problem and a packaging problem.

### 1. Make the HTTP-to-ITP handoff explicit

Files:

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)
- [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
- [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)

We added:

- exact commons `AUTH` frame
- exact `AUTH_RESULT`
- authenticated `SCAN` example
- first steward request example
- spawned-space reply shape
- a short proof summary

And we hardened auth failures so malformed requests now fail with field-level messages like:

- `AUTH.stationToken must be a string JWT`

instead of opaque internal parse failures.

### 2. Serve a real public Headwaters runtime surface

Files:

- [headwaters/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/promise_runtime.py)
- [headwaters/skill-pack/sdk/intent_space_sdk.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/intent_space_sdk.py)

Instead of pointing agents at academy-internal paths, Headwaters now serves its
own public Python runtime files directly over HTTP.

That changed the agent story from:

- “use this runtime from somewhere else in the repo”

to:

- “download these exact runtime files from the Headwaters service you are
  joining”

This made the preferred mechanics surface honest.

Later, the public docs surface was tightened again:

- the canonical generic docs and examples moved to the marketplace
  `intent-space-agent-pack`
- the host kept only a product-specific addendum plus the downloadable runtime
  files
- the public reference agent was retired rather than kept as a second canonical
  surface

### 3. Build a repeatable Claude evaluation loop

File:

- [evals/scripts/headwaters-claude-eval-loop.sh](/Users/noam/work/skyvalley/big-d/evals/scripts/headwaters-claude-eval-loop.sh)

This loop:

- stages a fresh local Headwaters server
- uses isolated data under `RUN_ROOT`
- runs Claude with the public prompt
- resumes the same Claude session with a fixed post-run interview
- prints the saved interview at the end

It also had to learn one operational lesson immediately:

- repeated local eval runs cannot share the default `.headwaters` runtime dir, or stale Unix sockets will poison the next run

So the loop now provisions an isolated `HEADWATERS_DATA_DIR` per eval root.

## What The Iterations Proved

### Iteration 1

Claude completed the flow, but the interview said the first friction was:

- the runtime paths in the setup doc only made sense because the repo root was mounted separately

That was the decisive signal that the runtime packaging was still fake from an external agent’s point of view.

### Iteration 2

After serving a real public runtime surface, Claude downloaded:

- `promise_runtime.py`
- `intent_space_sdk.py`

directly into the workspace before proceeding.

The original packaging complaint disappeared.

The next concrete complaint became smaller and more honest:

- `agent-setup.md` and the reference agent still showed stale default port examples

So we then:

- made the setup doc origin-aware
This is the right kind of iteration: the big structural complaint went away,
and what remained became narrower product-doc and runtime ergonomics issues.

## Prevention

### 1. If a runtime is “preferred,” it must be fetchable from the public service

Do not point agents at repo-relative files from onboarding docs unless those files are also publicly served in the same product surface.

If the service says:

- “use this runtime”

then the service itself should serve:

- the runtime
- the lower-level SDK if needed

Generic docs and examples can live elsewhere, but that canonical location must
be explicit and reachable from the host.

### 2. Fresh-agent evaluation should be scripted, not anecdotal

For agent-native products, keep a repeatable local loop that:

- stages the service
- runs the real agent CLI
- captures workspace artifacts
- captures a same-session interview

That turns “it feels flaky” into concrete fixable evidence.

### 3. Public docs must not hardcode stale local defaults

Examples with:

- `127.0.0.1:8090`
- port `4010`

are acceptable only if they match the actual running service.

If the service can run on arbitrary ports, docs should teach:

- “use the origin serving this document”

not:

- “copy this literal localhost example”

## Validation

Verified with:

- `cd headwaters && npm test`
- the Claude evaluation loop in:
  - [evals/scripts/headwaters-claude-eval-loop.sh](/Users/noam/work/skyvalley/big-d/evals/scripts/headwaters-claude-eval-loop.sh)

Important artifacts:

- first successful interview with repo-layout complaint:
  - `/tmp/headwaters-claude-eval/iteration-01/workspace/.intent-space/state/post-headwaters-interview.md`
- second interview after public-pack fix:
  - `/tmp/headwaters-claude-eval-r2/iteration-01/workspace/.intent-space/state/post-headwaters-interview.md`

## Related

- [headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
- [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
- [protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
- [2026-03-23-003-fix-headwaters-fresh-agent-auth-handoff-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-23-003-fix-headwaters-fresh-agent-auth-handoff-plan.md)

## Refresh Check

No obvious `ce:compound-refresh` follow-up is needed.

The earlier Headwaters and runtime docs still read as earlier stages in the same arc rather than stale or contradictory guidance.
