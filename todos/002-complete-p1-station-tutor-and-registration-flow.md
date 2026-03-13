---
status: complete
priority: p1
issue_id: "002"
tags: [intent-space, tutor, registration, tutorial, crypto]
dependencies: ["001"]
---

# Station Tutor And Registration Flow

## Problem Statement

The station now has deployable transport and onboarding artifacts, but the registration and tutorial contracts are still only documents. Phase 1 needs a running Differ-operated participant that performs registration challenge/response and guides the fixed tutorial ritual.

## Findings

- `intent-space` is already capable of carrying the messages the ritual needs.
- The station itself should remain pure; tutor/registrar behavior belongs in a separate participant.
- The tutorial contract is already defined in academy artifacts and can be turned into a simple fixed script.

## Proposed Solutions

### Option 1: Dedicated station tutor participant

Implement a small station-side participant that connects through `IntentSpaceClient`, watches the registration/tutorial spaces, verifies signatures, and posts the scripted responses.

Pros:
- Preserves intent-space purity
- Matches the planned architecture
- Easy to test end-to-end

Cons:
- Adds one more runtime component

## Recommended Action

Implement a dedicated tutor/registrar participant inside `intent-space` as a separate runnable module, not inside the core station server.

## Acceptance Criteria

- [x] A station tutor can observe registration intents and issue a challenge
- [x] The tutor verifies proof-of-possession against the advertised public key
- [x] The tutor acknowledges successful registration and instructs the agent to the tutorial space
- [x] The tutor runs the fixed ritual through `DECLINE`, `PROMISE`, `COMPLETE`
- [x] An external test client can finish the ritual with a successful `ASSESS`

## Work Log

### 2026-03-13 - Task created

**By:** Codex

**Actions:**
- Created the second phase-1 task from the approved plan after shipping transport + academy foundations

**Learnings:**
- This needs to be a separate participant, not more logic in the station server

### 2026-03-13 - Tutor and registration flow completed

**By:** Codex

**Actions:**
- Added `intent-space/src/tutor.ts` as a separate station-side participant
- Added `intent-space/src/tutor-main.ts` and `npm run tutor`
- Implemented registration challenge/response with RSA signature verification
- Implemented the fixed first-contact ritual through `DECLINE`, `PROMISE`, `COMPLETE`, and final tutorial acknowledgment
- Added `intent-space/scripts/test-tutor.ts` for end-to-end verification with a real generated keypair

**Tests run:**
- `npm run typecheck`
- `npm run test:tutor`
- `npm test`

**Learnings:**
- The cleanest Promise-Theory-aligned shape is a separate participant acting inside the station, not more behavior inside the station server
- Sequence-based dedupe is the right choice for a transcript-driven tutor because multiple message types can share the same promise or intent lineage
