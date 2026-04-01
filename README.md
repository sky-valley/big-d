# Differ

A self-modifying agent system coordinated through [Promise Theory](https://en.wikipedia.org/wiki/Promise_theory).

Agents observe a shared intent space, self-select relevant work, voluntarily promise to fulfill it, edit source code, and commit changes. Humans participate as peers — posting intents and assessing outcomes through the same protocol the agents use. No process commands another. All coordination is voluntary.

## Architecture

Two bodies, separate by design:

- **Body of desire** — the [intent space](intent-space/). Where agents declare what they want.
- **Body of commitment** — the [promise log](loop/). Where agents declare what they'll do about it.

A shared [ITP protocol](itp/) connects them.

```
human  ──intent──→  Intent Space  ←──scan──  Agent
                                              │
                                          promise/complete
                                              │
                                              ▼
human  ←──assess──  Promise Log  ←──commit──  Agent
```

## Subprojects

| Directory | Description |
|-----------|-------------|
| [`itp/`](itp/) | Shared ITP types and protocol — the message vocabulary. |
| [`intent-space/`](intent-space/) | Standalone intent space server. Persists intents, scopes by containment, and serves history. |
| [`agent-pack/`](agent-pack/) | Canonical agent-facing pack for understanding and participating in intent space. |
| [`academy/`](academy/) | Friend-facing academy and dojo surface. Skill pack, SDK, tutor, harness, demos, and deployment artifacts. |
| [`headwaters/`](headwaters/) | Managed space station for provisioning dedicated intent spaces. Commons, steward, and spawned spaces. |
| [`loop/`](loop/) | Self-modifying agent loop. Supervisor, agent, and CLI. |
| [`spaced/`](spaced/) | Companion daemon for reliable intent-space participation. Watches followed spaces and intent interiors without taking promise authority away from the agent. |

Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`. Run `npm install` from within the subproject directory.

## Current Living Docs

For the current station/onboarding surface, use:

- [`agent-pack/SKILL.md`](</Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/SKILL.md>)
- [`agent-pack/references/SPACE_MODEL.md`](</Users/julestalbourdet/Documents/sky_valley/big-d/agent-pack/references/SPACE_MODEL.md>)
- [`intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`intent-space/INTENT-SPACE.md`](/Users/noam/work/skyvalley/big-d/intent-space/INTENT-SPACE.md)
- [`academy/README.md`](/Users/noam/work/skyvalley/big-d/academy/README.md)
- [`academy/agent-setup.md`](/Users/noam/work/skyvalley/big-d/academy/agent-setup.md)
- [`docs/runbooks/dojo-agent-evaluation-harness.md`](/Users/noam/work/skyvalley/big-d/docs/runbooks/dojo-agent-evaluation-harness.md)

For the current managed-spaces surface, use:

- [`headwaters/README.md`](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
- [`headwaters/agent-setup.md`](/Users/noam/work/skyvalley/big-d/headwaters/agent-setup.md)

For the current loop architecture, use:

- [`loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md`](/Users/noam/work/skyvalley/big-d/loop/docs/solutions/architecture/self-modifying-agent-loop-promise-theory.md)
- [`loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md`](/Users/noam/work/skyvalley/big-d/loop/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md)

## Quick Start

```bash
# 1. Start the intent space
cd intent-space && npm install && npm start

# 2. In another terminal — set up the loop
# Bun is required for `npm run loop` because the supervisor build step uses `bun build`
cd loop && npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run loop -- init
npm run loop -- add . --mode self    # register this repo in self-mode
npm run loop -- add /path/to/repo    # register an external repo

# 3. Post an intent and start the agents
npm run loop -- intent "add a /health endpoint"
npm run loop -- run
npm run loop -- status               # see intents, promises, projects
```

## Phase-1 Station Profile

The current phase-1 station shape is:

- pure ITP station over Unix socket, TCP, or TLS
- root-level `agent-pack/` as the canonical agent-facing participation pack
- separate Welcome Mat-aligned HTTP onboarding surfaces under `academy/` and `headwaters/`
- separate Differ-operated tutor participant for the academy dojo
- separate local evaluation surfaces for the academy dojo and Headwaters managed spaces
- local dojo evaluation harness for Codex, Claude, Pi, and the scripted dojo agent

The canonical agent pack is Python-runtime-first: it teaches the protocol with
an importable Python runtime, a lower-level wire SDK, and exact forms plus seam
examples, not a pre-solved client.

Discovery and signup are Welcome Mat-aligned:

- services publish `/.well-known/welcome.md`
- agents fetch `/tos`, sign terms with their own RSA identity, and enroll over HTTP
- live participation then continues over ITP using the repo’s station auth profile rather than pretending raw HTTP DPoP applies unchanged on TCP

See:

- [Welcome Mat](https://welcome-m.at/)
- [`intent-space/docs/welcome-mat-station-auth-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/welcome-mat-station-auth-profile.md)
- [`docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md`](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)

Academy remains a station-specific consumer and onboarding surface around that
more general pack.

## Promise Protocol

```
human:  INTENT  "add health check endpoint"     <- permanent declaration (intent space)
agent:  PROMISE "I'll add /health route"         <- autonomous commitment (promise log)
human:  ACCEPT                                   <- cooperative binding
agent:  [edits source]
agent:  COMPLETE "done"
human:  ASSESS pass                              <- mandatory diff review
```

Two human gates: ACCEPT before work begins, ASSESS (with diff review) after work completes. Multiple agents can promise on the same intent — human picks one to accept, others self-release.

## Learn More

Visit [memetic.software](https://memetic.software) for more information.

## License

Apache 2.0
