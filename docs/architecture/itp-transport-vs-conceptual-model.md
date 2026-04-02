# ITP Transport Vs Conceptual Model

## Purpose

This note clarifies why `big-d` introduced ITP as a distinct protocol surface
and what that does, and does not, imply about transport choices.

The short version:

- we reject HTTP as the **conceptual model**
- we do not necessarily reject HTTP or WebSocket as a **transport carrier**

## The Problem We Were Solving

Plain HTTP carries strong default expectations:

- request/response
- client/server asymmetry
- resource ownership
- CRUD-shaped state mutation
- centralized service authority
- success and failure framed as server adjudication

Those defaults tend to pull implementations toward:

- command surfaces
- hidden state mutation
- endpoint choreography instead of visible social acts
- weakened participant autonomy

That framing is a poor fit for:

- intent space as observational body of desire
- append-only visible participation acts
- containment and subspace semantics
- local promise authority
- promise-native autonomy

## Why ITP Exists

ITP exists to preserve the right conceptual center:

- explicit participation messages
- append-only visible acts
- observation before control
- containment rather than resource mutation
- explicit commitments rather than hidden workflow state
- autonomous participants rather than commanded clients

This is why moving away from plain HTTP semantics was correct.

## What Is Semantically Essential

The following properties are the important part of the architecture:

- explicit protocol messages
- append-only visible acts
- `SCAN` and observation as first-class operations
- clear containment and subspace rules
- no hidden centralized lifecycle authority in the space
- promise authority remaining local to the promising and assessing parties
- no implicit assignment or routing authority
- participant autonomy preserved at the protocol level

If these properties survive, the system remains philosophically itself.

## What Is Probably Transport-Accidental

The following are current implementation choices, not obviously sacred
architectural requirements:

- raw TCP specifically
- NDJSON framing specifically
- long-lived sockets as the only transport profile
- proof material bound only to TCP-carried messages

These may remain good choices, but they are not the same thing as the core
promise-native model.

## The Architectural Distinction

The stable doctrine is:

- **ITP must remain distinct from HTTP as a conceptual model**
- **ITP may be carried over different transports if its semantics remain intact**

That means a deployment profile may use:

- raw TCP
- HTTP
- WebSocket
- or another carrier

without collapsing ITP into:

- REST resources
- CRUD semantics
- centralized server-state authority
- workflow disguised as endpoint design

## Practical Rule For Future Deployments

When evaluating a new substrate such as Cloudflare Durable Objects, ask:

1. Does this force us to abandon ITP semantics?
2. Or does it only require a different transport profile for carrying the same
   protocol?

If the answer is:

- **semantic collapse into HTTP/CRUD/service authority**: reject it
- **transport adaptation while preserving ITP semantics**: consider it

## Application To Cloudflare Durable Objects

Cloudflare Durable Objects are HTTP and WebSocket oriented. That is real
architectural friction for the current TCP-shaped station profile.

But that friction is primarily about **transport**, not necessarily **ontology**.

A Durable Object backed deployment could still be acceptable if:

- agents continue to interact through ITP message forms
- containment and `SCAN` semantics remain explicit
- promise authority does not move into the host substrate
- HTTP or WebSocket is only the carrier for ITP, not the replacement for it

So the right stance is not:

- "HTTP is philosophically impossible"

It is:

- "HTTP is philosophically misleading when allowed to define the model"

## Decision

Going forward:

- preserve ITP as the authoritative conceptual and protocol surface
- resist collapsing the architecture into HTTP-native CRUD/service semantics
- allow transport-profile experimentation only when the ITP semantics remain
  explicit and intact
