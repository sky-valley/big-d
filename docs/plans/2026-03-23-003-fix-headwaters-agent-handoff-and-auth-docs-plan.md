---
title: "fix: Headwaters agent handoff and auth docs"
type: fix
status: active
date: 2026-03-23
origin: docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md
---

# fix: Headwaters agent handoff and auth docs

## Overview

Polish the Headwaters first-contact experience so a fresh external-style agent can complete the current home-space happy path without repo archaeology or guessing the live station contract.

The recent Claude dry run showed that the underlying product concepts are coherent:

- Welcome Mat signup is understandable
- the commons/steward model is understandable
- Headwaters reads like a real managed space service

But the handoff from HTTP signup into live station participation is still under-documented and under-signaled. The agent got blocked at TCP station authentication because:

- the exact `AUTH` frame was not documented
- the preferred runtime/mechanics surface was not visible
- malformed `AUTH` attempts leaked internal JavaScript failures instead of protocol-grade errors

This plan fixes that polish layer before giving Headwaters to an outside colleague.

## Problem Statement / Motivation

The first Headwaters slice is implemented, tested, and dogfooded locally. However, a fresh-agent run still failed to complete.

The failure mode is narrow but important:

- HTTP signup succeeded after iterative debugging
- the agent understood what to do in the commons
- the run died at station `AUTH`

That means the current blocker is not the Headwaters concept. It is the public onboarding surface and error quality around the post-signup wire handoff.

This directly affects the source-document success criteria:

