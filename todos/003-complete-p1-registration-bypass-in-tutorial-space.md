---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, security, intent-space, tutor, onboarding]
dependencies: []
---

# Registration Bypass In Tutorial Space

## Problem Statement

The tutor lets any participant enter the tutorial ritual by posting the ritual greeting directly into the tutorial space, even if they never completed registration or proof-of-possession.

That breaks the phase-1 trust model. The plan and academy docs say new agents should register, prove control of their self-generated identity, and only then proceed into the ritual. The current implementation does not enforce that.

## Findings

- In [intent-space/src/tutor.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/tutor.ts), `handleTutorialGreeting()` accepts any `INTENT` in `TUTORIAL_SPACE_ID` whose content matches `RITUAL_GREETING_CONTENT`.
- There is no check that the sender previously completed the registration challenge flow.
- `RegistrationSession.verified` is set in `handleSignedChallenge()`, but that verified state is never consulted before allowing tutorial entry.
- As a result, an unauthenticated agent can skip registration entirely and still receive tutor guidance through the first coordination loop.

## Proposed Solutions

### Option 1: Gate tutorial entry on verified registration

Track verified agent identities and reject or ignore tutorial greetings from senders that have not completed the challenge flow.

Pros:
- Restores the intended onboarding contract
- Minimal behavioral change

Cons:
- Needs a durable or at least explicit verified-identity structure

Effort: Small
Risk: Low

### Option 2: Bind tutorial access to a registration-issued token or subspace

After successful registration, the tutor issues a specific tutorial ticket or assigned subspace, and only that path is accepted.

Pros:
- Stronger linkage between registration and ritual
- More explicit transcript semantics

Cons:
- More moving parts
- Slightly more ceremony for phase 1

Effort: Medium
Risk: Medium

## Recommended Action

## Technical Details

- Affected file: [intent-space/src/tutor.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/tutor.ts)
- Relevant methods:
  - `handleSignedChallenge()`
  - `handleTutorialGreeting()`

## Acceptance Criteria

- [x] Tutorial entry is rejected or ignored for agents that have not completed registration proof-of-possession
- [x] Verified registration state is explicitly consulted before creating a tutorial session
- [x] Tests cover the bypass attempt and prove it fails

## Work Log

### 2026-03-13 - Review finding captured

**By:** Codex

**Actions:**
- Reviewed tutor registration and tutorial flow
- Identified that tutorial entry is not bound to verified registration

**Learnings:**
- The current implementation has a complete registration transcript, but the ritual gate is only documentary, not enforced in code

### 2026-03-13 - Fix completed

**By:** Codex

**Actions:**
- Added explicit verified-agent gating in `intent-space/src/tutor.ts`
- Tutorial greetings from unverified agents now receive a decline and do not create tutorial sessions
- Extended `intent-space/scripts/test-tutor.ts` with a bypass regression test

**Tests run:**
- `npm run typecheck`
- `npm test`

**Learnings:**
- The right phase-1 gate is simple: registration proof completion must be consulted before tutorial session creation
