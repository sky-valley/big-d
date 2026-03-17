---
title: Promise-Native Runtime Should Keep Space Primitive and Thread Derived
date: 2026-03-16
category: architecture-decisions
tags:
  - intent-space
  - promise-theory
  - agent-interface
  - runtime-design
  - thread-projection
  - local-autonomy
  - sdk
component: intent-space
severity: high
resolution_type: architecture-decision
symptoms: |
  Needed a general agent-facing interface for "speaking promises" beyond the
  phase-1 dojo. Raw NDJSON and socket mechanics were too low-level for models,
  while a solved client would bypass protocol reasoning. It was unclear whether
  thread or space should be the primary abstraction, whether intent should be
  authoritative locally or in the shared space, and whether MCP was required.
root_cause: |
  We were still mixing three different layers: the spatial substrate (body of
  desire), local autonomy/commitment truth, and the model-facing reasoning
  surface. That made it easy to drift into the wrong abstractions: raw wire
  protocol, a workflow-complete client, or a "thread" primitive that displaced
  the underlying fractal space model.
---

# Promise-Native Runtime Should Keep Space Primitive and Thread Derived

## Problem

We needed to answer a larger design question than the dojo:

What is the right interface for agents to participate in an internet-scale body
of desire and reason through Promise Theory exchanges?

The dojo had already taught one important practical lesson:

- prose-only onboarding is too weak
- a solved end-to-end client is too strong
- a thin SDK plus semantic guidance is the useful middle ground

But that still left the deeper interface question unresolved. We needed to
decide whether agents should speak the wire directly, whether MCP was the right
carrier, what a "thread" really is relative to a fractal space/subspace model,
and where authoritative intent and promise state should live.

## Root Cause

The ambiguity came from collapsing three separate concerns:

1. **Spatial substrate**
   The intent space is the body of desire: append-only, fractal, containment-
   oriented, and location-independent from the caller's point of view.

2. **Local autonomy**
   An agent's real internal state must remain local: what it wants, what it is
   willing to promise, what it accepts, and how it assesses outcomes.

3. **Model-facing reasoning surface**
   A model should not manage sockets, NDJSON, or cursor mechanics. It should
   reason over a projected negotiation state and choose the next semantic move.

When those were not separated explicitly, the design kept drifting toward the
wrong extremes:

- raw protocol exposure
- a workflow-complete client
- or a new "thread" primitive that obscured the original fractal space model

## Solution

The solution was to make the layering explicit and keep each layer honest.

### 1. Keep space as the primitive

The generic `intent-space` substrate stays spatial and minimal:

- `post`
- `scan`
- `enter`

Every interaction creates more spacetime rather than mutating prior state. A
response to an intent does not "change" that intent. It creates another event,
often another subspace or another public shadow, that agents can observe and
interpret.

The substrate should remain agnostic about how subspaces are materialized:

- in memory
- in a local database
- in another process
- on another server

Callers should not care.

### 2. Treat thread as a derived path, not a primitive

A thread is not the substrate object. It is a useful runtime projection across
one or more spaces.

Shortest phrasing:

- a **space** is a place
- a **thread** is a path

That means:

- the substrate stays space-centric
- the model-facing runtime can be thread-centric

The runtime may correlate multiple spaces into one semantic negotiation path,
but it must not replace the underlying spatial model with a new hidden ontology.

### 3. Keep intent and promise authoritative locally

The shared space is where desire becomes visible, not where it becomes true.

We settled on the rule:

**intent is born locally, then published socially**

And similarly for promises:

- the local autonomy layer owns the authoritative state
- public atoms in the shared space are projections or shadows

That preserves autonomy and keeps the body-of-desire / body-of-commitment split
intact.

### 4. Give models a promise-native session runtime

The model should not speak raw NDJSON or manage stream protocol details. The
right interface sits above the generic space and below the model.

It should:

