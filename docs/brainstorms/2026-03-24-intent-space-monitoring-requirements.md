---
date: 2026-03-24
topic: intent-space-monitoring
---

# Intent Space Monitoring

## Problem Frame
The current intent space has no first-party persisted monitoring log beyond its main stored message log. In practice, it persists successful ITP messages into the append-only `messages` table and exposes `onStoredMessage` as an optional in-process callback that fires only after a message has already been accepted and stored.

That means the current system can observe what successfully became part of the stored space log, but it cannot durably observe what clients attempted and failed to do before persistence. It has no first-party record for malformed input, failed auth, failed proof validation, denied access, rejected scans, rejected writes, or other protocol errors that never became stored messages. That leaves a major blind spot for operating stations safely and for later evaluating whether Academy or Headwaters agents actually followed the intended participation process.

The first job of this work is to make the space itself observably accountable for the full request lifecycle around participation. A second job, built on top of that substrate, is to let downstream systems inspect those records to understand agent behavior, process mistakes, and failure patterns without baking dojo-specific evaluation logic into `intent-space`.

## Requirements
- R1. `intent-space` must record monitoring events for the full request lifecycle around participation, not only for messages that were successfully persisted.
- R2. The monitoring log must cover both successful and unsuccessful paths, including malformed input, auth attempts and results, proof validation outcomes, access checks, scan requests and results, rejected writes, persistence failures, and other protocol errors.
- R3. The first version must use a dedicated append-only monitoring table owned by `intent-space`, separate from the stored message log and separate from the existing `onStoredMessage` callback.
- R4. Monitoring records must remain generic to the space and protocol. They must not encode Academy-specific or Headwaters-specific evaluation policy as first-class schema concepts.
- R5. Monitoring records must be rich enough to reconstruct what happened around a client attempt, including lifecycle stage, outcome, reason category, actor/session identifiers, and enough message or request detail to support later analysis.
- R6. `onStoredMessage` should remain available as the existing narrow post-persist callback for successful stored messages rather than being expanded into the full monitoring system.
- R7. The monitoring design must not depend on attaching product behavior to the monitoring path or reusing `onStoredMessage` as a business-logic control surface.
- R8. The monitoring system must be safe to run in production-like stations: it should not introduce a failure mode that breaks normal space behavior when monitoring logic fails or falls behind.
- R9. The design must balance capture and safety by preferring continued space operation over perfect observability while still making important lifecycle failures visible whenever possible.
- R10. The first version of the monitoring log must be operator-facing diagnostics only, not a normal agent-facing surface.
- R11. The monitoring records must be queryable in a way that later consumers in Academy, Headwaters, or evaluation harnesses can derive agent-journey and policy-compliance views without changing the underlying intent-space schema.

## Success Criteria
- Operators can inspect a single space-owned monitoring log and understand both what was successfully stored and what clients attempted but failed to do.
- The log makes previously invisible cases observable, including malformed JSON, failed auth, failed proof validation, denied access, rejected scans, rejected writes, and protocol-level error responses.
- Academy and Headwaters can use the monitoring records as evidence for whether agents followed the intended process without requiring dojo-specific instrumentation inside `intent-space`.
- The resulting design does not require attaching operational product behavior to monitoring callbacks or treating `onStoredMessage` as the primary extension seam for new control flows.
- The existing stored message path and protocol behavior remain intact; adding monitoring does not redefine the role of the space as observational rather than authoritative for promise lifecycle logic.
- A monitoring failure does not take down or materially corrupt normal space participation.

## Scope Boundaries
- This work is not a redesign of the ITP wire protocol.
- This work does not make `intent-space` authoritative for promise lifecycle semantics beyond its existing role.
- This work does not expose monitoring records as a general-purpose participant-facing feature in v1.
- This work does not require building full agent scoring, policy evaluation, or dojo assessment logic inside `intent-space`.
- This work does not replace `onStoredMessage`; it complements it with broader lifecycle coverage.
- This work does not turn monitoring callbacks into a control plane for provisioning, workflow dispatch, or other product behavior.

## Key Decisions
- Dedicated monitoring table over today's callback-only gap: the current system has a persisted `messages` table and a narrow `onStoredMessage` callback, but no first-party persisted monitoring store for pre-persist lifecycle events.
- Dedicated monitoring table over callback-only monitoring: the space should own a durable observability substrate instead of relying on optional downstream listeners.
- One append-only generic table over many purpose-specific tables: the simplest durable shape is a single lifecycle event log that can support later read models.
- Generic space observability over embedded agent evaluation: `intent-space` should emit protocol- and participation-level evidence, while Academy and Headwaters interpret that evidence for their own workflows.
- Rich records by default in v1: the first version should favor discovery and analytical usefulness, with the option to narrow fidelity later if operational costs prove too high.
- Safety-biased capture: monitoring should strive to capture important failures, but must not become a reason the space stops serving normal participation.
- Preserve `onStoredMessage` as a narrow callback, not the foundation of the new design: the hook remains useful for post-persist observers, but the durable monitoring substrate should live in storage, not in callback composition.
- Operator-only access in v1: the monitoring log is internal diagnostics first, with any broader exposure deferred until there is a clear product need.

## Dependencies / Assumptions
- `intent-space` can add a second append-only persistence surface without violating its generic role.
- Existing auth/session context and request handling stages are sufficient to emit meaningful lifecycle records without inventing a second protocol family.
- Academy, Headwaters, and evaluation tooling can consume generic monitoring records and derive higher-level judgments outside `intent-space`.
- Existing or planned product logic that has used `onStoredMessage` as an integration seam can be kept separate from the monitoring design rather than expanded into a shared callback-centric architecture.
- The current product understanding is that this workflow is not collecting materially sensitive user data, so v1 can default to rich record capture. Failure isolation still needs planning attention even without strong data-minimization constraints.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] What lifecycle taxonomy should the monitoring table use so full request flows can be reconstructed without turning into ad hoc log strings?
- [Affects R2][Technical] Which events should be emitted before versus after response send or persistence boundaries so timing and outcomes stay unambiguous?
- [Affects R5][Technical] What canonical identifiers should link related lifecycle records for the same client connection, auth session, and attempted action?
- [Affects R8][Technical] What write-failure strategy preserves space safety while making dropped or degraded monitoring observable?
- [Affects R10][Technical] What operator-facing query surface is sufficient for v1: direct SQLite access, internal APIs, CLI tooling, or a small read helper?
- [Affects R11][Needs research] What derived views do Academy, Headwaters, and the dojo evaluation harness most need first so the base schema is shaped well without embedding their policies?
- [Affects R7][Technical] What migration or coexistence rules should apply where existing product code already uses `onStoredMessage`, so monitoring remains purely observational?

## Next Steps
→ /prompts:ce-plan for structured implementation planning
