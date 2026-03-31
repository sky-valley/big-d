---
title: "Headwaters did not need a public reference agent once the runtime pack was honest"
date: 2026-03-23
status: active
category: integration-issues
tags:
  - headwaters
  - runtime
  - skill-pack
  - claude
  - evaluation
  - onboarding
---

# Headwaters did not need a public reference agent once the runtime pack was honest

## Problem

After Headwaters gained a public Python runtime pack and a repeatable Claude evaluation loop, one open product question remained:

- does the public onboarding surface need to serve a runnable `headwaters-agent.py` reference client
- or is the public runtime itself enough if the docs are clear

This mattered because a public reference agent makes onboarding easier, but it also expands the public surface and can mask whether the runtime is actually sufficient on its own.

## Root Cause

Earlier evaluation runs were mixing together two different needs:

1. **runtime availability**
2. **workflow example convenience**

When the runtime only existed implicitly through repo access, the reference agent looked more important than it really was.

Once Headwaters served:

- `promise_runtime.py`
- `intent_space_sdk.py`

as a real public pack, the role of the reference agent could be tested honestly.

## Solution

We ran the same Claude evaluation loop twice:

1. with the public `headwaters-agent.py` reference exposed
2. with that public reference removed, leaving only the runtime pair

Result:

- Claude still completed the full flow successfully without the public reference agent
- it downloaded the runtime files into the workspace
- it authored a small `join_headwaters.py` orchestration script itself
- it still used the runtime as the mechanics surface

That showed the public reference agent was helpful but not necessary.

So the public Headwaters pack was reduced to the smaller honest surface:

- [headwaters/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/promise_runtime.py)
- [headwaters/skill-pack/sdk/intent_space_sdk.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/intent_space_sdk.py)

And the docs were updated to stop pointing agents at a served example script.

## What Changed

### 1. The public pack got smaller

Removed from the public Headwaters pack:

- `headwaters/skill-pack/references/headwaters-agent.py`

Kept:

- the public Python runtime
- the lower-level SDK

This made the public surface more honest:

- one mechanics layer
- raw wire contract in docs
- agent-owned orchestration on top

### 2. The setup doc now treats `BASE_URL` as an explicit placeholder

File:

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)

The setup doc now uses:

```bash
BASE_URL="http://YOUR_HEADWATERS_HOST:YOUR_HEADWATERS_PORT"
```

and states explicitly that:

- the bootstrap prompt should provide the real base URL
- that same origin should keep being used for pack downloads and signup

This came directly from Claude’s feedback. Even after the runtime packaging was fixed, stale localhost examples were still a real source of friction.

### 3. The runtime now remembers known stations

Files:

- [academy/skill-pack/sdk/intent_space_sdk.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/intent_space_sdk.py)
- [academy/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- [headwaters/skill-pack/sdk/intent_space_sdk.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/intent_space_sdk.py)
- [headwaters/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/headwaters/skill-pack/sdk/promise_runtime.py)

The runtime now persists:

- known station endpoints
- associated audience
- station token
- source of discovery (`signup`, `connect`, `connect_to`)
- current connection/auth state in `snapshot()`

This addressed a real usability point from the discussion:

- once the bootstrap URL or spawned space URL is given, the agent should be able to remember it later rather than only infer it from the current connection

## What The Experiment Proved

The key evidence is:

- with the public reference agent present, Claude used the runtime and often adapted the example
- without the public reference agent, Claude still used the runtime and succeeded by writing its own thin driver

That means:

- the runtime is the real product dependency
- the reference agent is optional convenience

This is a better product shape:

- smaller public pack
- clearer primary surface
- less temptation to treat the example script as the real API

## Prevention

### 1. Prefer the smallest honest public agent surface

If the runtime is sufficient, do not add a public reference agent by default just because it feels helpful.

Keep the public surface to:

- the runtime
- the lower-level SDK only if needed
- the raw protocol docs

Add a public reference client only if repeated eval runs show agents cannot get moving without it.

### 2. Bootstrap docs must be origin-aware

If the service can run on arbitrary ports or hosts, docs should use explicit placeholders and say what stays fixed:

- the bootstrap prompt gives the real base URL
- the same origin is reused for pack downloads and signup

### 3. Runtime state should remember discovered stations

For spawned-space products, “what spaces do I know about?” is part of the runtime state, not just an implementation detail.

Persist:

- initial bootstrap station
- spawned stations
- current audience/identity binding

so agents can inspect and recover state more naturally.

## Validation

Verified with:

- `cd headwaters && npm test`
- the Claude eval loop in:
  - [evals/scripts/headwaters-claude-eval-loop.sh](/Users/noam/work/skyvalley/big-d/evals/scripts/headwaters-claude-eval-loop.sh)

Key artifacts:

- run with public reference agent:
  - `/tmp/headwaters-claude-eval-r2/iteration-01/workspace/.intent-space/state/post-headwaters-interview.md`
- run without public reference agent:
  - `/tmp/headwaters-claude-eval-no-ref/iteration-01/workspace/.intent-space/state/post-headwaters-interview.md`

## Related

- [headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md)
- [headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)

## Refresh Check

No obvious `ce:compound-refresh` follow-up is needed.

The earlier Headwaters learning about needing a public pack is still correct; this new learning narrows the public pack further rather than contradicting it.
