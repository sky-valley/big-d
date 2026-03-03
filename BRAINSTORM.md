---
date: 2026-03-03
topic: self-modifying-agent-loop
---

# Self-Modifying Agent Loop

The foundation for Differ as a real system. A long-running agent that guards its own source code, modifies itself in response to intent, rebuilds, and restarts as the new version.

## What We're Building

Three components:

1. **Supervisor** — a tiny, never-changing process (~20 lines). Launches agent binaries, handles rollback on crash. The one fixed point in the system.
2. **Agent binary** — compiled from its own repo via `bun build --compile`. Watches the intent space, promises on intents, does work, rebuilds itself, exits for restart.
3. **`differ` CLI** — how humans post intents and participate in the promise protocol (accept, assess, release).

An **intent space** (local SQLite db) is shared state between the CLI and the agent. Promise protocol is enforced from day one — no imperative commands.

## The Loop

```
[supervisor launches binary]
       ↓
[agent boots, reads checkpoint + intent space]
       ↓
[scans for unpromised intents it can handle]
       ↓
[PROMISE → waits for ACCEPT]
       ↓
[does work — edits own source, black box for now]
       ↓
[COMPLETE → waits for ASSESS]
       ↓
  pass?─────────────── fail?
   ↓                     ↓
[bun build --compile]  [REVISE → new PROMISE → wait for ACCEPT → redo]
   ↓
[exit code 0]
   ↓
[supervisor launches new binary]
   ↓
[loop repeats]
```

## Promise Protocol (Full Formal Cycle)

```
human:  INTENT  "add health check endpoint"
agent:  PROMISE "I'll handle this"
human:  ACCEPT
agent:  [work happens]
agent:  COMPLETE "done — added /health route"
human:  ASSESS pass
agent:  [rebuild + restart]
human:  RELEASE (binding dissolved)
```

- Agent does NOT begin work until ACCEPT
- Agent does NOT rebuild/restart until ASSESS pass
- ASSESS fail → REVISE → new PROMISE → needs its own ACCEPT
- Two human gates per cycle: before work, after work

## Key Design Decisions

- **Stateless restart + checkpoint**: Agent boots cold from repo state. A checkpoint file captures "where was I" for continuity across restarts. The repo is primary state.
- **Promise-native from day one**: Agent observes intent space and voluntarily promises. No imperative dispatch. Even with one agent and one human, the protocol shape is correct.
- **Intent space as local SQLite**: Reuses existing better-sqlite3 stack. CLI writes, agent reads. Could become networked later without changing the protocol.
- **Bun standalone binary**: `bun build --compile` for fast compile, fast startup, single file output. Restart cycle under a second.
- **Supervisor handles rollback**: If new binary crashes (exit code 1), supervisor falls back to previous binary. Safety net for bad self-edits.
- **`doWork()` is a black box**: How the agent actually edits code is a separate design question. The loop framework doesn't depend on it.

## Open Questions (Deferred)

- How does the agent execute self-modification? (Claude API? Spawned subprocess? Code generation pipeline?)
- How does the agent decide which intents it can handle? (Capability declaration? Try everything?)
- Multiple agents observing the same intent space — coordination rules?
- Remote intent space (networked, multi-node) — when does local SQLite graduate?

## Next Steps

→ `/workflows:plan` to lay out implementation: supervisor, intent space schema, agent loop, CLI commands, build pipeline