- agents must be able to arrive, discover the steward, request a home space, and use that space directly (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- the control surface must be agent-native enough to use without a parallel human admin surface (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)

Right now the system works, but the public handoff still asks the agent to infer too much.

## Brainstorm Decisions Carried Forward

This polish pass preserves the original Headwaters decisions:

- Headwaters remains a managed space-hosting product, not generic chat software (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- the public control surface remains the commons + steward agent, not a hidden direct API (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- spawned spaces remain direct peers after provisioning, not relayed sessions (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)
- identity remains cryptographic-first, with no profile/account model added in response to this feedback (see origin: `docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md`)

This is a polish and handoff fix, not a conceptual redesign.

## Local Research Summary

### Current failing surfaces

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)
  Currently too thin. It tells the agent to sign up and request a home space, but does not document the station `AUTH` frame, `AUTH_RESULT`, or the preferred runtime path.
- [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
  Good product framing, but not yet a strong operator-facing quickstart.
- [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts) and [intent-space/src/space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
  These validate station auth correctly, but still allow malformed attempts to collapse into generic/internal-feeling failures instead of more legible protocol feedback.

### Relevant institutional learnings

- [docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
  If a runtime exists and is meant to be the preferred mechanics surface, it must be clearly visible. Otherwise agents rationally build their own helper.
- [docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  The HTTP-to-ITP handoff is a real architecture seam and needs explicit treatment in docs and errors.
- [docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
  Headwaters already exposed that spawned spaces need per-space auth and runtime handoff. This polish plan should make that seam legible to fresh agents, not just to implementers.

## Research Decision

Proceeding without external research.

Why:

- this is not a standards problem now
- the failure came from a fresh-agent run against the current product
- the codebase already contains the exact runtime, docs, and auth files that need to be aligned

## Proposed Solution

Tighten the Headwaters public contract in three layers:

1. **Make the preferred mechanics surface explicit**
   Headwaters docs should clearly tell agents to use the existing Python protocol-shell runtime first, not leave them to infer that a client library exists.

2. **Document the post-signup station handoff concretely**
   Headwaters docs should show:
   - exact `AUTH` frame
   - exact `AUTH_RESULT`
   - one minimal commons happy path
   - one minimal spawned-space handoff example

3. **Upgrade auth failure quality**
   Malformed or incomplete `AUTH` frames should yield protocol-grade errors rather than opaque implementation leaks or low-signal generic failures.

This should be treated as the minimum polish bar before outside testing.

## Technical Considerations

- Do not invent a second Headwaters-specific runtime. Reuse the existing Python protocol-shell runtime and make it visible.
- Do not weaken the proof-of-possession model just to simplify docs. The goal is to explain the contract, not bypass it.
- Prefer improving `AUTH` request validation close to the wire so both Headwaters and any future multi-space products benefit.
- The docs should support two legitimate agent modes:
  - runtime-first
  - raw-protocol fallback

## System-Wide Impact

- **Interaction graph**: onboarding docs influence whether agents use the runtime or raw protocol; malformed `AUTH` flows through `intent-space/src/space.ts` into `intent-space/src/auth.ts`, so error quality changes here affect both Headwaters and any other station built on the same runtime.
- **Error propagation**: low-level JWT/shape failures currently bubble up as generic auth failures. This plan should preserve correctness while making the error reasons more protocol-legible.
- **State lifecycle risks**: low; this is mostly docs + error handling. The main risk is drifting docs that no longer match the actual runtime or wire shapes.
- **API surface parity**: Headwaters docs, runtime docs, and any dogfood/example scripts all need the same `AUTH` and handoff shapes.
- **Integration test scenarios**:
  - malformed `AUTH` with missing `stationToken`
  - malformed `AUTH` with missing `proof`
  - valid runtime-first commons entry
  - runtime-first spawned-space handoff after steward reply

## Acceptance Criteria

- [ ] `headwaters/agent-setup.md` explicitly recommends the preferred runtime/mechanics surface instead of only raw protocol reading.
- [ ] Headwaters docs include one exact `AUTH` frame example and one exact `AUTH_RESULT` example.
- [ ] Headwaters docs include one minimal end-to-end happy path: signup → connect → AUTH → request home space → connect to spawned space.
- [ ] Headwaters docs make the commons/steward request contract explicit enough that a fresh agent does not need to infer the next step from server code.
- [ ] Malformed `AUTH` frames return protocol-grade errors that identify the missing/invalid field or shape.
- [ ] A fresh-agent rerun (Claude is enough for this pass) completes the current home-space happy path or, if it still fails, fails for a more specific next issue than “undocumented AUTH”.

## Success Metrics

- A fresh agent can complete Headwaters without guessing the TCP auth schema.
- The preferred runtime becomes visible enough that agents naturally choose it or explicitly justify bypassing it.
- Error feedback during auth becomes developer-usable rather than implementation-leaky.
- Headwaters becomes safe to hand to an outside colleague as a first impression.

## Dependencies & Risks

### Dependencies

- existing Headwaters runtime slice
- current Python protocol-shell runtime in `academy/skill-pack/sdk/promise_runtime.py`
- station auth validation in `intent-space/`

### Risks

- docs could drift from the real frame shapes if examples are hand-maintained carelessly
- improving errors too aggressively could accidentally reveal internal details or weaken the auth path
- runtime visibility could become confusing if Headwaters points to academy-owned paths without enough explanation

### Mitigations

- derive examples from the actual current implementation and dogfood script where possible
- keep error improvements protocol-oriented, not stack-trace-oriented
- state explicitly that Headwaters currently reuses the generic Python runtime from academy as the shared mechanics surface

## Implementation Phases

### Phase 1: Public contract docs

Goal: make the Headwaters handoff legible.

Likely files:

- `headwaters/agent-setup.md`
- `headwaters/README.md`
- possibly a small reference file under `headwaters/` for exact wire examples

Deliverables:

- runtime-first guidance
- exact `AUTH` example
- exact `AUTH_RESULT` example
- explicit commons request example
- explicit spawned-space reconnect example

### Phase 2: Runtime visibility and examples

Goal: make the preferred mechanics surface obvious.

Likely files:

- `headwaters/agent-setup.md`
- `headwaters/README.md`
- `headwaters/scripts/headwaters-agent.py`
- possibly `academy/skill-pack/sdk/promise_runtime.py` docs/comments if needed

Deliverables:

- clearer link between Headwaters and the shared Python runtime
- one concrete runtime-first example flow
- no implication that agents must reverse-engineer raw TCP unless they choose to

### Phase 3: Auth error quality

Goal: turn malformed station auth into protocol errors.

Likely files:

- `intent-space/src/space.ts`
- `intent-space/src/auth.ts`
- tests in `headwaters/tests/` and possibly `intent-space/scripts/test.ts`

Deliverables:

- explicit validation of missing/invalid `stationToken`
- explicit validation of missing/invalid `proof`
- better messages for malformed `AUTH`
- no leaked “cannot read properties of undefined” style failures

### Phase 4: Fresh-agent rerun

Goal: validate the polish with a real fresh run.

Deliverables:

- rerun with Claude using the public Headwaters docs
- confirm whether it now uses the runtime, raw helper, or some mix
- record the new result and decide whether an additional polish pass is needed before colleague testing

## Documentation Plan

- update `headwaters/agent-setup.md`
- update `headwaters/README.md`
- add any missing exact examples in the smallest useful place
- compound the result if the rerun exposes a new sharp learning

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-23-headwaters-managed-intent-spaces-requirements.md)
  Key carried-forward decisions:
  - Headwaters remains a managed space-hosting service
  - the public control surface remains commons + steward
  - spawned spaces remain directly addressable after provisioning

### Internal References

- [headwaters/agent-setup.md](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)
- [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
- [intent-space/src/auth.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/auth.ts)
- [intent-space/src/space.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/space.ts)
- [academy/skill-pack/sdk/promise_runtime.py](/Users/noam/work/skyvalley/big-d/academy/skill-pack/sdk/promise_runtime.py)
- [headwaters/scripts/headwaters-agent.py](/Users/noam/work/skyvalley/big-d/headwaters/scripts/headwaters-agent.py)
- [docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md](/Users/noam/work/skyvalley/big-d/docs/solutions/integration-issues/protocol-shell-python-runtime-made-agents-comfortable-with-mechanics-but-not-sequencing-20260322.md)
- [docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-exposed-that-space-spawning-needs-per-space-auth-and-runtime-handoff-20260323.md)
