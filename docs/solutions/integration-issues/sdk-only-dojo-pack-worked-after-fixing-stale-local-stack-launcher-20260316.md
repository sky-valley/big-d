---
title: SDK-only dojo pack worked after fixing stale local stack launcher
category: integration-issues
date: 2026-03-16
tags:
  - academy
  - dojo
  - sdk
  - harness
  - codex
  - claude
  - pi
  - local-stack
---

## Problem

We needed to verify whether agents could complete the dojo from an SDK-only academy pack, without a thick pre-solved dojo client.

Early runs looked inconclusive: agents sometimes stalled waiting for the tutor challenge, and the SDK-only pack initially looked weaker than it really was.

## Root Cause

Two issues were mixed together:

1. The academy pack still needed clearer seam guidance around async challenge waiting and the rule against reposting registration while the original challenge was still pending.
2. More importantly, the local managed stack skill was stale after the `academy/` split:
   - it still served `docs/academy/`
   - it still tried to run `npm run tutor` from `intent-space/`

That meant some “SDK-only failures” were not real protocol failures. The tutor was not actually running from the new academy package.

## Solution

### 1. Keep the pack SDK-only

Do not ship a solved dojo client.

Instead, keep only:

- the thin intent space SDK in `academy/skill-pack/sdk/intent_space_sdk.py`
- exact forms in `academy/skill-pack/references/FORMS.md`
- seam-level guidance in `academy/skill-pack/references/MICRO_EXAMPLES.md`
- the ritual contract in `academy/contracts/tutorial-ritual.json`

### 2. Strengthen the seam guidance

Make the following explicit in the pack:

- tutor messages may arrive asynchronously on the same connection
- keep one live connection open
- if the challenge has not arrived yet, keep waiting in the same registration subspace
- do not repost registration unless the tutor explicitly rejects it
- `ACCEPT` and `ASSESS` bind to `promiseId`, not `intentId`

### 3. Let the harness run long, but cut on real lack of progress

In `academy/src/harness.ts`:

- allow long runs
- use idle timeout and liveness detection instead of a blunt short wall timeout
- preserve the real failure stage when a run is cut off

### 4. Validate on a truly fresh, valid stack

Use a stack that:

- serves `academy/`
- runs the station from `intent-space/`
- runs the tutor from `academy/`
- confirms tutor connectivity before running the harness

The valid local endpoints used for the decisive run were:

- `http://localhost:18085/agent-setup.md`
- `tcp://127.0.0.1:14005`

## Verified Result

On the first truly valid fresh stack, all three real agent CLIs completed the dojo from the SDK-only pack:

- Codex: passed, single-pass, interview completed
- Claude: passed, single-pass, interview completed
- Pi: passed, single-pass, interview completed

Artifacts:

- `/tmp/dojo-harness-sdk-only-a-to-z-valid/report.json`
- `/tmp/dojo-harness-sdk-only-a-to-z-valid/report.md`

Each agent still authored and executed a thin local helper `dojo_client.py`, but the pack itself no longer contained a pre-solved dojo client.

That is the important boundary:

- wire mechanics can be abstracted
- protocol reasoning must remain with the agent

## Prevention

- Keep the local stack skill aligned with the academy split whenever project ownership moves between packages.
- Smoke-test the local stack by verifying:
  - academy path is live
  - station port is open
  - tutor log says it is connected and observing
- Treat “agent failed to get challenge” as suspect until the tutor process is verified alive.
- Prefer SDK + forms + seam examples over a solved client whenever the goal is to test protocol learning rather than pure completion.
