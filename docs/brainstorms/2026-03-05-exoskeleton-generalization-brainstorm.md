# Exoskeleton Generalization: Self-Modifying Loop → Any Repo

**Date:** 2026-03-05
**Status:** Draft

## What We're Building

The agent loop today guards its own source code. We need it to wrap **any** repo as an adaptive exoskeleton, while keeping self-modification as a valid mode (dogfooding).

The generalization: the agent becomes a standalone process that can target any git repository. "Target = self" is just one configuration. The exoskeleton owns the full lifecycle — checkout, build, deploy, observe, adapt — as a unit.

## Why This Approach

### Promise Theory Alignment

Research into real Promise Theory implementations (CFEngine, Kubernetes controllers, Cisco ACI/OpFlex, Kratix) confirms a consistent pattern:

- **Centralized medium, decentralized execution.** A shared communication channel (policy server, etcd, our SQLite log) is not an imposition — it's the observation medium. Agents voluntarily poll it and autonomously decide what to act on.
- **Scoping is the observer's responsibility.** CFEngine distributes the full policy to every agent; each agent locally evaluates what applies using "class" guards. We should do the same: agents see all intents, self-select based on their own context.
- **Multiple agents can promise on the same intent.** The promisee (human) decides which to accept. This is pure Promise Theory — voluntary offers, cooperative binding through ACCEPT.

### Design Principles

1. **Agent autonomy preserved.** No routing, no assignment. Agents self-select intents.
2. **Self-modification as special case.** When target = self, restart after commit (code changed). When target = external, stay alive and loop back.
3. **Auto-detect, then persist.** The agent infers the project's nature on first contact. That understanding persists as a living intent document — the project's self-description — and evolves over time.
4. **Exoskeleton as unit.** The wrapper owns checkout → build → deploy → observe → adapt. Where builds run and where deploys go are configurable per project.

## Key Decisions

### 1. One Supervisor, N Agents

The supervisor evolves from a single-agent babysitter into a multi-agent orchestrator. One supervisor process manages N agent child processes, each targeting a different repo.

- Self-modifying agent: restart after commit (binary changed)
- External repo agent: commit, build, deploy, loop back to observe (no restart needed)

### 2. Shared Promise Log, Agent Self-Selection

One shared promise log (the communication channel). All agents observe all intents. Each agent autonomously decides whether to promise based on its own understanding of its target repo.

This follows the CFEngine pattern: distribute everything, filter locally. Pre-routing intents would be an imposition.

### 3. Intent as Declaration, Promise as Autonomous Commitment

**Derived from Promise Theory first principles:** An agent can only promise its own behavior. An intent is not a task to be claimed — it's a permanent declaration in the shared space.

Current design flaw: INTENT and PROMISE share the same `promiseId` and state row, treating the intent as a task that gets "claimed" when an agent promises. This is an imposition pattern — it prevents multiple agents from responding.

Corrected model:
- **INTENT** is a declaration. It lives in the log permanently. It has no state machine. It is never consumed or transitioned.
- **PROMISE** is an autonomous commitment by a specific agent. It creates its own entity (new `promiseId`, `parentId` = intent) with its own state machine: PROMISED → ACCEPTED → COMPLETED → FULFILLED/BROKEN.
- Multiple agents can each create their own PROMISE referencing the same INTENT.
- The human observes all promises and ACCEPTs the one(s) they choose.
- Unaccepted promises get RELEASED or simply age out.

This mirrors the existing REVISE pattern (which already creates a new `promiseId` with a `parentId`) and aligns with how CFEngine and Kubernetes handle the declaration/convergence split.

```
INTENT abc-123  "add a health check endpoint"     ← declaration, no state machine
  ├─ PROMISE def-456 by agent-api                 ← autonomous commitment
  │    state: PROMISED → ACCEPTED → COMPLETED → FULFILLED
  ├─ PROMISE ghi-789 by agent-web                 ← autonomous commitment
  │    state: PROMISED → RELEASED (human picked agent-api)
  └─ DECLINE by agent-self                        ← autonomous refusal
       "not relevant to my codebase"
```

### 4. Project Understanding as Living Intent Document

The agent auto-detects the target project on first contact and persists this as a **project intent document** in the target repo at `.differ/intent.md` (or similar).

This document is:
- The agent's "class context" for evaluating whether intents apply to it (CFEngine's class guards)
- Crash/restart resilient — agent rehydrates from this document instead of re-inferring
- Evolving — updates as the project changes over time
- Versioned with the project source (lives in the repo)
- The embryo of the intent graph from the design docs

