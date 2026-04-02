---
title: feat: replace NDJSON ITP with verb-header-body framing
type: feat
status: in_progress
date: 2026-04-02
origin: docs/brainstorms/2026-04-02-itp-verb-header-body-requirements.md
---

# feat: replace NDJSON ITP with verb-header-body framing

## Overview

ITP should stop using NDJSON as its live wire framing and replace it with a
message format that is more promise-native and agent-native:

- one explicit verb line
- required named headers
- explicit body length
- opaque replayable body bytes

This plan treats that as a full replacement, not an additive experiment. The
point is not merely prettier serialization. The point is to preserve explicit
promise and containment semantics while removing JSON-centric wire baggage and
allowing opaque bodies that may carry any content.

The redesign keeps ITP distinct from HTTP as a conceptual model. If HTTP is
used later, it carries the same ITP message as a body rather than redefining
the protocol.

## Problem Statement / Motivation

The current NDJSON wire shape solved the initial station transport problem, but
it now creates several recurring costs:

- agents must generate and repair JSON more than is useful
- the protocol body is implicitly biased toward structured payload fields even
  when natural language would be a better fit
- richer artifacts are awkward to carry honestly
- the wire still feels too close to API/resource semantics rather than explicit
  social acts with flexible content

The requirements doc chose a stricter but more agent-native split:

- keep the social act explicit and machine-decidable in headers
- let the body be opaque replayable bytes that may carry any content
- allow `payload-hint` as advisory interpretation metadata
- preserve current semantics while replacing NDJSON completely

## Proposed Solution

Replace the current NDJSON line protocol with a verb-header-body framing across
the entire ITP stack.

1. **Protocol and type redesign**
   Define a canonical message grammar with:
   - verb line
   - required headers
   - `body-length`
   - optional `payload-hint`
   - opaque body bytes

2. **Core station/client framing replacement**
   Replace current NDJSON parsing and JSON emission in the station and client
   libraries with the new parser/serializer. Recast station responses such as
   `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR` into the same envelope style.

3. **Auth/proof/canonicalization adjustment**
   Keep proof-of-possession semantics, but redesign canonical request hashing
   and message signing around the new message representation rather than JSON
   object canonicalization.

4. **SDK/runtime/docs/evals cutover**
   Update Python tools, local packs, docs, tests, harnesses, and examples so
   fresh agents interact with the new framing only.

## Technical Considerations

- **Do not weaken act semantics.**
  The verb and required headers must keep the act explicit. Models should not be
  asked to infer whether a message is a promise or assessment from body text.

- **Body flexibility is real, but bounded.**
  Bodies may be natural language or arbitrary bytes, but the protocol must still
  preserve and replay them faithfully.

- **Length framing over delimiter hacks.**
  Explicit body length is the cleanest way to support opaque bytes without
  lying to ourselves that the body is always text.

- **Do not let transport colonize ITP semantics.**
  If a later HTTP/WebSocket carrier is introduced, it should carry the same ITP
  message body. The protocol must not collapse into HTTP-native CRUD or admin
  semantics.

- **Auth is one semantic model with two transport profiles.**
  Ordinary ITP acts should converge on one common envelope across carriers. Auth
  is the deliberate exception: HTTP should adopt the existing Welcome Mat /
  DPoP work, while pure TCP should retain the current station-auth expression on
  the ITP wire. Interchangeability should come from shared materials and shared
  semantics, not forced byte-identical auth framing.

- **No dual stack.**
  The codebase should not preserve NDJSON parsing paths, fallback serializers,
  or compatibility shims once the new framing lands.

- **Do not invent protocol structure during implementation.**
  The common envelope grammar, per-verb required headers, proof
  canonicalization, and transcript/debug representation are protocol-defining
  surfaces. They should be pinned explicitly before code changes spread across
  the stack.

## System-Wide Impact

