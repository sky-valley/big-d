---
title: Promise Theory Implementation Patterns from Real-World Systems
date: 2026-03-05
category: architecture-decisions
tags:
  - promise-theory
  - coordination
  - multi-agent
  - decentralized-execution
  - intent-modeling
  - cfengine
  - kubernetes
  - kratix
component: differ-loop-core
severity: high
symptoms: |
  Agent scoped to single repository. Need to generalize coordination
  model to support multiple agents and multiple repositories while
  maintaining Promise Theory semantics. Unclear how real-world systems
  implement promise filtering, multi-agent commitment, and the
  intent vs. promise distinction.
resolution_type: architecture-decision
systems_studied:
  - CFEngine (class system, persistent policy)
  - Kubernetes (controllers, reconciliation loops)
  - Cisco ACI/OpFlex (intent-driven networking)
  - Kratix (platform engineering promises)
---

# Promise Theory Implementation Patterns from Real-World Systems

How CFEngine, Kubernetes, Cisco ACI, and Kratix implement Promise Theory in practice, and what that means for Differ's multi-agent, multi-repo generalization.

## Context

Differ's self-modifying agent loop uses Promise Theory for coordination. As we generalize from "agent guards its own repo" to "agent wraps any repo as an exoskeleton," we needed to understand how real-world systems solve:

1. How agents discover and filter relevant promises (scoping)
2. Whether a shared message log is consistent with the theory
3. How multiple agents handle the same intent
4. How to model the relationship between intents and promises

## Research Findings

### CFEngine: The Original Implementation

CFEngine (Mark Burgess, the creator of Promise Theory) uses a **client-pull model**. Key patterns:

- **Distribute everything, filter locally.** Every agent receives the full policy corpus from a central server. Scoping happens at evaluation time through "classes" (context guards), not at distribution.
- **Hard classes** are auto-detected (OS, hostname, architecture, time of day). **Soft classes** are set dynamically by policy evaluation.
- **Agent-per-host model.** No inter-agent negotiation. Each agent independently evaluates the same policy and acts on what is locally relevant.
- **Convergent operation.** Agents run on a schedule (default 5 min), evaluate promises, converge toward declared state. Idempotent.

The critical design choice: **scoping is the observer's responsibility.** The policy server doesn't decide what's relevant to each agent. Each agent decides for itself.

### Kubernetes Through the Promise Theory Lens

Kubernetes was not explicitly built on Promise Theory, but the mapping is precise:

| Promise Theory | Kubernetes |
|---------------|------------|
| Intent (declaration of desired outcome) | Desired state in resource manifest |
| Promise (+b give) | Controller watching a resource type |
| Assessment | Reconciliation check (desired vs actual) |
| Convergence | Reconciliation loop corrections |
| Agent autonomy | Controller independence, crash recovery |
| Shared medium | etcd / API server |

Key insight: multiple controllers can act on the same resource (different concerns). They don't compete — they independently observe and converge.

### Cisco ACI/OpFlex

The most explicit industrial adoption of Promise Theory outside CFEngine:

- APIC distributes abstract policy via OpFlex to autonomous network devices
- "ACI doesn't configure network elements; it communicates policy information to them and lets them configure themselves"
- Policy is shared as intent, not as commands — the promise/imposition distinction in action

### Kratix (Kubernetes-native)

Explicitly names its core abstraction "Promise":

- A Kratix Promise is a YAML document defining a contract between a platform team and its users
- Platform teams make give-promises about capabilities; users make use-promises by requesting resources through the CRD API
- Destination selectors (`matchLabels`) determine where resources are scheduled

## Architectural Decisions for Differ

### 1. Intent as Declaration, Not Task

**Problem:** Current implementation treats INTENT and PROMISE as the same entity (shared `promiseId`), creating an imposition pattern where the intent gets "claimed."

**Finding:** CFEngine and Kubernetes both separate declaration from commitment. CFEngine distributes full policy; Kubernetes controllers create their own resources (ReplicaSet, Pods) in response to declarations (Deployment).

**Decision:**
- **INTENT** is a permanent declaration with no state machine. Never consumed or transitioned.
- **PROMISE** is an autonomous commitment by a specific agent — its own entity (new `promiseId`, `parentId` = intent) with its own state machine: PROMISED -> ACCEPTED -> COMPLETED -> FULFILLED/BROKEN.
- Multiple agents can independently promise on the same intent. Human ACCEPTs one.

```
INTENT abc-123  "add a health check"     <- declaration, permanent
  |-- PROMISE def-456 by agent-api       <- autonomous commitment
  |     state: PROMISED -> ACCEPTED -> COMPLETED -> FULFILLED
  |-- PROMISE ghi-789 by agent-web       <- autonomous commitment
  |     state: PROMISED -> RELEASED
  +-- DECLINE by agent-self              <- autonomous refusal
```

### 2. Shared Log = Communication Channel, Not Command Authority

**Problem:** Centralizing the promise log risks creating hierarchical control.

**Finding:** Every major implementation uses a centralized medium: CFEngine's policy server, Kubernetes' etcd, Cisco ACI's APIC. The key distinction: agents voluntarily poll and autonomously decide. The medium is the observation channel, not the control authority.

**Decision:** The SQLite promise log is the shared observation medium. Agents poll it voluntarily. The agent's DECLINE capability is the essential autonomy mechanism. An agent refusing work is the protocol working correctly.

### 3. Scoping is the Observer's Responsibility

**Problem:** Pre-routing intents to specific agents based on central configuration would impose coupling.

**Finding:** CFEngine's class system: distribute everything, filter locally. Hard classes auto-detected, soft classes dynamic. Each agent independently evaluates whether policy applies.

