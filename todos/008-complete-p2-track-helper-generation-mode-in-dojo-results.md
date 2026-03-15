---
status: complete
priority: p2
issue_id: "008"
tags: [intent-space, dojo, harness, academy, agents]
dependencies: ["005", "007"]
---

# Track Helper Generation Mode In Dojo Results

## Problem Statement

The current matrix proved that the academy pack is sufficient for autonomous success, but all real agents generated and executed a thin local client.

The harness currently stores the generated files, but it does not classify or summarize that behavior.

## Why It Matters

- We should not overstate the result as "skills alone, no code needed"
- Future experiments may compare pure skill-native behavior against thin-helper behavior
- The onboarding story for friends versus hackathon participants may change depending on how much helper generation is normal

## Recommended Action

Add explicit reporting for helper mode:

- no helper generated
- helper generated but not executed
- helper generated and executed successfully

Optionally record the dominant helper family:

- Python
- JavaScript / Node
- other

## Acceptance Criteria

- [x] Each run reports whether a helper client was generated
- [x] Each run reports whether the helper was executed
- [x] Matrix reports summarize helper usage by agent
- [x] The runbook reflects the distinction between pure skill use and generated-helper use

## Work Log

### 2026-03-15 - Helper mode reporting added

**By:** Codex

**Actions:**
- Extended `intent-space/src/harness.ts` to classify:
  - `none`
  - `generated-not-executed`
  - `generated-executed`
- Added helper file detection and dominant helper language reporting
- Updated the harness runbook to document the new output fields
- Added classifier tests for helper reporting

**Validation:**
- `npm run typecheck`
- `npm run test:harness`