- **intent-space/**
  Core wire parsing, client/server framing, types, tests, and docs all change.

- **academy/** and **headwaters/**
  Welcome Mat docs, setup docs, onboarding examples, and harness instructions
  all need to stop teaching NDJSON and JSON field-level payload assumptions and
  should point to the canonical marketplace pack where appropriate.

- **Auth and proofs**
  Current proof binding depends on JSON canonicalization and request hashing.
  That logic must be recut around the new canonical message shape.

- **Fresh-agent ergonomics**
  The canonical marketplace pack and local product docs should become less JSON
  brittle and more natural to compose with model-native bodies.

## Pre-Work Protocol Definition Gate

Before implementation begins, the following protocol decisions must be written
down explicitly in the plan or a linked protocol addendum. These were too
central to leave implicit:

1. **Common envelope grammar**
   - exact verb line syntax
   - exact header syntax
   - header ordering rules
   - duplicate header policy
   - unknown header policy
   - line ending / normalization rules
   - exact meaning of `body-length`

2. **Required headers per verb**
   - the minimal required header set for:
     - `AUTH`
     - `AUTH_RESULT`
     - `SCAN`
     - `SCAN_RESULT`
     - `INTENT`
     - `PROMISE`
     - `DECLINE`
     - `ACCEPT`
     - `COMPLETE`
     - `ASSESS`
     - `ERROR`
   - which references are required for each act to remain machine-decidable

3. **Canonical hashing and proof rule**
   - what exact bytes are hashed for request proof binding
   - how headers are normalized before hashing
   - whether and how body bytes participate in the proof hash
   - how the rule remains transport-independent across TCP and HTTP carriers

4. **Transcript and debug persistence**
   - how opaque bodies are stored locally for replay
   - whether transcripts store raw body bytes, an encoded form, or body sidecars
   - what the default debug/inspection surface is for large or binary bodies

5. **Auth transport-profile doctrine**
   - which auth materials are transport-independent and reusable across HTTP and TCP
   - what the HTTP auth profile reuses from Welcome Mat / DPoP
   - what the pure TCP station auth profile keeps from the current ITP auth design
   - how switching carriers mid-session can reuse the same auth assets without
     inventing a second auth model

This gate exists to prevent the wire contract from being invented piecemeal in
`space.ts`, `client.ts`, auth logic, and the Python tools.

## Implementation Phases

### Phase 0: Protocol Definition Addendum

Goal: lock the protocol-defining details that are still too important to leave
to implementation drift.

Tasks:

- Write the exact common envelope grammar
- Write the required headers per verb
- Define the canonical proof/hash rule for the new message representation
- Define transcript/debug persistence for opaque bodies
- Define auth transport profiles explicitly:
  - HTTP profile: adopt the existing Welcome Mat / DPoP work
  - pure TCP profile: keep the current station-auth expression on the ITP wire
  - continuity rule: the same underlying auth materials must remain reusable
    across both carriers
- Add a short HTTP carrier note confirming that the same ITP message is carried
  as the body rather than redefined as HTTP semantics
- Review the addendum against the current requirements and this plan before code
  changes start

Files likely involved:

- `intent-space/INTENT-SPACE.md`
- `intent-space/docs/welcome-mat-station-auth-profile.md`
- `intent-space/docs/itp-verb-header-body-profile.md`
- this plan document or a linked addendum beside it

Success criteria:

- A contributor can implement the framing without inventing missing wire rules
- The proof and transcript surfaces are explicit enough to test against
- The auth profile relationship between HTTP and TCP is explicit rather than implied
- The protocol contract is stable before Phase 1 code work begins

### Phase 1: Canonical Protocol Definition

Goal: define the new message grammar and replace the NDJSON-first language in
the conceptual docs.

Tasks:

- Define the canonical verb-header-body grammar
- Define common headers and required `body-length`
- Define advisory `payload-hint`
- Define required headers per verb
- Recast `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR` in the new message model
- Update `intent-space/INTENT-SPACE.md` and related architecture docs to
  describe the new framing and preserve current semantics

Files likely involved:

- `intent-space/INTENT-SPACE.md`
- `intent-space/src/types.ts`
- `docs/architecture/itp-transport-vs-conceptual-model.md`
- `intent-space/docs/welcome-mat-station-auth-profile.md`

Success criteria:

- The new wire shape is fully specified
- Verb/header requirements are explicit
- The exact common envelope grammar is no longer ambiguous
- The docs no longer describe NDJSON as the protocol surface

### Phase 2: Station And Client Framing Replacement

Goal: replace NDJSON parsing/emission with verb-header-body framing in the core
TypeScript station and client.

Tasks:

- Replace NDJSON stream parsing in `intent-space/src/space.ts`
- Replace NDJSON parsing and request/response handling in
  `intent-space/src/client.ts`
- Add serializer/deserializer utilities for the new message format
- Update socket and stream handling to read full framed messages using header +
  body length
- Recast response emission for `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR`
- Remove legacy NDJSON comments, helpers, and tests

Files likely involved:

- `intent-space/src/space.ts`
- `intent-space/src/client.ts`
- `intent-space/src/types.ts`
- `intent-space/scripts/test.ts`
- `intent-space/scripts/test.sh`

Success criteria:

- Station and client can exchange only the new framed messages
- NDJSON-specific parsing code is gone
- Core protocol tests pass against the new framing

### Phase 3: Proof And Canonical Request Recut

Goal: preserve current proof-of-possession semantics without relying on JSON
request canonicalization.

Tasks:

- Define canonical hashing rules for the new framed message
- Define whether body bytes are hashed directly, digested, or otherwise
  represented in the canonical proof input
- Define the shared auth materials reused across both carriers:
  keys, token continuity, audience binding, and proof-of-possession claims
- Keep the HTTP auth profile grounded in the existing Welcome Mat / DPoP work
- Keep the pure TCP auth profile grounded in the current station-auth
  expression on the ITP wire
- Update proof construction in:
  - `academy/src/agent-enrollment.ts`
  - `headwaters/src/agent-enrollment.ts`
  - Python SDK copies where applicable
- Update proof verification logic in `intent-space/src/auth.ts`
- Rework any request-hash documentation and examples
- Ensure `AUTH` and live per-message proof behavior remain semantically the same

Files likely involved:

- `intent-space/src/auth.ts`
- `academy/src/agent-enrollment.ts`
- `headwaters/src/agent-enrollment.ts`
- `academy/src/welcome-mat.ts`
- `headwaters/src/welcome-mat.ts`
- `intent-space/docs/welcome-mat-station-auth-profile.md`

Success criteria:

- Proof verification works for `AUTH`, `SCAN`, and live ITP acts
- No proof path depends on JSON object canonicalization anymore
- The auth profile remains explicit and promise-native
- HTTP and pure TCP auth profiles remain distinct in carrier expression but
  interoperable through shared underlying materials

### Phase 4: Python Tools And Canonical Pack Cutover

Goal: update the canonical Python tools surface in the marketplace repo and the
local product-facing docs to speak and teach the new wire format only.

Tasks:

- Replace NDJSON send/receive logic in the canonical marketplace tools and SDK
- Update transcript and debugging expectations as needed
- Keep the higher-level tools surfaces usable while changing the wire framing
  underneath
- Remove NDJSON wording from the canonical marketplace pack docs and examples
- Update `big-d` product docs so they reference the marketplace pack as the
  canonical agent surface rather than local pack copies

Files likely involved:

- `../claude-code-marketplace/plugins/intent-space-agent-pack/sdk/intent_space_sdk.py`
- `../claude-code-marketplace/plugins/intent-space-agent-pack/sdk/space_tools.py`
- `../claude-code-marketplace/plugins/intent-space-agent-pack/SKILL.md`
- `../claude-code-marketplace/plugins/intent-space-agent-pack/references/*`
- `academy/agent-setup.md`
- `headwaters/agent-setup.md`
- `academy/README.md`
- `headwaters/README.md`

Success criteria:

- Python agents can connect, authenticate, scan, and post using the new framing
- The canonical marketplace pack teaches only the new framing
- Local setup docs no longer teach NDJSON or imply product-local canonical pack copies
- Fresh-agent guidance remains coherent

### Phase 5: Docs, Harnesses, And Validation Artifacts

Goal: remove NDJSON-era assumptions across docs, tutorials, harnesses, and
evidence files.

Tasks:

- Replace NDJSON examples in:
  - `intent-space/README.md`
  - `intent-space/CLAUDE.md`
  - `academy/agent-setup.md`
  - `headwaters/agent-setup.md`
- Replace or retire NDJSON-era transcript artifacts and examples that still
  encode the old wire framing
- Update harness instructions that explicitly mention `SCAN_RESULT.messages` and
  NDJSON flow assumptions
- Refresh relevant docs/solutions if the framing change makes them misleading
- Ensure transcript/debug guidance explains how opaque or binary bodies are
  preserved and inspected

Success criteria:

- The docs no longer present NDJSON as the current wire shape
- Tutorial and harness artifacts are aligned with the new envelope
- Fresh-agent setup paths remain teachable

### Phase 6: End-To-End Validation

Goal: prove the replacement works across the core station, local products, and
fresh-agent flows.

Tasks:

- Run `intent-space` tests against the new framing
- Run `academy` and `headwaters` tests that depend on station auth and client
  interaction
- Validate the canonical marketplace Python pack against the new framing
- Validate at least one fresh-agent-oriented flow in academy and one in
  Headwaters after the cut
- Verify proof-of-possession and scan cursor behavior are still honest
- Confirm there is no remaining NDJSON fallback path in the codebase

Validation targets:

- `cd intent-space && npm test`
- `cd academy && npm test`
- `cd headwaters && npm test`
- targeted smoke tests for marketplace Python SDK/tools surfaces

Acceptance gate:

- The plan is not done until the core station, both local products, and the
  published/local agent mechanics surfaces all work with the new framing and no
  NDJSON compatibility path remains.

## Alternative Approaches Considered

### 1. Keep NDJSON and only loosen JSON payload fields

Rejected because the problem is not only payload structure. The wire framing
itself still pulls the system toward JSON-centric generation and interpretation.

### 2. Dual-stack NDJSON plus verb-header-body

Rejected because it would create prolonged conceptual and operational drift
during active development with little upside.

### 3. Let models infer verbs and references from free-form body text

Rejected because it would shift protocol meaning from explicit social acts to
receiver interpretation, which weakens promise-native honesty.

## Acceptance Criteria

- [ ] NDJSON is fully removed as the live ITP wire framing
- [ ] The new wire shape uses verb line + named headers + explicit body length
- [ ] Bodies are opaque replayable bytes with advisory `payload-hint`
- [ ] Each verb has explicit required headers that keep the act machine-decidable
- [ ] The common envelope grammar is pinned explicitly before implementation
- [ ] The canonical proof/hash rule is pinned explicitly before implementation
- [ ] Transcript/debug handling for opaque bodies is pinned explicitly before implementation
- [ ] `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR` are recast into the new
      envelope style
- [ ] Proof construction and verification work without JSON canonicalization
- [ ] The TypeScript station/client and the canonical marketplace Python SDK/tools surfaces all use the new framing
- [ ] The canonical marketplace pack and local product docs no longer teach NDJSON
- [ ] No NDJSON fallback or backward-compatibility path remains

## Success Metrics

- Agents need less JSON repair work to compose live ITP acts
- Protocol bodies can carry natural-language or artifact content more directly
  without weakening the act semantics
- The same ITP message can be carried over TCP or future HTTP/WebSocket
  transports without changing its conceptual model
- Fresh-agent usability remains at least as good as before the framing change

## Dependencies & Risks

### Dependencies

- Origin requirements doc:
  - [2026-04-02-itp-verb-header-body-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-02-itp-verb-header-body-requirements.md)
- Current transport/ontology stance:
  - [itp-transport-vs-conceptual-model.md](/Users/noam/work/skyvalley/big-d/docs/architecture/itp-transport-vs-conceptual-model.md)
- Current auth profile:
  - [intent-space/docs/welcome-mat-station-auth-profile.md](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)

### Risks

- Recutting proof canonicalization may be more invasive than the framing change
  itself
- `big-d` product docs may drift from the canonical marketplace pack if they
  are not updated in lockstep
- Fresh-agent docs may get worse temporarily if examples are updated before the
  client surfaces are stable
- Existing transcript and observability assumptions may hide NDJSON coupling in
  more places than the initial search reveals

## Promise-Native Architecture Check

- **Autonomous participants**
  - human participants
  - ordinary agents
  - product-specific stewards such as Headwaters
  - the station host as transport and visibility substrate

- **Promises about self**
  - the framing change does not create new promise authority
  - participants still promise only their own behavior; the protocol only
    carries their acts more cleanly

- **State authority**
  - authoritative state remains where it already belongs:
    - intent-space visibility and containment in the station/store
    - promise truth local to the relevant participants
  - the new framing is transport and representation work, not authority drift

- **Lifecycle acts**
  - `INTENT`, `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS` remain explicit
  - `RELEASE` remains available where later flows need it
  - the redesign does not permit these acts to become implicit body inference

- **Intent-space purity**
  - ITP remains the conceptual and protocol surface
  - any future HTTP carrier transports the same ITP message body rather than
    replacing ITP semantics with HTTP-native ones

- **Visibility / containment**
  - the framing change does not alter current containment rules
  - sensitive coordination visibility remains a product/station policy concern,
    not something hidden in body interpretation

- **Rejected shortcut**
  - rejected a dual-stack or free-form-body-only approach that would let
    receivers infer act meaning from natural language and weaken promise-native
    honesty

## Plan Review Checklist Pass

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance

- [x] Embedded callbacks replace real participants: false
- [x] “Promise-native” is claimed but the lifecycle is shortcut or hidden: false
- [x] `ASSESS` is absent where fulfillment quality matters: false
- [x] State authority silently drifts into the intent space: false
- [x] Auth or transport semantics displace native ITP semantics: false
- [x] The design relies on a mandatory relay without explicit justification: false
- [x] Sensitive fulfillment details have no scoped visibility model: false
