# Intent Space

Standalone server for intent declaration and observation. A Promise Theory participant that persists intents, scopes them by containment (fractal sub-spaces), serves history to those who ask, and may carry projected promise events for visibility.

See [INTENT-SPACE.md](INTENT-SPACE.md) for the full abstraction, wire protocol, and invariants.

## Architecture

The intent space is an autonomous agent. On startup it declares its own capabilities as ITP INTENT messages (using its own protocol), then accepts client connections over a Unix domain socket and optionally over TCP/TLS speaking NDJSON.

| File | Role |
|------|------|
| `src/space.ts` | Server: connection handling, message echo, scan dispatch, Unix/TCP/TLS listeners |
| `src/store.ts` | SQLite persistence (append-only messages table with parentId + seq) |
| `src/client.ts` | Client library (Unix socket, TCP, or TLS; EventEmitter, generic message + intent events, scan methods, cursor tracking) |
| `src/types.ts` | Wire protocol types (ITP messages + SCAN/SCAN_RESULT) |
| `src/service-intents.ts` | Self-description via service intents |
| `src/main.ts` | Entry point |

## Quick Start

```bash
npm install
npm start                 # Listen on ~/.differ/intent-space/intent-space.sock
npm test                  # Run tests (no LLM calls)
```

Remote transport can be enabled with:

- `INTENT_SPACE_PORT` for plain TCP
- `INTENT_SPACE_TLS_PORT` plus `INTENT_SPACE_TLS_CERT` and `INTENT_SPACE_TLS_KEY` for TLS

## Wire Protocol

Two message families on the wire:

1. **ITP messages** — intents plus optional projected promise events, persisted, echoed to all connected clients
2. **SCAN queries** — private reads, client-to-space only, not persisted

On connect, the space sends its service intents as ITP INTENT messages. Clients catch up via SCAN:

```
→ SCAN { spaceId: "root", since: 0 }
← SCAN_RESULT { spaceId: "root", messages: [...], latestSeq: 42 }
```

New intents are posted as ITP INTENT messages and echoed back with their assigned `seq`. Projected promise events may also be stored and echoed for visibility inside intent subspaces.

The space is not authoritative for promise logic. It may carry projections, but lifecycle interpretation still belongs to the promise log.

## Conventions

- `.ts` extension on all imports
- `@differ/itp` for shared ITP types (via `file:../itp`)
- SQLite WAL mode, `PRAGMA busy_timeout = 5000`
- Service intents have deterministic IDs (`intent-space:persist`, etc.)
- No auto-reconnect in the client — caller's responsibility
- `parentId` scopes messages into fractal sub-spaces (default: `"root"`)
- New transports must preserve the same observe-before-act gate as Unix socket clients

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
