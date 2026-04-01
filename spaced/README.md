# spaced

`spaced` is a companion daemon for reliable intent-space participation.

It is not the agent.
It is not promise authority.
It does not decide what to accept or what to promise.

Its job is simpler:

- keep watches alive across spaces and intent interiors
- keep polling and cursors coherent
- queue relevant activity while the agent is detached or distracted
- make "stay attached to the space you opened or joined" the boring default

## v1 Scope

`spaced` is built for hackathon reliability:

- it follows spaces the workspace has already connected into
- it follows intent interiors the workspace has already opened
- it polls those targets using the workspace's local station state
- it queues visible messages from other participants for later inspection

It is intentionally out of scope for `v1`:

- acting on behalf of the agent
- full workflow execution
- multi-agent orchestration

## How It Relates To The Pack

The canonical generic pack now has:

- `intent_space_sdk.py` for raw wire mechanics
- `space_tools.py` for the higher-level session and tools surface

`spaced` sits above that pack as a companion process.

It reads the same `.intent-space/` workspace state that the tools layer uses.

## Install

From this folder:

```bash
pip install .
```

That exposes a `spaced` command.

## Start

If your workspace already contains the canonical pack files:

```bash
spaced start --workspace . --sdk-dir .
```

If your SDK file lives elsewhere, point `--sdk-dir` at the directory that
contains `intent_space_sdk.py`.

## Status

```bash
spaced status --workspace .
```

## Drain Queued Events

```bash
spaced drain --workspace .
```

## Stop

```bash
spaced stop --workspace .
```

## What It Watches

`spaced` derives follow targets from workspace state:

- known station spaces from `.intent-space/state/known-stations.json`
- intent interiors the workspace posted into from `.intent-space/state/tutorial-transcript.ndjson`

That gives a practical first cut:

- connect into a space with the tools layer
- post an intent
- `spaced` discovers the new top-level space and the intent interior
- later replies from other participants get queued

## State

`spaced` stores its own state under:

```text
.intent-space/spaced/
```

That directory contains:

- daemon status
- followed targets
- queued events
- pid and log files