**Decision:**
- All agents see all intents in the shared log (no filtering at the log level)
- Each agent has a project intent document (equivalent to CFEngine soft classes) defining its scope
- The agent self-selects: scope check + viability check before promising
- No central router. Pre-routing would be an imposition.

### 4. Build/Deploy as Intents

**Finding:** Kubernetes treats deployment as resource reconciliation — same protocol as any other intent. Kratix extends this to platform capabilities.

**Decision:**
- Build: sensible defaults auto-detected from project type (`npm run build` for Node, `cargo build` for Rust)
- Deploy/publish are intents that flow through the same protocol. Local agent can't deploy to Render? It posts an INTENT. A hosting agent promises to fulfill it.
- Same protocol handles code changes, build, deployment, and publishing

### 5. Cross-Agent Cooperation Through the Shared Medium

**Finding:** All distributed systems handle self-modification through the same medium they use for regular work. Kubernetes controllers modify resources that trigger other controllers.

**Decision:** When an agent discovers a limitation, it posts an INTENT to the shared log. The self-modifying agent picks it up through normal observation. Pure cooperation, no special channels, no service discovery.

## Principles Summary

| Principle | Pattern | Source |
|-----------|---------|--------|
| Autonomy | Agent decides whether to promise; DECLINE is success | CFEngine, all |
| Observation, not control | Shared log is communication channel | CFEngine, K8s, ACI |
| Context filtering | Each agent knows its scope; all intents visible | CFEngine classes |
| Symmetry | Build, deploy, modify: all intents | K8s reconciliation |
| Self-reference | Improvements to the loop are intents too | K8s controller pattern |

## Anti-Patterns to Avoid

### Task Claiming (Imposition Pattern)
Treating INTENT as a consumable task that transitions state when an agent "claims" it. The current schema does this — INTENT and PROMISE share a `promiseId`. Fix: separate entities.

### Centralized Agent Assignment (Router Pattern)
A supervising process deciding which agent handles which intent. This breaks autonomy. Agents must self-select from the full intent space.

### Deliberation Bypass
Agents promising without evaluating feasibility. Every PROMISE must be preceded by scope check (deterministic) and viability check (LLM-assisted). DECLINE with reason if either fails.

### Self-Generated Intent Loops
Agent processing its own auto-generated intents, creating cycles. Filter agent-generated intents in the observe loop. Cross-agent cooperation intents are an exception, but must be clearly typed.

### Scope Creep Through Emergent Capability
As the agent gains self-modification ability, it might circumvent deliberation checks. Keep scope definitions explicit, version-controlled, and requiring human approval to change.

## Implementation Guidelines

### When to Use the Shared Log

**Use the log for:** All promises and commitments, state changes, intent declarations, cross-agent cooperation, human gates (ACCEPT, ASSESS).

**Direct communication only for:** Agent-to-supervisor signals (exit codes, PID files), agent-to-LLM queries (internal to work phase), agent-to-git operations (git history is the record).

**Rule:** If an agent can act without logging, you've lost the ability to audit and revoke.

### Schema Design Principles

1. **Immutability of intent.** INTENT records never modified or deleted. Revisions create new INTENTs linked via parentId.
2. **Traceability via parentId.** PROMISE references INTENT. REVISE references PROMISE. The message graph forms a DAG.
3. **Materialized state for performance.** `promise_state` table summarizes latest state; `messages` table is the source of truth.
4. **Metadata in payload.** Store deliberation trace, cost, filesChanged, summary as JSON for flexibility.

### Evolving the Protocol

- New message types: add to TRANSITIONS, types, factory functions. Agents must ignore unknown types.
- New states: update PromiseState, TRANSITIONS, TERMINAL_STATES. Old agents skip unknown states.
- New payload fields: add as optional. Never remove or rename existing fields.
- Scope expansion: add OUT_OF_SCOPE_PATTERNS with documented reasons. Test against historical intents.

## Related Documents

- [Exoskeleton Generalization Brainstorm](../../brainstorms/2026-03-05-exoskeleton-generalization-brainstorm.md) — Design decisions applying these findings
- [Self-Modifying Agent Loop Architecture](self-modifying-agent-loop-promise-theory.md) — Original architecture with six bugs and lessons learned
- [PLAN.md](../../loop/PLAN.md) — Foundation plan grounded in Promise Theory (polarity, cooperative binding, assessment)
- [src/itp/types.ts](../../loop/src/itp/types.ts) — ITP message types and promise states
- [src/itp/protocol.ts](../../loop/src/itp/protocol.ts) — State machine and factory functions

## References

- Mark Burgess, *Thinking in Promises: Designing Systems for Cooperation* (2015, O'Reilly) — Ch 1 (agent autonomy), Ch 3 (polarity, cooperative binding), Ch 5 (assessment), Ch 17 (CFEngine)
- [CFEngine Promises Documentation](https://docs.cfengine.com/docs/3.26/reference-language-concepts-promises.html)
- [CFEngine Classes Documentation](https://docs.cfengine.com/docs/3.26/reference-promise-types-classes.html)
- [Kubernetes Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubernetes: The Promise Engine](https://mioi.io/blog/posts/kubernetes-the-promise-engine/)
- [Cisco OpFlex Introduction](https://blogs.cisco.com/datacenter/introducing-opflex-a-new-standards-based-protocol-for-application-centric-infrastructure)
- [Kratix Promise Reference](https://docs.kratix.io/main/reference/promises/intro)
- [Promise Theory FAQ (Mark Burgess)](http://markburgess.org/promiseFAQ.html)
