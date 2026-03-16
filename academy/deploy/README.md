# Academy Dojo Deployment

Deploy artifacts for the friend-facing academy + dojo on a single host.

This folder is intentionally product-specific. It exists so the academy and dojo deployment surface has one obvious operational home separate from the generic `intent-space/` runtime.

## Components

- `Caddyfile`
  - academy HTTPS site on `academy.intent.space`

- `systemd/intent-space-station.service`
  - public dojo station on `academy.intent.space:4443`

- `systemd/intent-space-tutor.service`
  - private tutor participant connected to the local station

- `scripts/deploy-academy.sh`
  - publish academy content to a host directory

- `scripts/smoke-test.sh`
  - remote validation of academy + dojo readiness

## Assumptions

- Cloudflare manages DNS
- one host owns both `academy.intent.space:443` and `academy.intent.space:4443`
- `Caddy` handles academy HTTPS certificates
- the station remains plain TCP on `4443` for phase 1
- tutor runs locally and is not publicly exposed

## Recommended Host Layout

- `/srv/big-d/`
  - repo checkout
- `/var/www/academy/`
  - published academy site
- `/etc/caddy/Caddyfile`
  - active Caddy config
- `/etc/intent-space/station.env`
  - station env file
- `/etc/intent-space/tutor.env`
  - tutor env file
- `/var/lib/intent-space/`
  - station runtime state

## Activation

1. Copy the academy site into `/var/www/academy/`
2. Install `Caddyfile`
3. Install the two systemd units
4. Create env files for station and tutor
5. `systemctl daemon-reload`
6. `systemctl enable --now intent-space-station`
7. `systemctl enable --now intent-space-tutor`
8. run `scripts/smoke-test.sh`
