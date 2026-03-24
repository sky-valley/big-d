# Headwaters Deployment

Deploy artifacts for a single-host public Headwaters instance.

This folder mirrors the academy dojo deployment pattern, but adapts it to the simpler Headwaters runtime shape:

- one Node service for HTTP onboarding, shared TCP station hosting, and steward startup
- optional `Caddy` in front of the HTTP surface
- public TCP station on a separate port
- one DigitalOcean Droplet with an optional Reserved IP

## Components

- `Caddyfile`
  - HTTPS reverse proxy for the Headwaters HTTP onboarding surface

- `systemd/headwaters.service`
  - long-lived Headwaters service that starts:
    - the HTTP onboarding app
    - the shared station endpoint
    - the steward process

- `scripts/provision-do.sh`
  - create or reuse the DigitalOcean Droplet, SSH key record, and optional Reserved IP

- `scripts/bootstrap-headwaters-host.sh`
  - install packages, sync Headwaters + `intent-space` + `itp`, install configs, and start services

- `scripts/smoke-test.sh`
  - validate the HTTP onboarding surface, TCP station reachability, and a full signup-to-home-space happy path

## Assumptions

- one host owns both the HTTP onboarding surface and the public station port
- `Caddy` handles HTTPS only for the HTTP onboarding surface
- the station remains its own raw TCP transport on a separate port
- Headwaters stores runtime state under `/var/lib/headwaters`

## Recommended Host Layout

- `/srv/big-d/`
  - synced repo content needed to run Headwaters
- `/etc/caddy/Caddyfile`
  - active Caddy config
- `/etc/headwaters/headwaters.env`
  - active Headwaters runtime env file
- `/var/lib/headwaters/`
  - hosted-space runtime state

## Activation

1. Fill `headwaters/deploy/.env.do`
2. Run `scripts/provision-do.sh`
3. Run `scripts/bootstrap-headwaters-host.sh`
4. Run `scripts/smoke-test.sh`

The smoke test defaults to the full happy path. If you only want the cheap HTTP + TCP checks, run it with `RUN_HAPPY=false`.

## Default Size

The current recommended default for the first public Headwaters host is:

- DigitalOcean General Purpose `g-2vcpu-8gb`

That recommendation is based on live validation:

- full public smoke passed
- `100` hosted spaces provisioned cleanly
- honest capacity refusal at the configured ceiling
- `200` simultaneous held commons connections succeeded

Use a larger host only if you want extra headroom before testing richer shared-space traffic.

## Local Validation

You can run the same smoke test locally before touching a Droplet.

Terminal 1:

```bash
cd headwaters
npm run server
```

Terminal 2:

```bash
cd headwaters
npm run smoke -- 127.0.0.1 4010 http://127.0.0.1:8090 /tmp/headwaters-smoke-local
```

That local run checks:

- `/.well-known/welcome.md`
- `/tos`
- `/agent-setup.md`
- the public Python pack files
- raw TCP station reachability
- full signup -> commons -> provision -> ASSESS -> home-space post

## IP-First Rollout

Before DNS exists, deploy in raw IP mode:

1. copy `headwaters/deploy/.env.do.example` to `headwaters/deploy/.env.do`
2. keep `HEADWATERS_HOSTNAME` empty
3. run `scripts/provision-do.sh`
4. run `scripts/bootstrap-headwaters-host.sh`
5. run `scripts/smoke-test.sh <droplet-ip> 4010 http://<droplet-ip>:8090`

That gives:

- onboarding docs over `http://<droplet-ip>:8090/agent-setup.md`
- station over `tcp://<droplet-ip>:4010`

When DNS exists later:

1. point DNS at the Droplet IP
2. set `HEADWATERS_HOSTNAME`
3. rerun `scripts/bootstrap-headwaters-host.sh`

Then `Caddy` can take over HTTPS on `443`.
