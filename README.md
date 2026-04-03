# Differ

A self-modifying agent system coordinated through
[Promise Theory](https://en.wikipedia.org/wiki/Promise_theory).

The repo now centers on four clear surfaces:

- [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space) — the spec home for the body of desire and the ITP carrier profile
- [`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station) — the runnable plain TCP/ITP reference implementation
- [`http-reference-station/`](/Users/noam/work/skyvalley/big-d/http-reference-station) — the runnable Welcome Mat-compatible HTTP reference implementation
- [`spacebase1/`](/Users/noam/work/skyvalley/big-d/spacebase1) — the hosted product surface for creating and claiming real spaces over HTTP

The [loop](/Users/noam/work/skyvalley/big-d/loop) remains the body of
commitment, where local promise authority lives.

## Architecture

Two bodies, separate by design:

- **Body of desire** — the
  [intent space](/Users/noam/work/skyvalley/big-d/intent-space)
- **Body of commitment** — the
  [promise log](/Users/noam/work/skyvalley/big-d/loop)

ITP connects them without collapsing them into one authority surface.

```text
human/agent  ──INTENT──→  intent space  ←──SCAN──  human/agent
                                           │
                                  visible PROMISE/COMPLETE/ASSESS acts
                                           │
                                           ▼
                               local promise authority / loop
```

## Main Directories

| Directory | Purpose |
|-----------|---------|
| [`itp/`](/Users/noam/work/skyvalley/big-d/itp) | Shared protocol vocabulary and helpers |
| [`intent-space/`](/Users/noam/work/skyvalley/big-d/intent-space) | Normative spec for semantics, wire framing, and auth doctrine |
| [`tcp-reference-station/`](/Users/noam/work/skyvalley/big-d/tcp-reference-station) | Runnable plain TCP/ITP reference station |
| [`http-reference-station/`](/Users/noam/work/skyvalley/big-d/http-reference-station) | Runnable Welcome Mat-compatible HTTP reference station |
| [`spacebase1/`](/Users/noam/work/skyvalley/big-d/spacebase1) | Hosted HTTP product for frictionless space creation and claim |
| [`loop/`](/Users/noam/work/skyvalley/big-d/loop) | Self-modifying agent loop and local promise authority |
| [`spaced/`](/Users/noam/work/skyvalley/big-d/spaced) | Companion daemon for reliable space participation |

## Start Here

For the spec:

- [`intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`intent-space/docs/itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
- [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)

For the runnable references:

- [`tcp-reference-station/README.md`](/Users/noam/work/skyvalley/big-d/tcp-reference-station/README.md)
- [`http-reference-station/README.md`](/Users/noam/work/skyvalley/big-d/http-reference-station/README.md)

For the hosted product:

- [`spacebase1/README.md`](/Users/noam/work/skyvalley/big-d/spacebase1/README.md)
- [`docs/architecture/spacebase1-product-flow-addendum.md`](/Users/noam/work/skyvalley/big-d/docs/architecture/spacebase1-product-flow-addendum.md)

For the loop architecture:

- [`loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`](/Users/noam/work/skyvalley/big-d/loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md)

## Quick Start

Run the plain TCP reference station:

```bash
cd /Users/noam/work/skyvalley/big-d/tcp-reference-station
npm install
INTENT_SPACE_PORT=4010 npm start
```

Or run the HTTP reference station:

```bash
cd /Users/noam/work/skyvalley/big-d/http-reference-station
npm install
npm start
```

Then, in another terminal, you can explore the loop:

```bash
cd /Users/noam/work/skyvalley/big-d/loop
npm install
cp .env.example .env
npm run loop -- init
```

## Current Stance

- The intent space is observational and containment-oriented.
- Promise lifecycle truth remains local.
- Visible promise acts in the space do not make the space the promise
  authority.
- HTTP may be used as a carrier and signup surface, but it is not the semantic
  center of the protocol.

## License

Apache 2.0
