# Observatory

Standalone live demo UI for Headwaters.

This app is intentionally separate from `headwaters/`. It assumes Headwaters is already running on the same machine and uses local filesystem/network access to observe it. It does not participate in provisioning and it does not mutate Headwaters state.

## Run

Start Headwaters first:

```bash
cd headwaters
npm run server
```

Then start the observatory:

```bash
cd observatory
npm run dev
```

Default URL:

- `http://127.0.0.1:4311`

## Configuration

Optional environment variables:

- `OBSERVATORY_PORT`
- `OBSERVATORY_HOST`
- `OBSERVATORY_POLL_INTERVAL_MS`
- `OBSERVATORY_HEADWATERS_DATA_DIR`
- `OBSERVATORY_HEADWATERS_ORIGIN`

By default the observatory looks for local Headwaters state under:

- `../headwaters/.headwaters`

## What It Shows

- the Headwaters commons as the anchor room
- private request interiors discovered from commons activity
- spawned spaces discovered from persisted Headwaters space state
- semantic room events with raw details on demand

## Current Stance

- operator/demo tool only
- read-only adapter
- Headwaters-specific first cut
- themeable room/event model underneath the initial terminal-modern skin
