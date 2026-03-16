---
status: complete
priority: p1
issue_id: "001"
tags: [intent-space, onboarding, internet, tls, academy]
dependencies: []
---

# Internet Intent Space Station Foundation

## Problem Statement

`intent-space` is close to internet-deployable, but phase 1 still lacks the concrete pieces needed for an outside agent to bootstrap and use it: secure remote transport, a canonical onboarding pack, and a documented registration/ritual contract.

## Findings

- `intent-space` already supports Unix sockets and optional plain TCP listening.
- The repo already codifies critical invariants: self-description, containment, append-only storage, cursor-based reads, and observe-before-act.
- The main missing gap for phase 1 is not a new protocol. It is deployable transport plus onboarding and ritual surfaces that preserve those invariants.

## Proposed Solutions

### Option 1: Foundation slice now

Add TLS transport, add academy/onboarding source files, and define the registration + ritual contract in machine-readable and human-readable artifacts.

Pros:
- Makes the station genuinely deployable
- Produces reusable artifacts for external validation
- Preserves current architecture

Cons:
- Does not complete the full tutor-agent loop in one step

### Option 2: Full end-to-end station immediately

Add transport, academy pack, registration flow, and tutor behavior all at once.

Pros:
- Bigger visible leap

Cons:
- Higher risk of mixing contracts and implementation too early

## Recommended Action

Implement the foundation slice first:

1. TLS-capable remote transport for `intent-space`
2. academy/onboarding pack source files in-repo
3. explicit registration + ritual contract artifacts
4. tests and docs proving the deployable path

## Acceptance Criteria

- [x] `intent-space` supports a TLS-capable remote transport alongside existing local transport
- [x] Existing observe-before-act and scan semantics remain intact on the remote transport
- [x] In-repo academy/onboarding source files exist and document the canonical phase-1 flow
- [x] The registration contract and first ritual sequence are captured in explicit artifacts, not only prose
- [x] Tests cover the new transport path

## Work Log

### 2026-03-13 - Initial task creation

**By:** Codex

**Actions:**
- Created task from the approved internet station plan
- Narrowed the first implementation slice to deployable transport plus onboarding/contract artifacts

**Learnings:**
- The station already has optional plain TCP transport, so the missing pieces are smaller and more concrete than the plan initially assumed

### 2026-03-13 - Foundation slice completed

**By:** Codex

**Actions:**
- Added TLS-capable remote transport to `intent-space/src/space.ts` and TLS client support in `intent-space/src/client.ts`
- Extended `intent-space/scripts/test.ts` to cover TLS behavior alongside Unix socket and TCP
- Updated `intent-space/README.md` and `intent-space/CLAUDE.md` for remote deployment configuration
- Added academy source files in-repo for onboarding docs, a portable skill pack, and explicit registration/ritual contract artifacts

**Tests run:**
- `npm run typecheck`
- `npm test`

**Learnings:**
- The main production gap was not inventing a new protocol surface, but exposing the existing station semantics through a secure remote transport
- The registration and ritual contracts needed machine-readable artifacts, not just plan prose
