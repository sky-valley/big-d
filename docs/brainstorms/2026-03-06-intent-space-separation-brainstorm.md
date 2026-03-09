---
title: Separate Intent Space Into Its Own Component
type: feat
status: active
date: 2026-03-06
---

# Separate Intent Space Into Its Own Component

## What We're Building

A standalone **intent space process** that owns the intent log as an independent component, communicating via ITP over a unix domain socket. This is the first step toward a fully separated architecture where the intent space (body of desire) and promise log (body of commitment) are distinct autonomous components, as Promise Theory prescribes.

**This iteration**: Build and test the intent space process standalone. No integration with CLI or agents yet — prove the component works in isolation.

**Future**: Wire CLI and agents to post/observe intents via the socket instead of PromiseLog. Eventually expose as a public TCP service.

## Why This Approach

**Promise Theory alignment**: The intent space and promise space are conceptually distinct. Today they're entangled in a single `PromiseLog` class with cross-table queries (e.g., `getOpenIntents()` joins intents with promises to filter fulfilled ones). Separating them enforces clean boundaries.

**Practical motivation**: We want the intent space to eventually be a shared service — multiple loops, a web UI, external systems all posting intents to the same space. That requires process-level separation, not just class-level.

**ITP-native transport**: The intent space speaks ITP over the socket, not HTTP. Messages are `ITPMessage` objects serialized as NDJSON. This means agents connect as ITP peers, not HTTP clients. When we later expose this publicly, we swap the unix socket for a TCP socket — same protocol, different transport.

## Key Decisions

1. **Transport**: Unix domain socket with NDJSON framing (one `ITPMessage` JSON per line, `\n` delimited)
   - **Future note**: When binary payloads are needed, switch to length-prefixed framing (4-byte length header + payload). NDJSON is text-only. Document this as a known migration point.

2. **Persistence**: SQLite (own DB file, separate from promise-log.db)

3. **Intents are always open**: The intent space is a pure append-only declaration log. It never "closes" intents — it doesn't know about promises or fulfillment. Agents are responsible for filtering intents they've already acted on. This is the most Promise Theory aligned approach.

4. **Scope**: Standalone component only. No integration with existing CLI/agents in this iteration.

5. **Multiple clients**: Unix domain socket supports multiple concurrent connections. Multiple agents can connect and observe the same intent space simultaneously.

## Architecture

```
                    Unix Domain Socket
                    (~/.differ/loop/intent-space.sock)
                           |
                    +------+------+
                    | Intent Space |
                    |   Process    |
                    +------+------+
                           |
                    +------+------+
                    | SQLite DB   |
                    | (intents    |
                    |  only)      |
                    +---------+---+
```

**Messages the intent space handles:**
- `INTENT` — accepts and persists. Broadcasts to all connected clients.
- Query: list all intents (with optional filters like sender, timestamp range)

**Messages the intent space does NOT handle:**
- `PROMISE`, `ACCEPT`, `COMPLETE`, `ASSESS`, `REVISE`, `RELEASE`, `DECLINE` — these belong to the promise log.

## Open Questions

*None — all resolved during brainstorm.*

## Resolved Questions

- **IPC mechanism?** → Unix domain socket (works with multiple local agents, upgradeable to TCP for public service)
- **Wire format?** → NDJSON for now. Switch to length-prefixed when binary payloads arrive.
- **Open/closed semantics?** → Intents are always open. Pure declaration log. Agents filter themselves.
- **Persistence?** → SQLite, own DB file
- **Integration scope?** → Standalone only, no wiring into CLI/agents yet
- **Protocol?** → ITP-native, not HTTP. Same ITPMessage types over the socket.
