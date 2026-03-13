---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, performance, reliability, intent-space, tutor]
dependencies: []
---

# Unbounded Tutor Session State

## Problem Statement

The tutor stores all registration and tutorial sessions in memory forever with no cleanup policy.

On a long-running public station, this can grow without bound and eventually turn the tutor into a memory leak or make it behave unpredictably around stale sessions.

## Findings

- In [intent-space/src/tutor.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/tutor.ts), both `registrations` and `tutorialSessions` are process-local `Map`s.
- Entries are inserted in:
  - `handleRegistrationIntent()`
  - `handleTutorialGreeting()`
- Entries are never removed after successful registration, successful tutorial completion, or timeout.
- `seenMessages` is also unbounded and grows by every processed sequence number.
- This is acceptable for a tiny local test, but it is a poor fit for a continuously running internet-facing tutor.

## Proposed Solutions

### Option 1: Explicit lifecycle cleanup

Remove registration sessions after acknowledgment and remove tutorial sessions after final completion/timeout. Prune `seenMessages` to a bounded window.

Pros:
- Simple
- Keeps current architecture

Cons:
- Needs careful timeout choices

Effort: Small
Risk: Low

### Option 2: Durable state with bounded in-memory cache

Persist active/verified session state and keep only a short in-memory working set.

Pros:
- Better restart behavior
- Better operational story

Cons:
- More infrastructure and complexity

Effort: Medium
Risk: Medium

## Recommended Action

## Technical Details

- Affected file: [intent-space/src/tutor.ts](/Users/noam/work/skyvalley/big-d/intent-space/src/tutor.ts)
- Affected structures:
  - `registrations`
  - `tutorialSessions`
  - `seenMessages`

## Acceptance Criteria

- [x] Tutor state is cleaned up after successful completion or expiry
- [x] `seenMessages` is bounded or periodically pruned
- [x] Tests cover cleanup or expiry behavior

## Work Log

### 2026-03-13 - Review finding captured

**By:** Codex

**Actions:**
- Reviewed tutor state management in the new station participant
- Identified unbounded process-local maps with no cleanup path

**Learnings:**
- The tutor is correct as a scripted flow, but not yet shaped for long-running internet operation

### 2026-03-13 - Fix completed

**By:** Codex

**Actions:**
- Added tutor state pruning and bounded seen-message tracking in `intent-space/src/tutor.ts`
- Registration sessions are removed after successful verification
- Tutorial sessions are removed after successful completion
- Added assertions in `intent-space/scripts/test-tutor.ts` proving successful-path cleanup

**Tests run:**
- `npm run typecheck`
- `npm test`

**Learnings:**
- The scripted tutor needs explicit lifecycle cleanup even in phase 1, otherwise the public-station shape is misleading
