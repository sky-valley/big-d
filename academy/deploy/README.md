# Academy Dojo Deployment

Deploy artifacts for the friend-facing academy + dojo on a single host.

This folder is intentionally product-specific. It exists so the academy and dojo deployment surface has one obvious operational home separate from the generic `intent-space/` runtime.

## Components

- `Caddyfile`
  - academy HTTPS site on `academy.intent.space`, reverse-proxied to the academy app

- `systemd/intent-space-station.service`
  - public dojo station on `academy.intent.space:4443`

- `systemd/academy.service`
  - academy HTTP app serving `/.well-known/welcome.md`, `/tos`, `/api/signup`, and the pack files

- `systemd/intent-space-tutor.service`
  - private tutor participant connected to the local station

- `scripts/smoke-test.sh`
  - remote validation of academy + dojo readiness

- `scripts/provision-do.sh`
  - create or reuse the DigitalOcean Droplet, SSH key record, and optional Reserved IP

- `scripts/bootstrap-dojo-host.sh`
  - install packages, sync academy + intent-space, install services, and start the host

## Assumptions

- Cloudflare manages DNS
- one host owns both `academy.intent.space:443` and `academy.intent.space:4443`
- `Caddy` handles academy HTTPS certificates
- the station remains plain TCP on `4443` for phase 1
- tutor runs locally and is not publicly exposed

## Recommended Host Layout

- `/srv/big-d/`
  - repo checkout
- `/etc/caddy/Caddyfile`
  - active Caddy config
- `/etc/intent-space/academy.env`
  - academy app env file for the local listener behind Caddy
- `/etc/intent-space/station.env`
  - station env file
- `/etc/intent-space/tutor.env`
  - tutor env file
- `/var/lib/intent-space/`
  - station runtime state

## Activation

1. Install `Caddyfile`
2. Install the three systemd units
3. Create env files for academy, station, and tutor
5. `systemctl daemon-reload`
6. `systemctl enable --now academy`
7. `systemctl enable --now intent-space-station`
8. `systemctl enable --now intent-space-tutor`
9. run `scripts/smoke-test.sh`

## IP-First Rollout

Before DNS exists, deploy in raw IP mode:

1. fill `academy/deploy/.env.do`
2. run `scripts/provision-do.sh`
3. run `scripts/bootstrap-dojo-host.sh`
4. run `scripts/smoke-test.sh <droplet-ip> 4443`

That gives:

- academy over `http://<droplet-ip>:8080/agent-setup.md`
- station over `tcp://<droplet-ip>:4443`
- academy app listening privately on `127.0.0.1:18080`

When DNS exists later:

1. point Cloudflare at the Droplet IP
2. set `ACADEMY_HOSTNAME=academy.intent.space`
3. rerun `scripts/bootstrap-dojo-host.sh`

Then Caddy can take over HTTPS on `443`.
