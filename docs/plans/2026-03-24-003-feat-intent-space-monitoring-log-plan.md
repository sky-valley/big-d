---
title: feat: Intent space monitoring log
type: feat
status: active
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-intent-space-monitoring-requirements.md
---

# feat: Intent space monitoring log

## Overview

`intent-space` currently has one durable store for successful ITP messages (`messages`) plus one narrow post-persist callback (`onStoredMessage`). It does not own a first-party persisted record of the broader request lifecycle around station participation.

This plan adds a generic append-only monitoring log inside `intent-space` so operators can inspect both successful and failed participation attempts without turning the station into a workflow engine or embedding Academy/Headwaters-specific evaluation policy (see origin: [2026-03-24-intent-space-monitoring-requirements.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/brainstorms/2026-03-24-intent-space-monitoring-requirements.md)).

The result should give the repo one honest answer to:

- what happened on the wire
- what was accepted or rejected
- what became durable message state
- what an operator can later use to evaluate agent behavior

## Problem Statement / Motivation

Today, the station can durably answer only one narrow question:

- what message successfully made it into the stored space log

That leaves major blind spots for real station operation and later agent evaluation:

- malformed JSON is not durably recorded
- failed `AUTH` is not durably recorded
- failed per-message proof validation is not durably recorded
- denied `SCAN` or post attempts are not durably recorded
- `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR` responses are not durably recorded
- store-write failures are not durably recorded

The origin requirements locked the intended shape:

- keep `onStoredMessage` narrow rather than stretching it into a full monitoring abstraction
- add a dedicated append-only monitoring table inside `intent-space`
- keep the records generic and operator-facing
- let Academy, Headwaters, and the evaluation harness derive higher-level agent-journey views later

This matches the repo’s broader architectural lessons:

- do not turn extension hooks into hidden control planes
- keep `intent-space` generic and observational
- preserve the distinction between participation evidence and higher-level interpretation

## Research Summary

### Relevant Current Code

- [space.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/space.ts)
  The station handles JSON parsing, introduction gating, `AUTH`, `SCAN`, authenticated post validation, persistence, and broadcast. All monitoring-worthy lifecycle boundaries already exist here.
- [store.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/store.ts)
  The SQLite store currently owns `messages` and `space_policies`. It is the natural place to add a second append-only persistence surface.
- [types.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/types.ts)
  Current wire types distinguish stored ITP messages from non-persisted `SCAN`, `SCAN_RESULT`, `AUTH_RESULT`, and `ERROR`.
- [auth.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/auth.ts)
  Auth/proof verification already has explicit failure points and canonical request semantics that should be reflected in the monitoring taxonomy.
- [harness.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/academy/src/harness.ts)
  The current dojo harness consumes station transcripts built from echoed stored messages only. It is an obvious downstream consumer of the richer monitoring log once one exists.

### Relevant Learnings

