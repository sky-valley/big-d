---
status: complete
priority: p1
issue_id: "010"
tags: [intent-space, http, welcome-mat, reference-station]
dependencies: ["009"]
---

# Build HTTP Reference Station

Add a pure `http-reference-station/` sibling that proves the HTTP carrier story
for intent-space without turning HTTP into the semantic center.

## Problem Statement

`big-d` now cleanly has `intent-space/` as the spec home and
`tcp-reference-station/` as the plain runnable TCP reference, but the HTTP side
is still only a doctrine in docs. That leaves the repo without a runnable proof
that Welcome Mat-compatible discovery and signup can coexist with framed ITP
carriage over HTTP.

## Findings

- The TCP reference already contains the append-only store, framing logic, and
  service-intent posture we want to preserve.
- The removed academy surface contained a usable narrow Welcome Mat slice:
  discovery markdown, DPoP/signup validation, and station-token issuance.
- The current HTTP plan intentionally keeps `/itp`, `/scan`, and `/stream`
  small and separate so HTTP does not colonize ITP semantics.

## Proposed Solutions

### Option 1: Add a thin HTTP tunnel over the TCP server

**Approach:** Proxy framed messages into the TCP reference and treat HTTP as a
transport shim.

**Pros:**
- Low implementation effort
- Reuses the TCP server almost entirely

**Cons:**
- Does not prove the HTTP carrier story directly
- Hides the Welcome Mat / HTTP-auth behavior inside an adapter

**Effort:** 0.5-1 day

**Risk:** Medium

---

### Option 2: Build a dedicated HTTP reference station

**Approach:** Create `http-reference-station/` as its own runnable project,
reusing the store/framing model while implementing Welcome Mat-compatible HTTP
discovery, signup, `/itp`, `/scan`, and `/stream`.

**Pros:**
- Proves the intended HTTP doctrine directly
- Keeps carrier boundaries legible
- Gives other teams a real HTTP implementation reference

**Cons:**
- Some duplication with the TCP reference
- Requires new integration coverage

**Effort:** 1-2 days

**Risk:** Medium

## Recommended Action

Execute Option 2. Keep the append-only space model and framing semantics aligned
with the TCP reference, bring over only the narrow Welcome Mat pieces needed for
HTTP discovery/signup, and keep the resulting project pure: no steward, no
dojo, no product extras.

## Technical Details

**Main targets:**
- `http-reference-station/`
- `intent-space/docs/welcome-mat-station-auth-profile.md`
- `intent-space/README.md`
- `README.md`
- `AGENTS.md`

## Resources

- Plan: `/Users/noam/work/skyvalley/big-d/docs/plans/2026-04-03-001-feat-http-reference-station-plan.md`
- Requirements: `/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-03-http-reference-station-requirements.md`

## Acceptance Criteria

- [x] `http-reference-station/` exists and runs locally with obvious defaults
- [x] Welcome Mat-compatible discovery and signup work over HTTP
- [x] `/itp` accepts framed ITP messages in HTTP bodies
- [x] `/scan` returns framed `SCAN_RESULT` bodies
- [x] `/stream` emits visible stored acts over SSE for one space
- [x] Root/spec docs describe the HTTP reference honestly

## Work Log

### 2026-04-03 - Work started

**By:** Codex

**Actions:**
- Reviewed the HTTP reference requirements and plan
- Re-read the TCP reference runtime and framing/store boundaries
- Recovered the old academy Welcome Mat slice from git history for narrow reuse

**Learnings:**
- The implementation can stay small if signup/auth stay HTTP-native and only
  the space model is shared
- `/stream` is the one place where byte-faithful semantics need the most care

### 2026-04-03 - HTTP reference completed

**By:** Codex

**Actions:**
- Created `http-reference-station/` with a runnable Node/TypeScript server,
  Welcome Mat discovery/signup, `/itp`, `/scan`, and `/stream`
- Reused the append-only store and framed wire model from the TCP reference
  without collapsing the transport boundary
- Added an integration suite covering discovery, signup, framed HTTP
  participation, scan parity, and SSE observation
- Updated repo/spec docs so the new HTTP sibling is part of the live repo story
- Ran validation:
  - `cd /Users/noam/work/skyvalley/big-d/http-reference-station && npm run typecheck`
  - `cd /Users/noam/work/skyvalley/big-d/http-reference-station && npm test`

**Learnings:**
- The cleanest HTTP posture is Welcome Mat at discovery/signup and framed ITP
  only where live acts actually belong
- SSE works cleanly when it streams framed stored acts directly rather than a
  separate event schema

## Notes

- Keep marketplace repo changes out of scope for this pass.