- own transport and waiting
- project one derived thread state
- surface pending decisions
- expose typed semantic moves

The runtime sketch now consists of four pieces:

- `LocalAutonomyAdapter`
- `IntentSpaceProjectionAdapter`
- `ThreadPathProjector`
- `PromiseSessionRuntime`

This runtime is evented and resumable. It is closer to a recursive
observe-reason-act loop than to a plain one-shot RPC tool call.

### 5. Split revision into separate authored acts

`revise` turned out to be too vague. It hides two distinct things:

- revising what I want
- revising what I am willing to do

So the runtime now distinguishes:

- `revise_desire(...)`
- `revise_promise(...)`

That preserves the append-only/autonomy model. A revision is not a mutation. It
is a new declaration with lineage, even if lineage stays implicit for now.

### 6. Do not force lineage into the substrate yet

We considered whether `parentId` is enough to represent revision lineage.

Conclusion:

- `parentId` gives spatial context
- it does not necessarily encode semantic supersession

But this is not a substrate blocker right now. A runtime/agent can often infer
enough from:

- context
- timing
- actor identity
- semantic summaries

So lineage metadata such as `supersedesId` can remain optional for now rather
than becoming a required primitive prematurely.

## The Interface We Landed On

The model-facing runtime should expose semantic operations like:

- `get_thread_state(thread_id)`
- `express_intent(...)`
- `offer_promise(...)`
- `accept(...)`
- `decline(...)`
- `assess(...)`
- `revise_desire(...)`
- `revise_promise(...)`
- `wait_for_update(...)`

The important discipline is:

- abstract mechanics
- do not abstract away meaning

In practice that means:

- no raw socket management in the model
- no workflow-complete client that bypasses reasoning
- no monolithic `complete_dojo()`-style helper

## Design Rules Going Forward

### Space is for structure, not workflow

Do not add protocol conveniences to `intent-space/` that secretly turn it into a
workflow engine or a promise authority.

### Local authority first

If an act represents an agent's own desire or commitment, record it locally
before projecting it publicly.

### Projection is social, not authoritative

Treat public atoms in the shared space as discoverable shadows of local truth.

### Thread is a runtime view

If a feature wants "thread," build it as a projector above the spatial
substrate, not as a replacement for spatial containment.

### Prefer thin typed interfaces

For models, a small typed SDK/runtime is better than:

- prose-only instructions
- freehand JSON
- a solved client

### Split authored acts cleanly

Do not overload one primitive with multiple semantic roles. If desire revision
and promise revision are different acts, give them different moves.

## What This Prevents

This decision protects the project from a few easy but harmful drifts:

- turning the shared space into the source of promise truth
- flattening fractal spatial structure into a synthetic "thread database"
- making the model reason over transport instead of negotiation
- smuggling choreography into a supposedly generic SDK
- over-specifying lineage before the runtime actually needs it

## Files Created During This Pass

- `intent-space/docs/promise-native-session-runtime.md`
- `intent-space/sketches/promise_session_runtime.py`

Those are intentionally sketches, not production implementations. Their purpose
is to lock the abstraction before code hardens around the wrong boundary.

## Related Documentation

- [protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md](../architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md)
- [intent-space-promise-theory-participant.md](../integration-issues/intent-space-promise-theory-participant.md)
- [sdk-only-dojo-pack-worked-after-fixing-stale-local-stack-launcher-20260316.md](../integration-issues/sdk-only-dojo-pack-worked-after-fixing-stale-local-stack-launcher-20260316.md)
- [intent-space/INTENT-SPACE.md](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [promise-native-session-runtime.md](/Users/noam/work/skyvalley/big-d/intent-space/docs/promise-native-session-runtime.md)

## Next Step

If this direction holds, the next real implementation step should be:

1. build a local Python runtime over the thin SDK using the new interfaces
2. keep the generic space untouched
3. compare agent behavior when reasoning over projected thread state instead of
   raw protocol artifacts