- [headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
  Reject hidden control through callbacks. Monitoring must stay observational and must not become a new product-behavior seam.
- [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
  Keep transport/auth mechanics and ITP participation semantics cleanly separated. Monitoring should describe these boundaries, not blur them.
- [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)
  `intent-space` should not become a workflow engine or authority surface. Monitoring must remain evidence, not derived truth.
- [observe-before-act-gate-IntentSpace-20260309.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/integration-issues/observe-before-act-gate-IntentSpace-20260309.md)
  Temporal protocol boundaries matter in this repo. The monitoring schema should make connection and dispatch phases reconstructable rather than collapsing them into generic error strings.

### Research Decision

Proceeding without external research. The work is repo-specific, there is strong local architectural guidance, and the main risk is violating project stance rather than missing third-party best practice.

## Proposed Solution

Add a generic monitoring subsystem to `intent-space` with four parts:

1. **A second append-only SQLite table for monitoring events**
   Persist lifecycle events independently from the `messages` table. Keep the schema generic and event-shaped rather than Academy/Headwaters-shaped.

2. **A station-owned emission path inside `space.ts`**
   Emit monitoring records at key lifecycle boundaries:
   - line parse success/failure
   - introduction gate rejection
   - unauthenticated participation rejection
   - `AUTH` attempt/result
   - per-message proof validation result
   - access-control result
   - `SCAN` attempt/result
   - write attempt/result
   - broadcast/send-side result only where operationally material

3. **A minimal operator read surface**
   Provide a small first-party way to inspect recent monitoring events without exposing them as normal participant protocol data. For v1, this can stay CLI- or store-oriented rather than becoming a new station message family.

4. **Coexistence rules for `onStoredMessage`**
   Preserve `onStoredMessage` as a narrow post-persist callback. The new monitoring system should not require callback composition or expansion of that contract.

## Monitoring Model

The v1 model should be one generic event stream, not several specialized tables.

Each monitoring row should be rich enough to support later filtering and reconstruction. At minimum the schema should support:

- a monotonically ordered monitoring event id
- timestamp
- lifecycle stage
- outcome (`attempt`, `accepted`, `rejected`, `sent`, `persisted`, `failed`)
- reason code or failure category
- connection/session correlation ids
- actor identifiers when known
- message family (`AUTH`, `SCAN`, stored ITP type, parser, connection, persistence)
- structured detail payload for request/message context

The important design choice is to preserve explicit categories and identifiers rather than stuffing free-form log strings into SQLite.

## Flow Analysis

### Primary Operator Flows

1. Operator inspects a station issue and asks:
   - did the client fail before auth, at auth, during proof validation, during access control, or during persistence?
2. Operator inspects agent behavior and asks:
   - did the agent authenticate
   - did it scan before acting
   - what messages did it try to post
   - where did it diverge from the intended process?
3. Evaluation tooling correlates:
   - agent transcript
   - stored message transcript
   - station monitoring log

### Important Failure Paths The Plan Must Cover

- invalid JSON line
- oversized line
- message before introduction completed
- `AUTH` with malformed or invalid token/proof
- authenticated message without proof
- proof mismatch due to request-hash drift
- sender/session mismatch
- denied access to private space
- failed `SCAN`
- failed persistence after validation
- internal monitoring write failure

### Important Gaps To Close In Implementation

- clear lifecycle taxonomy instead of ad hoc text
- stable correlation identifiers across related records
- an explicit degraded-mode story when monitoring writes fail
- an operator-facing query path that does not require reading raw SQLite internals by hand every time

## Technical Considerations

- **Keep `intent-space` generic.**
  No Academy-specific scenario names, no Headwaters provisioning states, no dojo scoring fields.
- **Do not create a new participant protocol family for v1.**
  The monitoring read surface can be local/operational first. Avoid colonizing ITP semantics with an admin protocol unless there is a later product need.
- **Prefer schema discipline over string logs.**
  Rich structured rows are more useful than one large message blob.
- **Do not make monitoring authoritative.**
  Monitoring is evidence about behavior, not the source of truth for promise state or product workflows.
- **Bias toward station safety.**
  If monitoring storage fails, the station should degrade observability rather than stop serving participation.
- **Preserve existing semantics.**
  `AUTH_RESULT`, `SCAN_RESULT`, and `ERROR` remain station responses; the monitoring system merely records their lifecycle context.

## System-Wide Impact

- **`intent-space/`**
  Gains new persistence schema, monitoring write helpers, lifecycle emission points, and likely a small operator read utility.
- **`academy/`**
  The dojo harness can later consume the new log, but this should be optional in the initial cut. V1 should not force a harness redesign in the same change.
- **`headwaters/`**
  Can later read generic station evidence for agent evaluation or operator debugging without adding Headwaters-specific instrumentation to the station.
- **Docs**
  `intent-space` docs should describe the existence and scope of the operator monitoring log and clarify the difference between stored message history and station lifecycle monitoring.

## Implementation Phases

### Phase 1: Monitoring Schema And Store API

Goal: create a durable generic event log inside `intent-space` without changing protocol behavior.

Tasks:

- Add a new append-only `monitoring_events` table in [store.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/store.ts)
- Add typed monitoring row definitions in [types.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/types.ts) or a closely related store-only type surface
- Add store methods to append monitoring events and query recent events
- Decide the minimal JSON structure for event details so schema stays stable while event payloads stay flexible
- Ensure store initialization/migration works cleanly for existing local databases

Likely files:

- `intent-space/src/store.ts`
- `intent-space/src/types.ts`
- `intent-space/README.md`
- `intent-space/INTENT-SPACE.md`

Success criteria:

- `intent-space` can persist and retrieve monitoring events independently of stored messages
- the new schema does not change `messages` semantics
- the event model is generic enough to represent all v1 lifecycle cases

### Phase 2: Station Lifecycle Instrumentation

Goal: emit monitoring events at the right lifecycle boundaries across connection, parse, auth, scan, and post paths.

Tasks:

- Add a small internal monitor helper in [space.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/space.ts) to emit structured events consistently
- Instrument:
  - line parsing and invalid JSON
  - line length rejection
  - introduction gate rejection
  - unauthenticated participation rejection
  - `AUTH` attempt and result
  - post/scan proof validation result
  - access control result
  - persistence attempt and result
  - response result where it materially clarifies operator diagnosis
- Preserve `onStoredMessage` exactly as a separate narrow hook
- Add connection/session correlation data so a run can be reconstructed across several emitted events

Likely files:

- `intent-space/src/space.ts`
- `intent-space/src/auth.ts`
- `intent-space/src/types.ts`

Success criteria:

- all major pre-persist failure paths produce durable monitoring records
- successful post and scan paths also produce sufficient lifecycle evidence
- removing or disabling `onStoredMessage` does not remove monitoring coverage

### Phase 3: Degraded-Mode Safety And Operator Read Surface

Goal: make the feature usable in practice without risking station correctness.

Tasks:

- Define failure handling for monitoring writes:
  - write failure does not crash normal station participation
  - the station exposes degraded monitoring state in a bounded way, likely stderr/logging and possibly an in-memory counter
- Add a minimal operator read path for v1
  - likely a small CLI or script under `intent-space/scripts/`
  - direct SQLite query helpers are acceptable for first cut
- Document the intended use:
  - operator diagnostics
  - downstream evidence for harness/evaluation
  - not participant-facing protocol history

Likely files:

- `intent-space/src/store.ts`
- `intent-space/scripts/test.ts`
- `intent-space/README.md`
- `docs/runbooks/dojo-agent-evaluation-harness.md`

Success criteria:

- a monitoring write failure does not take down the station
- operators have one supported way to inspect recent events
- docs clearly distinguish stored message history from lifecycle monitoring

### Phase 4: Validation And Downstream Alignment

Goal: prove the monitoring log is complete enough to be trusted and does not regress the station.

Tasks:

- Add tests for:
  - invalid JSON
  - oversize line rejection
  - pre-introduction send rejection
  - bad auth token/proof
  - proof mismatch on `SCAN`
  - access denied on private space
  - persistence failure path
  - normal stored post path with both `messages` and `monitoring_events`
- Add one operator-facing smoke check that verifies recent monitoring rows can be queried
- Optionally extend harness documentation to note that station lifecycle monitoring can now augment `station-transcript.jsonl`
- Keep Academy/Headwaters adoption of the log as follow-on work unless the implementation proves a tiny alignment patch is low-risk

Validation targets:

- `cd intent-space && npm test`
- targeted local smoke run against a started station using malformed and valid requests

Acceptance gate:

- The plan is not complete until the station can durably explain both the happy path and representative pre-persist failure paths without changing normal participation semantics.

## Alternative Approaches Considered

### 1. Expand `onStoredMessage` Into A General Monitoring Hook

Rejected. It is the wrong semantic contract, it still does not naturally cover parse/auth failures, and this repo has already learned to distrust callback-based hidden control surfaces.

### 2. Keep Monitoring Entirely Outside The Station

Rejected for v1. External listeners can only observe what escapes the station. They cannot durably see invalid JSON, failed auth, rejected proof, or store-write failures with the same fidelity as the station itself.

### 3. Add Several Specialized Monitoring Tables Immediately

Deferred. The first cut should validate one generic append-only event stream before hardening separate auth/scan/error stores.

### 4. Expose Monitoring Through New Participant-Facing Protocol Messages Now

Deferred. The requirements chose operator-only diagnostics first. A participant-facing query surface should be justified later rather than added speculatively.

## Acceptance Criteria

- [ ] `intent-space` persists full-lifecycle monitoring records in a dedicated append-only table
- [ ] the log covers successful and unsuccessful participation paths, not only stored messages
- [ ] `onStoredMessage` remains a narrow post-persist callback and is not expanded into the primary monitoring abstraction
- [ ] monitoring records remain generic and contain no Academy- or Headwaters-specific policy fields
- [ ] monitoring write failures do not break normal station behavior
- [ ] operators have a supported v1 way to inspect recent monitoring events
- [ ] the station docs describe the difference between stored message history and the new monitoring log
- [ ] representative negative paths and happy paths are covered by tests

## Success Metrics

- An operator can explain why an agent failed without relying on guesswork from missing station evidence.
- The dojo harness and later Headwaters tooling can derive agent-journey views from station evidence instead of requiring bespoke instrumentation.
- New product work does not try to route control behavior through `onStoredMessage` because the station now has an explicit observability substrate.
- `intent-space` still reads as a generic observational substrate, not as a workflow engine or promise authority.

## Dependencies & Risks

### Dependencies

- Origin requirements doc: [2026-03-24-intent-space-monitoring-requirements.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/brainstorms/2026-03-24-intent-space-monitoring-requirements.md)
- Current station/auth structure:
  - [space.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/space.ts)
  - [store.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/store.ts)
  - [auth.ts](/Users/julestalbourdet/Documents/sky_valley/big-d/intent-space/src/auth.ts)
- Relevant learnings:
  - [headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)
  - [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)

### Risks

- The event taxonomy may become too vague if implemented as strings rather than disciplined categories.
- Rich monitoring rows may accidentally persist more detail than needed if the schema is not reviewed carefully.
- A naive monitoring write path could introduce latency or failure coupling into normal station participation.
- Adding a read surface too early could accidentally create a de facto new admin protocol instead of a simple operator tool.
- Downstream consumers may overfit to v1 event shapes if the plan does not clearly separate base records from derived evaluation views.

## Promise-Native Architecture Check

- **Autonomous participants**
  The main participant remains the station itself. Monitoring does not add a new social actor on the wire. Operators, Academy, Headwaters, and the harness are downstream readers of the station’s evidence, not new protocol participants in this feature.
- **Promises about self**
  The station is only promising to record and expose its own observations about participation. It is not promising that those records are the authority for promise lifecycle truth, nor is it promising product behavior on behalf of other agents.
- **Where state authority lives**
  Authoritative stored social content remains in `messages`. Promise lifecycle authority remains local to the relevant participants or promise log. The new monitoring table is authoritative only for one thing: the station’s own operational observations of request handling.
- **Which lifecycle acts are required and why**
  No new promise lifecycle acts are introduced by this feature. This is intentional: the work is an observability enhancement around participation mechanics, not a new social flow. The plan therefore preserves `INTENT`/`PROMISE`/`ACCEPT`/`COMPLETE`/`ASSESS` semantics wherever they already belong and does not simulate them for monitoring.
- **How the design preserves intent-space purity**
  Monitoring stays inside station storage and operator tooling. It does not invent a second participant protocol family, does not shift promise authority into the space, and does not encode Academy/Headwaters workflow semantics into the station.
- **How visibility / containment is scoped**
  Monitoring records are operator-facing only in v1. They are not exposed as normal participant-visible space content. This avoids leaking operational failure detail into social spaces while keeping the station observable to its operators.
- **Rejected shortcut**
  The tempting shortcut was to stretch `onStoredMessage` into a general lifecycle hook and let products build behavior on it. That was rejected because this repo has already seen embedded callbacks distort autonomy boundaries and hide control logic.

## Promise-Native Plan Review

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [x] The plan explains visibility / containment for sensitive coordination artifacts
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names at least one shortcut rejected for violating the stance
- [x] Embedded callbacks do not replace real participants
- [x] The plan does not claim a promise-native social flow while shortcutting its lifecycle
- [x] `ASSESS` is not required here because this feature does not define a new fulfillment-quality social act
- [x] State authority does not drift into the intent space beyond station-owned operational observation
- [x] Auth and transport semantics complement rather than replace ITP semantics
- [x] The design does not rely on a mandatory relay
- [x] Operator-only visibility is explicitly scoped

## Sources

- **Origin document:** [2026-03-24-intent-space-monitoring-requirements.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/brainstorms/2026-03-24-intent-space-monitoring-requirements.md)
- **Related docs:**
  - [promise-native-planning-guardrails.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/architecture/promise-native-planning-guardrails.md)
  - [promise-native-plan-review.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/checklists/promise-native-plan-review.md)
  - [dojo-agent-evaluation-harness.md](/Users/julestalbourdet/Documents/sky_valley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)
