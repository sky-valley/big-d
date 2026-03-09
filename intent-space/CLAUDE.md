# Intent Space

Standalone server for intent declaration and observation. A Promise Theory participant that persists intents, scopes them by containment (fractal sub-spaces), and serves history to those who ask.

See [INTENT-SPACE.md](INTENT-SPACE.md) for the full abstraction, wire protocol, and invariants.

## Architecture

The intent space is an autonomous agent. On startup it declares its own capabilities as ITP INTENT messages (using its own protocol), then accepts client connections over a Unix domain socket speaking NDJSON.

| File | Role |
|------|------|
| `src/space.ts` | Server: connection handling, intent echo, scan dispatch |
| `src/store.ts` | SQLite persistence (intents table with parentId + seq) |
| `src/client.ts` | Client library (EventEmitter, scan methods, cursor tracking) |
| `src/types.ts` | Wire protocol types (ITP INTENT + SCAN/SCAN_RESULT) |
| `src/service-intents.ts` | Self-description via service intents |
| `src/main.ts` | Entry point |

## Quick Start

```bash
npm install
npm start                 # Listen on ~/.differ/loop/intent-space.sock
npm test                  # Run tests (no LLM calls)
```

## Wire Protocol

Two message families on the wire:

1. **ITP INTENT messages** — semantic content, persisted, echoed to all connected clients
2. **SCAN queries** — private reads, client-to-space only, not persisted

On connect, the space sends its service intents as ITP INTENT messages. Clients catch up via SCAN:

```
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", intents: [...], latestSeq: 42 }
```

New intents are posted as ITP INTENT messages and echoed back with their assigned `seq`.

The space only handles INTENT and SCAN. Promise messages (PROMISE, ACCEPT, COMPLETE, ASSESS) belong to the promise log — they do not flow through the space.

## Conventions

- `.ts` extension on all imports
- `@differ/itp` for shared ITP types (via `file:../itp`)
- SQLite WAL mode, `PRAGMA busy_timeout = 5000`
- Service intents have deterministic IDs (`intent-space:persist`, etc.)
- No auto-reconnect in the client — caller's responsibility
- `parentId` scopes intents into fractal sub-spaces (default: `"root"`)

## Test Gaps

Pending negative/stress tests (not yet implemented):

- Client disconnects mid-write — server survival
- Server stops — client disconnect event + graceful degradation
- Concurrent posts from N clients — ordering, no lost intents
- Large payload — 1MB line limit enforcement
- Malformed JSON — ERROR response
- Empty content — is `""` a valid intent?
- Scan on nonexistent spaceId — should return empty, not error
- Rapid reconnects — stale socket detection under race
