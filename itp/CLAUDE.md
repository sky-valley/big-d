# ITP — Intent Transfer Protocol

Shared types and protocol for the Differ system. Defines the wire format for Promise Theory coordination between agents, intent spaces, and human operators.

## Contents

| File | Description |
|------|-------------|
| `src/types.ts` | ITP message types, promise states, payload interfaces, meta-protocol types |
| `src/protocol.ts` | State machine, factory functions (createIntent, createPromise, etc.), promise record management |

## Conventions

- `.ts` extension on all imports
- No runtime dependencies — types and pure functions only (uses Node built-in `crypto.randomUUID`)
- This package is consumed by `loop/` and `intent-space/` via `file:../itp`
