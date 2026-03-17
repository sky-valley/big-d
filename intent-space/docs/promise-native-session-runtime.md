# Promise-Native Session Runtime

This is a sketch of the higher-level agent interface that should sit above the
generic intent space.

The goal is simple:

- abstract mechanics
- preserve semantics
- keep judgment with the model

That means:

- the model should not handcraft NDJSON or manage sockets
- the model should not receive a solved end-to-end workflow client
- the model should reason over a live negotiation thread and choose the next move

The crucial distinction is:

- **space is the primitive**
- **thread is a derived path through spaces**
- **intent is born locally, then published socially**

## Why This Layer Exists

The generic intent space is deliberately minimal:

- post
- scan
- enter

That is the right substrate for a generic body of desire, but it is not the
right direct interface for a reasoning model.

In practice, a model is weak at:

- stream transport mechanics
- async inbox handling
- cursor bookkeeping
- exact JSON line formatting

But it is strong at:

- evaluating whether a promise is acceptable
- deciding whether to revise or decline
- deciding whether an outcome was fulfilled
- recursively pursuing sub-goals

So the right move is not to make the model speak the wire directly. The right
move is to give it a promise-native runtime that:

- owns mechanics
- projects a thread state
- lets the model pick the next semantic move

## Design Rule

Abstract mechanics, not meaning.

Also:

- keep topology primitive
- derive thread/path views above it

Good abstraction:

- `get_thread_state(thread_id)`
- `express_intent(...)`
- `offer_promise(...)`
- `accept(...)`
- `decline(...)`
- `assess(...)`
- `revise_desire(...)`
- `revise_promise(...)`
- `wait_for_update(...)`

Bad abstraction:

- `complete_dojo()`
- `negotiate_contract()`
- any tool that already contains the whole protocol workflow

## Conceptual Layers

### Layer 1: Raw Intent Space

The generic station remains:

- append-only
- containment-oriented
- cursor-based
- protocol-neutral about promise authority
- fractal by construction

### Layer 2: Promise Session Runtime

This layer owns:

- persistent connection/session
- async waiting and wake-up
- public projection into intent space
- thread-state projection
- correlation between public projections and local authority
- path derivation across spaces

### Layer 2a: Local Autonomy

This remains separate from the space.

It owns:

- authoritative local desire state
- authoritative local promise lifecycle
- assessment truth
- release / break / completion truth

Projected atoms in the space remain observational shadows.

In particular:

- an agent's intent originates in local authority
- publishing that intent into space is a projection step
- the shared space is where desire becomes discoverable, not where it becomes true

### Layer 3: Model Reasoning

The model sees one derived path through the underlying spaces:

- current thread summary
- open commitments
- pending decisions
- allowed moves
- references back to raw atoms when it wants evidence

The model decides:

- whether to express a new intent
- whether to revise, decline, or accept
- whether fulfillment has occurred

## Why This Is Better Than Plain Tool Calling

Plain tool calling often assumes a short request/response exchange.

Promise interaction is different:

1. post a move
2. wait for another agent to respond
3. observe new state
4. reason again
5. post the next move

That makes the right abstraction:

- stateful
- event-driven
- resumable

This is closer to a recursive model loop over an environment than to a single
RPC call.

## Thread Is The Derived Unit

A semantic thread is not identical to one intent-space subspace.

A thread may:

- originate in one conversational space
- continue in a child subspace
- span multiple spaces through delegation or revision
- collect both public projection refs and local authority refs

That does not make thread the primitive. It makes thread a useful derived path.

The substrate should stay space-centric.
The runtime can still be thread-centric.

That means high-level moves should be relative to a thread:

- `accept(thread_id, promise_id)`
- `revise_desire(thread_id, content)`
- `revise_promise(thread_id, promise_id, content)`
- `assess(thread_id, promise_id, assessment)`

The runtime, not the model, decides where those moves project publicly.

The shortest phrasing is:

- a **space** is a place
- a **thread** is a path

## What The Model Should Reason Over

Not raw atoms alone.

Prefer a projected state like:

```json
{
  "threadId": "thread-123",
  "role": "requester",
  "summary": "You requested access to a tutorial space.",
  "pendingDecisions": [
    {
      "decisionId": "dec-1",
      "summary": "Tutor offered completion if you revise the greeting.",
      "allowedMoves": ["REVISE_DESIRE", "DECLINE", "WAIT"]
    }
  ],
  "openCommitments": [
    {
      "promiseId": "promise-9",
      "summary": "Tutor promises completion after corrected greeting.",
      "status": "open"
    }
  ],
  "latestEvents": [
    {
      "atomType": "PROMISE",
      "atomId": "intent-77",
      "seq": 42,
      "summary": "Tutor offered a promise tied to corrected greeting."
    }
  ]
}
```

This keeps the model focused on social and semantic judgment instead of wire
noise.

## Python Sketch

The accompanying sketch lives at:

- [`../sketches/promise_session_runtime.py`](/Users/noam/work/skyvalley/big-d/intent-space/sketches/promise_session_runtime.py)

It defines:

- `ThreadState`
- `PendingDecision`
- `OpenCommitment`
- `SpaceRef`
- `DesireRef`
- `AuthorityRef`
- `ProjectionRef`
- `PromiseSessionRuntime`
- `LocalAutonomyAdapter`
- `IntentSpaceProjectionAdapter`
- `ThreadPathProjector`
- typed moves like `AcceptMove`, `AssessMove`, `ReviseDesireMove`, `RevisePromiseMove`

Minimal example:

```python
state = runtime.get_thread_state(thread_id)

for decision in state.pending_decisions:
    if "ACCEPT" in decision.allowed_moves:
        promise = state.open_commitments[0]
        runtime.accept(
            thread_id,
            promise_id=promise.promise_id,
        )

update = runtime.wait_for_update(
    thread_id,
    since_cursor=state.latest_cursor,
    timeout_seconds=30.0,
)
```

The important point is that the runtime owns:

- local desire recording
- local authority updates
- public projection
- waiting and wake-up
- state re-projection

The model is invoked again when judgment is needed.

## Relationship To MCP

This does not have to be MCP.

The core need is:

- a persistent runtime
- typed operations
- state projection
- async wait/resume

That can be exposed as:

- a local Python SDK
- a native app runtime
- an MCP server
- another tool runner

MCP is attractive only because it already packages:

- tools
- resources
- prompts

But the core abstraction is the promise session runtime, not MCP itself.

## What This Means For Future Interface Design

If we want agents to "speak promises" well, the ideal surface is:

- typed semantic moves
- strict schemas
- derived thread state
- resumable event loop
- links back to raw atoms

The ideal surface is not:

- prose-only instructions
- raw socket protocol
- a monolithic autopilot client

And the substrate below it should remain:

- fractal
- append-only
- location-independent from the caller's point of view
- unconcerned with whether a subspace lives in memory, a database, or another server

## Suggested Next Step

If this direction holds, the next implementation step should be one of:

1. build a real local Python runtime on top of the current thin SDK
2. expose the same runtime as an MCP server
3. add thread-state projection to the academy/dojo flow and compare agent behavior
