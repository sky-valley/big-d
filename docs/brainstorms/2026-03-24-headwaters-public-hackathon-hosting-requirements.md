---
date: 2026-03-24
topic: headwaters-public-hackathon-hosting
---

# Headwaters Public Hackathon Hosting

## Problem Frame
Headwaters now works as a strong local and hobby instance, but it is not yet a credible public internet-facing service. The immediate goal is not “production-grade multi-tenant infrastructure.” It is a hackathon-grade public deployment that can run on one medium droplet, survive bursty use, and fail cleanly instead of mysteriously.

The main mismatch is the current hosting model for spawned spaces. Right now, each spawned space is treated too much like its own permanently live runtime. That may be tolerable locally, but it does not provide an honest path to running roughly 100 spawned spaces on one box. At the same time, the public deployment cannot solve this by abandoning promise-native semantics or turning dedicated spaces into fake subspaces of one big station.

The first public cut therefore needs to clarify what “dedicated space” really means operationally, define a measured capacity envelope, add basic recovery and operator visibility, and keep the public service promise-native.

## Requirements
- R1. Headwaters must support a first public deployment as a single internet-facing service on one medium droplet.
- R2. The first public cut should target roughly up to 100 spawned spaces on that one host, subject to measured capacity limits.
- R3. A dedicated spawned space must continue to mean dedicated identity, auth boundary, and persisted state, even if it does not map to one permanently running OS/runtime process.
- R4. The public-host runtime model must optimize for survival under bursty usage rather than for a one-process-per-space mapping.
- R5. The service must remain promise-native in its control-plane behavior; public hosting changes must not replace steward-based promise flows with hidden imperative shortcuts.
- R6. Headwaters must refuse new provisioning cleanly when the host is near capacity rather than degrading into opaque failures.
- R7. Existing active spaces should remain usable when new provisioning is being refused due to capacity pressure.
- R8. Hosted spaces must survive ordinary host restart through explicit recovery from persisted state.
- R9. Capacity policy must be based on both:
  - a configured hard ceiling for hosted spaces
  - live host-pressure signals
- R10. The initial hard ceiling and operating envelope must be measured on the intended medium droplet class rather than guessed.
- R11. The first public product promise should remain general hosted spaces, not be narrowed to inboxes-only for launch.
- R12. User-facing behavior should stay clean; host limits may be operator-visible by default, but the service should not frame itself to users primarily as an infrastructure experiment.
- R13. The first public cut must include enough deployment and operations material to bootstrap the host, verify the public endpoints, and inspect whether the service is healthy before sharing it.
- R14. The public pack and onboarding surface must remain usable for fresh external agents after the hosting-model change.

## Success Criteria
- A single medium droplet can host the public Headwaters service without uncontrolled per-space runtime explosion.
- Provisioning refusal at capacity is explicit and legible rather than appearing as crashes, hangs, or transport flakiness.
- Existing provisioned spaces continue working when new-space creation is refused due to capacity.
- A host restart does not silently lose provisioned spaces.
- The operator can bootstrap, smoke-test, and inspect the service with a clear runbook.
- External agents can still sign up, provision spaces, and participate without repo-local help.
- The resulting public service still reads as promise-native rather than as an admin system disguised as chat.

## Scope Boundaries
- This does not require a horizontally scalable or multi-region architecture.
- This does not require ultra-hardened production security or SRE-grade observability.
- This does not require a permanent-process-per-space model.
- This does not require exposing host-capacity details prominently to end users before they hit a service limit.
- This does not require inventing a second protocol family beyond the current HTTP onboarding + ITP participation split.

## Key Decisions
- Single-host hackathon target: the first public deployment is intentionally one medium droplet, not a horizontally scaled platform.
- Dedicated semantics over dedicated processes: the important dedication is identity/auth/persisted state, not one permanent process per space.
- Burst survival over process purity: the service should prioritize staying alive under public usage rather than preserving the simplest local runtime mapping.
- Clean refusal at capacity: capacity pressure should cause explicit refusal of new provisioning rather than best-effort collapse.
- Restart recovery is mandatory: even a hackathon service needs restart trust.
- General hosted-space promise: the public product should still be “managed intent spaces as a service,” not an inbox-only compromise.
- Measure, do not guess: the max-space ceiling must come from benchmarking the target droplet class.

## Dependencies / Assumptions
- The current Headwaters architecture can be refactored so multiple dedicated spaces share a host runtime model without becoming fake subspaces.
- The steward and current promise-native provisioning flow can remain intact while the hosting internals change.
- A medium droplet should be sufficient for the hackathon target if the host model is changed and capacity limits are enforced honestly.

## Outstanding Questions

### Deferred to Planning
- [Affects R3][Technical] What exact host-runtime cut best preserves “dedicated space” semantics: one multi-space host runtime, a Headwaters-specific space host layer beneath `IntentSpace`, or another equivalent shape?
- [Affects R8][Technical] What durable metadata beyond current `space.json` is required for restart recovery, cleanup, and host/runtime reconstruction?
- [Affects R9][Technical] Which host-pressure signals should actually drive refusal in the first cut: memory, CPU/load, file descriptors, open listeners, concurrent connections, or some smaller subset?
- [Affects R10][Needs research] What exact medium droplet class should be the benchmark target for the initial public deployment?
- [Affects R13][Technical] Which deployment artifacts should be shared with academy conventions and which should be Headwaters-specific?

## Next Steps
→ /ce:plan for structured implementation planning
