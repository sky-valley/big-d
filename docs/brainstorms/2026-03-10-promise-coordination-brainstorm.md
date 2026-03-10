# Promise Coordination: Where Promises Live

**Date:** 2026-03-10
**Status:** Draft

## What We're Building

A coordination model for promises in Differ. The intent space handles desire — where agents declare what they want. Now we need to decide how and where promises (voluntary commitments) take place, how they connect to the intent space, and how agents working on them coordinate.

## Why This Approach

Every real implementation of promise theory converges on the same architecture:

| System | Desired state | Promise evaluation | Outcome reporting |
|--------|--------------|-------------------|-------------------|
| **CFEngine** | Policy hub distributes `.cf` files | Local `cf-agent` evaluates autonomously | `cf-hub` pulls reports from agents |
| **Cisco ACI** | APIC declares policy via OpFlex | Switches render promises locally | Faults raised locally, visible centrally |
| **Kubernetes** | API server holds manifests | Controllers reconcile locally | Controllers write status back to API server |

The pattern: **desire is published centrally, promises are local, outcomes are reported back.** Nobody built a separate "promise server." The center distributes desire and collects outcomes. The agent owns its own commitment state.

CFEngine's hub is instructive: the policy hub and reporting hub are the **same machine, same process, two roles**. Policy flows out; reports flow in. They didn't build separate infrastructure for reporting.

## Key Decisions

### 1. Promise state stays local to the agent

The agent's local promise log (SQLite) is the authority on promise state. The state machine (PROMISED -> ACCEPTED -> COMPLETED -> FULFILLED) runs locally. This is non-negotiable per Promise Theory: the promisor is the authority on its own promises. Centralizing promise state would be an imposition — a server telling agents what they promised rather than agents telling you.

### 2. Promise events are published to the intent space

The intent space already distributes desire. It gains a second role: carrying commitment events for visibility. Like CFEngine's hub — one coordination point, two functions. The space echoes and stores promise events but never materializes promise state. It's a wire, not a brain.

The space stores events (append-only, sequenced) but never maintains a `promises` table or `current_state` column. A client that wants to know "what state is promise X in?" replays events through the state machine locally. The space only answers "what events have happened?"

### 3. Intents are subspaces — promise events are children

When an agent promises on an intent, the promise event is published as a child of that intent (`parentId = intentId`). The intent itself becomes a conversational subspace:

```
root/
  loop/                              <- project subspace
    intent-abc  "add /health"        <- intent (scannable as a subspace)
      PROMISE   (agent-1, plan)      <- parentId: intent-abc
      PROMISE   (agent-2, plan)      <- parentId: intent-abc
      ACCEPT    (human -> agent-1)   <- parentId: intent-abc
      COMPLETE  (agent-1, summary)   <- parentId: intent-abc
      ASSESS    (human, pass)        <- parentId: intent-abc
```

Scan `loop` -> see intents. Scan `intent-abc` -> see the full promise conversation. No new concepts — just the existing `parentId` containment applied recursively. This is a convention, not enforced by the space.

### 4. The space generalizes: accepts any message with a parentId

The space currently rejects non-INTENT messages. It should accept any message with a parentId — store it, assign a seq, echo it. The `type` field is part of the opaque payload. "Reads the address, not the letter."

The space's promise: *"Give me a message with a parentId, I'll store it, sequence it, and echo it to all connected clients."* Type-agnostic. Protocol-evolution-proof — adding new message types doesn't require deploying a new space.

The name stays "intent space." Intent is where it all starts; promise events live there as responses. The name tells the story of the system even if the space carries more than intents.

### 5. Local-first, echo-second (the general principle)

The data flow rule is actor-agnostic and type-agnostic:

1. **You originated it -> write local first, then echo to space**
2. **You received it from elsewhere -> write local after reception**

This applies identically to software agents and humans:

- An agent that creates a PROMISE writes to its local SQLite first, then publishes to the space.
- A CLI that posts an ACCEPT writes locally first (if co-located with the agent), then echoes to the space. Or if remote, the space IS the medium, and the receiving agent writes locally after reception.
- An agent that receives an ACCEPT from the space writes it to local SQLite after reception.

"Local" means different things depending on where you are. For the agent on the machine, local = SQLite. For a future web UI, local = the space itself (or browser storage). The rule is the same everywhere.

### 6. Graceful degradation

If the space is unreachable, agents continue operating from their local promise log. The CLI can fall back to writing directly to local SQLite (co-located case). When the space reconnects, events catch up. This mirrors CFEngine: "Thanks to the autonomous nature of CFEngine, systems will be continuously maintained even if the Server is down."

## Open Questions

- **Multi-agent self-release through the space:** Multiple agents can promise on the same intent. When one is accepted, others should self-release. Currently this is detected by polling the local promise log. With promise events flowing through the space, agents could observe each other's acceptance via the space connection — but the exact mechanism (echo-based vs. scan-based) needs design.

- **HMAC trust through a relay:** ACCEPT and ASSESS messages are HMAC-signed. If they flow through the space (a relay), the trust model doesn't change — the signature is end-to-end between human and agent, the space just carries it. But this should be validated.

- **Space store schema change:** The intent store currently has an `intents` table with intent-specific columns (`payload`, `parentId`, `senderId`, `seq`). Generalizing to accept any message type may require a more generic schema or a separate `messages` table alongside `intents`.

- **CLI connection model:** The CLI currently writes directly to the shared promise log (SQLite). In the new model, should the CLI also connect to the intent space to publish human events? Or does it stay local-only with the agent handling publication?

## References

- [CFEngine: How CFEngine Works](https://docs.cfengine.com/docs/lts/overview/how-cfengine-works/) — pull-based, local evaluation, autonomous agents
- [CFEngine Reporting Architecture](https://docs.cfengine.com/docs/3.18/enterprise-cfengine-guide-reporting-reporting-architecture.html) — cf-hub pulls reports from agents, same hub as policy server
- [Cisco ACI and Promise Theory](https://www.networkworld.com/article/926422/sdn-promise-theory-mark-burgess-cfengine-sdn-cisco-aci-apic-opflex.html) — OpFlex, declarative policy, autonomous switches
- [Mark Burgess: Promise Theory FAQ](http://markburgess.org/promiseFAQ.html) — "PT does little to formalize the promise bodies"
- [Promise Theory Wikipedia](https://en.wikipedia.org/wiki/Promise_theory) — general overview, applications beyond CFEngine
