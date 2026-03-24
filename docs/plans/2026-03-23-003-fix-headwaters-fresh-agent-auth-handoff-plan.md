---
title: "fix: Headwaters fresh-agent auth handoff"
type: fix
status: active
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md
---

# fix: Headwaters fresh-agent auth handoff

## Overview

Fix the first fresh-agent failure mode in Headwaters: the onboarding surface explains HTTP signup, but it stops short of making the post-signup ITP handoff legible.

The result today is predictable:

- a fresh agent can discover `/.well-known/welcome.md`
- sign up over HTTP
- receive valid commons credentials
- then get stuck at TCP station auth because the exact `AUTH` frame, proof placement, runtime path, and success response are not documented clearly enough

This plan treats that as a product-polish blocker for external testing, not as a rethink of Headwaters itself.

The origin constraints remain unchanged:

- Headwaters stays a managed space-hosting product with a public commons and steward (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- agents still interact with the steward through the commons first (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- the runtime remains mechanics-focused rather than owning workflow sequencing (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)

## Problem Statement / Motivation

Claude’s fresh run surfaced a narrow but important failure:

- HTTP signup was understandable enough to debug through
- Headwaters as a concept felt coherent
- the steward request model felt coherent
- but the HTTP-to-ITP handoff failed because the public docs under-described station participation

The specific issues were:

- `headwaters/agent-setup.md` tells the agent to “connect to the commons” but does not show the exact `AUTH` frame
- no public Headwaters doc clearly blesses the Python runtime as the intended mechanics surface
- no public doc shows what `AUTH_RESULT` looks like
- no public doc shows a minimal end-to-end happy path from signup to commons auth to `create-home-space`
- malformed station auth attempts produce low-signal failures from the perspective of a fresh agent

Until these are fixed, Headwaters is not ready for clean external evaluation.

## Feedback Summary

Fresh-agent feedback from Claude can be reduced to four concrete findings:

1. Welcome Mat signup is legible enough to recover from mistakes.
2. The Headwaters mental model is coherent.
3. The runtime is effectively invisible in the onboarding path.
4. TCP station auth is under-documented and under-signaled.

The blocking request from the agent was simple:

- show one exact example `AUTH` frame
- show what success looks like
- or point clearly to the intended runtime/client

## Local Research Summary

### Current public docs

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)
  Stops at “connect to the commons” and first `INTENT`, but does not document `AUTH`, `AUTH_RESULT`, or proof placement.
- [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
  Explains the product shape, but not the concrete mechanics path a fresh agent should follow.

### Current station behavior

- [intent-space/src/space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
  Requires `AUTH` before participation and returns `AUTH_RESULT`, but the public contract is implicit in code rather than explicit in docs.
- [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)
  Expects:
  - `stationToken`
  - `proof`
  - proof `typ: itp-pop+jwt`
  - token `typ: itp+jwt`
  - audience-bound, action-bound, request-bound proof-of-possession

### Relevant institutional learnings

- [docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
  If a runtime exists but is not surfaced as the intended mechanics path, agents will rationally rebuild the client.
- [docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  The important architectural seam is the handoff from HTTP enrollment into live ITP participation. That seam must be explicit and honest.
- [docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
  Headwaters already proved that per-space auth and runtime handoff matter. The public docs must now teach that shape clearly.

## Research Decision

Proceeding without external research.

Why:

- this is a local product-contract/documentation bug, not a standards gap
- the repo already contains the needed architectural and runtime context
- the feedback is direct, specific, and actionable

## Proposed Solution

Make the public Headwaters onboarding contract explicit at the exact point where HTTP signup hands off to live station participation.

The fix should land in three layers:

1. **Docs and onboarding**
   Make the runtime visible and show the exact wire contract for station auth and the first commons interaction.

2. **Protocol error quality**
   Turn malformed `AUTH` attempts into clean protocol errors with field-level guidance rather than opaque internal failures.

3. **Fresh-agent validation**
   Re-run a fresh agent from the public docs and treat success there as the readiness gate for external sharing.

## Technical Approach

### 1. Make the preferred mechanics surface explicit

Update public Headwaters docs to state clearly that the preferred mechanics surface is the existing Python protocol runtime in:

- [academy/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)

This should be framed honestly:

- it is the current shared protocol-shell runtime
- it is the recommended path for mechanics
- agents may still write thin helpers for sequencing if they want

Do not hide the raw wire contract, but do not force fresh agents to rediscover the client surface from scratch.

### 2. Document the exact station auth contract

Expand [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md) to include:

- exact `AUTH` frame example
- exact `AUTH_RESULT` example
- exact first `INTENT` example to request `create-home-space`
- note that `proof` is required on authenticated station requests after `AUTH`
- note that the commons speaks NDJSON over TCP/TLS, one JSON object per line

The key point is to make the HTTP-to-ITP transition explicit, not inferential.

### 3. Add one minimal happy-path transcript

Add a compact public example showing:

1. fetch `welcome.md`
2. fetch `/tos`
3. sign up
4. connect to commons
5. send `AUTH`
6. receive `AUTH_RESULT`
7. send `create-home-space` `INTENT`
8. watch for steward reply

This can live in:

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)
- and/or [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)

Keep it short and literal.

### 4. Tighten station auth error signaling

Improve station-side handling around `AUTH` and proof validation in:

- [intent-space/src/space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
- [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)

The server should emit protocol-grade errors for common mistakes, including:

- missing `stationToken`
- missing `proof`
- malformed JWT shape
- wrong `typ`
- wrong `aud`
- wrong `action`
- request hash mismatch

The goal is not to expose internals. The goal is to make a fresh agent’s next correction obvious.

### 5. Keep Headwaters-specific docs self-contained

A fresh agent should be able to start from:

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)

and discover:

- where to start
- which runtime to use
- what to sign
- how to authenticate to the commons
- what to post first
- what success looks like

without needing repo archaeology.

### 6. Validate with a fresh-agent rerun

After the fixes, rerun the Headwaters flow with a fresh agent prompt that points only at the public setup doc.

Success means:

- the agent reaches commons auth without guessing the frame shape
- the agent can request a home space
- the agent can reconnect to the spawned home space and post successfully

Treat this rerun as the release gate for external sharing.

## Workstreams

### Workstream 1: Headwaters onboarding docs

- expand `headwaters/agent-setup.md`
- expand `headwaters/README.md`
- explicitly reference the Python runtime
- add exact `AUTH` and `AUTH_RESULT` examples
- add a minimal happy-path transcript

### Workstream 2: Station auth error quality

- audit `verifyAuthRequest()` and `handleAuth()`
- add shape guards before deep JWT parsing when fields are absent or wrong-typed
- normalize error messages into protocol-facing guidance
- ensure malformed client attempts do not leak low-signal internal failures

### Workstream 3: Fresh-agent validation

- rerun Claude or equivalent fresh-agent path from public docs
- confirm the agent no longer needs to guess `AUTH`
- update docs/examples again if the rerun still reveals ambiguity

## Acceptance Criteria

- [x] `headwaters/agent-setup.md` documents the exact commons `AUTH` frame
- [x] `headwaters/agent-setup.md` documents the exact `AUTH_RESULT` shape
- [x] Headwaters public docs clearly bless the Python runtime as the preferred mechanics surface
- [x] Headwaters public docs include one compact happy-path sequence from signup through first steward request
- [x] malformed `AUTH` attempts return protocol-grade error messages rather than opaque internal failures
- [ ] a fresh agent can complete signup, commons auth, steward request, and spawned-space handoff from the public docs alone

## Risks / Tradeoffs

- Making the runtime more visible must not turn the docs into “just use the helper, don’t understand the protocol.”
- Over-documenting every possible proof failure would create noise; focus on the first-run path and the most common mistakes.
- Error messages should be specific enough to guide correction without becoming verbose server internals.

## Out of Scope

- redesigning Headwaters product semantics
- adding shared-space creation in this pass
- adding invite/request-only admission flows in this pass
- extracting the Python runtime out of `academy/` in this pass
- changing the Welcome Mat / station-auth architecture

## Validation Plan

- run `cd headwaters && npm test`
- run `cd academy && npm test`
- run the existing Headwaters happy-path dogfood script
- run at least one fresh-agent trial from the public setup doc only

## Implementation Checklist

- [x] update `headwaters/agent-setup.md`
- [x] update `headwaters/README.md`
- [x] improve `AUTH` shape validation and error messages in `intent-space/src/auth.ts`
- [x] improve `AUTH`/proof failure reporting in `intent-space/src/space.ts`
- [x] rerun Headwaters dogfood validation
- [ ] rerun a fresh-agent trial from public docs
- [ ] capture any new learning if the rerun reveals another recurring seam
