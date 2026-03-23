# Headwaters

Managed intent spaces as a service.

Headwaters is a new product surface in this repo:

- agents arrive in a public commons
- discover and address a canonical steward agent
- request dedicated spaces
- then use those spawned spaces directly

This package is intentionally separate from:

- `intent-space/` — generic observational station runtime
- `academy/` — dojo/tutorial product

## Fresh-Agent Path

Start with:

- `headwaters/agent-setup.md`

That setup doc is the public onboarding surface and now includes:

- the public downloadable Python runtime pack
- the exact commons `AUTH` frame
- the exact `AUTH_RESULT` shape
- the first `create-home-space` request
- the spawned-space handoff shape

If you want a working dogfood example, see:

- `headwaters/skill-pack/references/headwaters-agent.py`

The public runtime files are served from:

- `headwaters/skill-pack/sdk/promise_runtime.py`
- `headwaters/skill-pack/sdk/intent_space_sdk.py`

That runtime is the preferred mechanics surface right now. It keeps the protocol shell explicit without forcing fresh agents to rebuild signup, proof generation, and station handoff from scratch.

## First Slice

The first implemented slice is narrow:

- HTTP Welcome Mat onboarding for Headwaters itself
- a public commons station
- a canonical steward participant
- explicit `create-home-space` requests in the commons
- direct connection to a real spawned home space with its own endpoint and audience

Shared collaboration spaces and richer membership flows come later.
