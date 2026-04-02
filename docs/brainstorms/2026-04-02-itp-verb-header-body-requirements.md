---
date: 2026-04-02
topic: itp-verb-header-body
---

# ITP Verb Header Body

## Problem Frame

ITP currently uses NDJSON framing with JSON message bodies on the live station
wire. That has been workable, but it carries baggage that is increasingly at
odds with the repo's current direction:

- JSON generation and formatting are brittle for agents
- the wire surface still feels too close to CRUD/service-style API thinking
- opaque artifacts and richer bodies are awkward to carry honestly
- the protocol does not yet lean fully into agent-native natural-language
  expression where it is safe to do so

The goal is not to loosen promise semantics. The goal is to replace NDJSON with
an ITP-native message framing that keeps the social act explicit while allowing
the substantive body to be much more flexible.

## Requirements

- R1. ITP must replace NDJSON completely as the live wire framing. No backward
  compatibility layer or dual-stack protocol surface is required.
- R2. The replacement wire shape must use a strict envelope with:
  - one verb line
  - named headers
  - explicit body length
  - opaque replayable body bytes
- R3. The body must be preservable and replayable even when a receiver does not
  semantically interpret it.
- R4. The body is opaque replayable bytes and may carry any content. The
  protocol must not require JSON structure for the body.
- R5. All verbs may carry expressive bodies, but each verb must define the
  header fields required for the act to remain machine-decidable and
  promise-honest.
- R6. The envelope must preserve current intent-space and promise-native
  semantics rather than using the framing change as an excuse to simplify away
  important acts or references.
- R7. The protocol should use advisory body interpretation metadata such as a
  `payload-hint`, rather than assuming every body has one universally enforced
  schema or MIME contract.
- R8. The same ITP message form must be usable over multiple transports. Over
  TCP it is the payload framing; over HTTP it is the message body.
- R9. Transport adaptation must not collapse ITP into HTTP-native CRUD or
  service semantics.
- R10. The redesign must preserve current semantics while making the body model
  more agent-native and less JSON-centric.

## Success Criteria

- A fresh ITP message can be generated without JSON object construction while
  still remaining unambiguous about the act.
- Promise-relevant verbs (`PROMISE`, `ACCEPT`, `COMPLETE`, `ASSESS`, etc.)
  remain explicit and machine-decidable from headers alone.
- The protocol can carry opaque completion artifacts without pretending they
  must be flattened into JSON payload fields.
- The same protocol message can be carried over TCP or HTTP/WebSocket without
  changing the protocol's conceptual model.
- The redesign reduces JSON-formatting burden for agents without weakening
  promise-native semantics.

## Scope Boundaries

- This work is not about adding backward compatibility for NDJSON.
- This work is not about reducing the promise lifecycle to a smaller set of
  social acts.
- This work is not about letting models infer the act type from the body.
- This work is not about replacing ITP with HTTP semantics.

## Key Decisions

- Full replacement, not migration layer: active development does not justify
  carrying both NDJSON and the new framing.
- Strict act envelope, flexible body: protocol meaning lives in the header;
  expressive or opaque content lives in the body.
- Advisory `payload-hint`, not hard body schema: the protocol guarantees act
  interpretation and body preservation, not universal body decoding.
- Explicit body length, not blank-line or sentinel framing: this keeps the
  message body honestly arbitrary bytes.
- Same protocol over multiple carriers: HTTP may carry ITP, but does not become
  ITP's conceptual model.

## Dependencies / Assumptions

- Current ITP semantics in `intent-space/INTENT-SPACE.md` remain the conceptual
  baseline.
- Existing auth and proof-of-possession work should survive as semantic checks,
  though their exact canonical request/hash serialization may need redesign.
- The current station/client/docs/test surfaces in `big-d`, plus the canonical
  tools pack in the marketplace repo, all assume NDJSON in some form and will
  need coordinated replacement.

## Outstanding Questions

### Deferred to Planning

- [Affects R2,R5][Technical] What is the minimal common header grammar and what
  are the required headers per verb?
- [Affects R3,R7][Technical] How should `payload-hint` be represented and which
  validation rules, if any, should apply to it?
- [Affects R8,R9][Technical] What exact HTTP transport profile should carry the
  new ITP message body without reintroducing HTTP-native semantics?
- [Affects R6][Technical] How should `SCAN_RESULT` and `AUTH_RESULT` be recast
  in the new envelope so the station response model remains explicit?
- [Affects R10][Needs research] Which existing docs, harnesses, and the
  canonical marketplace pack should be updated first to keep fresh-agent
  workflows usable during the cut?

## Next Steps

→ /big-d:plan for structured implementation planning
