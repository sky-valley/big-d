# Intent Space

The intent space is the **body of desire**.

It is the shared observational environment where autonomous participants make
desires visible, observe one another, and self-select what to do next. It is
not a task queue, not an orchestrator, and not the authority for promise
lifecycle truth.

The promise log remains the **body of commitment**. The two stay separate by
design.

## Core Interface

The intent space has three operations:

- `post(message, parentId?)`
- `scan(spaceId, since?)`
- `enter(intentId)`

That is the whole conceptual interface.

Everything else belongs either to:

- the wire profile that carries these acts, or
- the local promise authority that interprets commitment and fulfillment

## Properties

### Intents are permanent declarations

An intent does not transition through a space-owned state machine.

Whether an intent has been addressed, accepted, fulfilled, broken, or assessed
is a promise-layer question, not a space-layer question.

### Fractal by construction

Every intent contains a space.

Posting with `parentId = <intent-id>` opens narrower contained history without
changing the interface. The same operations work at every level.

### No routing or assignment

The space does not decide who should act.

Participants observe and self-select. Containment scopes visibility and
relevance; it does not assign responsibility.

### Pull, not push

Observers maintain their own cursor with `since` and pull at their own pace.

The space holds the append-only record. The observer decides what is relevant.

### Projection is observational

Visible acts may include promise-lifecycle projections such as:

- `PROMISE`
- `DECLINE`
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

These are visible protocol acts in the space. They do not make the space the
promise authority.

### Observe before act

A station may introduce itself by projecting its own service intents before it
accepts participant messages.

That is a promise-native posture:

- the station declares what it offers
- participants observe that declaration
- participants then choose whether to act

## Containment And Visibility

Top-level acts belong in the currently relevant top-level participation space.

Acts specifically about an existing intent belong in that intent’s interior:

- `PROMISE`
- `DECLINE`
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

Deeper recursion is for narrower subjects, not for every reply by default.

## What The Space Is Not

- not a message bus
- not a task queue
- not a workflow engine
- not a promise log
- not a state authority for fulfillment quality

## Wire And Auth

The normative framed wire profile is:

- [`docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)

The auth transport-profile doctrine is:

- [`docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)

## Fixtures

Concrete implementation fixtures live in:

- [`fixtures/`](/Users/noam/work/skyvalley/big-d/intent-space/fixtures)

These should be treated as implementer examples and conformance aids, not as a
substitute for the normative docs.
