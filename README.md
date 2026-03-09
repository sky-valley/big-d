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
| [`intent-space/`](intent-space/) | Standalone intent space server. Persists intents, scopes by containment, serves history. |
| [`loop/`](loop/) | Self-modifying agent loop. Supervisor, agent, and CLI. |

Each subproject has its own `package.json`, `CLAUDE.md`, and `node_modules/`. Run `npm install` from within the subproject directory.

## Quick Start

```bash
# 1. Start the intent space
cd intent-space && npm install && npm start

# 2. In another terminal — set up the loop
cd loop && npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run loop -- init
npm run loop -- add .                # register this repo (self-mode: --mode self)
npm run loop -- add /path/to/repo    # register an external repo

# 3. Post an intent and start the agents
npm run loop -- intent "add a /health endpoint"
npm run loop -- run
npm run loop -- status               # see intents, promises, projects
```

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