### 5. Registration via CLI

Projects are registered explicitly: `differ add /path/to/repo`. The supervisor reads a registry of known projects and spawns an agent for each.

### 6. Cross-Agent Cooperation

When an agent working on an external repo needs the loop itself to improve, it posts an INTENT to the shared log. The self-modifying agent (wrapping the loop repo) picks it up through normal observation and self-selects. Pure Promise Theory — agents cooperating through the shared medium, no special channels.

### 7. Lifecycle Modes

| Mode | After Commit | Why |
|------|-------------|-----|
| Self-modifying | Exit 0 → supervisor rebuilds, restarts | Agent changed its own code |
| External repo | Commit → build → deploy → loop back to observe | Agent code unchanged, only target changed |

### 8. Decoupling Points

Current hardcoded couplings and how they resolve:

| Coupling | Current | Generalized |
|----------|---------|-------------|
| Promise log path | `~/.differ/loop/promise-log.db` | Shared across all agents |
| Build pipeline | `bun build src/loop/agent.ts` | Per-project, derived from intent document |
| Commit prefix | `"loop: ${intentContent}"` | Derived from project name |
| LLM prompts | "self-modifying agent loop" | Generated from project intent document |
| Scope checks | TypeScript-only regex | Derived from project language/constraints |
| PID file | Single `supervisor.pid` | One supervisor, manages N agent processes |
| System prompt in work.ts | "self-modifying coding agent on TypeScript" | Generated from project context |

## Architecture Sketch

```
                    ┌─────────────────────────────────┐
                    │          Supervisor              │
                    │   (one process, N agents)        │
                    └──────┬──────────┬───────────┬────┘
                           │          │           │
                    ┌──────▼──┐ ┌─────▼───┐ ┌─────▼───┐
                    │ Agent A │ │ Agent B │ │ Agent C │
                    │ (self)  │ │ (api)   │ │ (web)   │
                    └────┬────┘ └────┬────┘ └────┬────┘
                         │          │           │
                         ▼          ▼           ▼
                    ┌─────────────────────────────────┐
                    │     Shared Promise Log           │
                    │  (intents = declarations)        │
                    │  (promises = agent commitments)  │
                    └─────────────────────────────────┘
                                    ▲
                                    │
                              ┌─────┴─────┐
                              │  Human    │
                              │  (CLI)    │
                              └───────────┘

Each agent:
  1. Observes ALL intents in the shared log
  2. Evaluates against its project intent document (class context)
  3. Promises on intents it can handle, declines others
  4. Multiple agents can promise on the same intent
  5. Human ACCEPTs one, others are RELEASED
  6. On ACCEPT: does work, commits to its target repo
  7. Self-mode: exit for restart. External-mode: loop back.
```

### 9. Build/Deploy as Intents

Build and deploy are not hardcoded pipeline steps — they're intents that flow through the same protocol.

- **Local build**: sensible defaults, auto-detected from project type (package.json → `npm run build`, Cargo.toml → `cargo build`). The local exoskeleton handles this.
- **Deploy/publish is an INTENT**: "deploy this to Render" is an intent the local agent cannot fulfill. It posts it to the shared space. A hosting agent (Differ's platform, a Render-connected agent, etc.) promises to fulfill it.
- **Distribution targets are chosen at onboarding**: when registering a project, the user specifies what kinds of distribution they want — deploy to Vercel, publish source for collaboration, push to npm, etc. These shape which agents can help.

The same protocol handles code changes, build, deployment, and publishing. It's all intents and promises. The local exoskeleton knows its own limits and delegates what it can't do.

### 10. Agent Identity

UUID-based for now. Each agent gets a random UUID at registration as its `sender_id`. Smarter identity (cryptographic, reputation-bearing, capability-advertising) comes later as the network grows.

### 11. Schema Migration

Clean break. New schema, new DB. The old `promise-log.db` is archived. The loop is young enough that there's no meaningful history to preserve. No backward compatibility needed.

## Resolved Questions

All open questions from the brainstorm have been resolved through discussion. See decisions 1-11 above.

## Open Questions

1. **Intent document format.** What does the persistent project intent document look like? Structure, schema, how it evolves. (Deferred to planning phase.)

2. **Capability advertisement.** Should agents publish give-promises about their capabilities at startup, making their scope visible to humans? (Suggested by Promise Theory research — CFEngine agents implicitly advertise through class membership.)
