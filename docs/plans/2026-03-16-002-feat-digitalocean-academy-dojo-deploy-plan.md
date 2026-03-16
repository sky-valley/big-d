---
title: Deploy Friend Dojo On DigitalOcean
type: feat
status: active
date: 2026-03-16
origin: docs/plans/2026-03-16-001-feat-deploy-friend-dojo-plan.md
---

# Deploy Friend Dojo On DigitalOcean

Deploy the first friend-facing intent space dojo on DigitalOcean with Cloudflare-managed DNS and a shared hostname shape:

- `https://academy.intent.space` for the academy
- `academy.intent.space:<station-port>` for the dojo station

This plan turns the local academy/station/tutor system into a small real deployment suitable for invited testers.

## Why DigitalOcean

DigitalOcean is the best current fit if we care about both:

- low operational complexity for a single-host deployment
- enough API and MCP surface that an agent can eventually provision, inspect, monitor, and recover the deployment with minimal manual tending

We are not using Vercel or Render as the primary home because the dojo station is a long-lived non-HTTP service and the academy and station should share the same hostname on different ports.

## Chosen Topology

### Public surface

- `academy.intent.space:443`
  - academy docs
  - human-readable and agent-readable onboarding pack
  - served by `Caddy`

- `academy.intent.space:4443`
  - dojo station
  - raw TCP `intent-space`

### Private/local surface

- tutor agent
  - runs on the same Droplet
  - connects to the station over localhost
  - is not publicly exposed

### Infrastructure

- one DigitalOcean Droplet
- one Reserved IP
- Cloudflare DNS `A` record pointing `academy.intent.space` at the Reserved IP

## Components

### 1. Academy website

Source:

- `academy/`

Deployment shape:

- publish static academy content to the Droplet
- serve with `Caddy` on `443`
- keep the academy content as the public source of truth for onboarding

### 2. Dojo station

Source:

- `intent-space/`

Deployment shape:

- run `intent-space` as a long-lived systemd service
- bind the public station on `0.0.0.0:4443`
- persist station state in a dedicated runtime directory on the Droplet

The dojo station is still a generic space implementation. It is not a special server type. The dojo behavior comes from:

- the academy pack
- the tutor participant
- the chosen tutorial spaces and contracts

### 3. Tutor agent

Source:

- `intent-space/src/tutor-main.ts`

Deployment shape:

- run tutor as a second long-lived systemd service
- connect locally to the station on `127.0.0.1:4443`
- keep tutor logs and env separate from the station

## Certificates

### Academy web cert

Use `Caddy` automatic HTTPS for `academy.intent.space`.

This requires:

- Cloudflare DNS already pointing the hostname at the Droplet IP
- port `80` reachable for ACME HTTP challenge
- port `443` reachable for academy traffic

### Station cert

Phase 1 recommendation:

- do not add station TLS yet unless the first invited agents require it
- keep station transport as public TCP on `4443`
- if we later need station TLS, treat it as a separate work item from academy web HTTPS

This keeps the first live deployment simpler and matches the currently validated local dojo path more closely.

## Provisioning Plan

1. Create one Ubuntu Droplet in a stable region
2. Create and attach a Reserved IP
3. Configure Cloudflare `A` record for `academy.intent.space`
4. SSH harden the host
5. Install Node runtime, repo checkout, and process dependencies
6. Install `Caddy`
7. Publish academy docs directory to the web root
8. Install systemd service for station
9. Install systemd service for tutor
10. Open firewall for:
   - `22`
   - `80`
   - `443`
   - `4443`
11. Run deployed smoke test

## Runtime Layout

Suggested host layout:

- `/srv/big-d/`
  - repo checkout or deployment artifact
- `/var/lib/intent-space/`
  - station state
- `/var/lib/intent-space-tutor/`
  - tutor state if needed
- `/var/log/intent-space/`
  - station logs
- `/var/log/intent-space-tutor/`
  - tutor logs
- `/var/www/academy/`
  - academy static content

## Systemd Services

### Station service

Responsibilities:

- start the dojo station on boot
- restart on failure
- load env from a dedicated env file
- write logs to journald

### Tutor service

Responsibilities:

- wait until the station is reachable
- connect locally to the station
- restart on failure
- load env from a dedicated env file

## Monitoring And Troubleshooting

Use the platform and host in layers:

- DigitalOcean Droplet health and resource visibility
- DigitalOcean MCP/API for agent-operated inspection and later automation
- journald logs for station and tutor
- smoke-test script for external behavioral validation

Minimum operational checks:

- academy returns `200`
- station accepts TCP connection on `4443`
- tutor is connected and observing
- reference dojo client can complete the ritual against the deployed host

## Smoke Test

Before inviting friends, run:

1. academy fetch test against `https://academy.intent.space`
2. station TCP connectivity test against `academy.intent.space:4443`
3. reference dojo client against the deployed host
4. one real agent tester using the short tester prompt

Success means:

- academy is reachable
- reference client completes `ASSESS`
- at least one external agent completes the dojo with zero manual intervention

## Security And Scope

Phase 1 scope:

- small invited cohort only
- no generalized public admission control yet
- tutor-led procedural trust, not full station write-auth enforcement

This is acceptable for the first friend dojo. It is not the final semi-public security model.

## Cost Shape

Start with:

- one small Basic Droplet
- one Reserved IP if desired

This should remain low-cost for the friend-dojo phase. DigitalOcean is not the absolute cheapest option, but it is a strong tradeoff because the agent-operable API surface is better than a cheaper VM-only provider.

## Acceptance Criteria

- [ ] DigitalOcean Droplet is provisioned for the dojo
- [ ] `academy.intent.space` serves the academy over HTTPS
- [ ] dojo station is reachable at `academy.intent.space:4443`
- [ ] tutor runs as a separate local service on the same host
- [ ] reference dojo client completes against the deployed host
- [ ] one external invited agent completes the dojo with the short tester prompt
- [ ] deployment and recovery steps are documented well enough for agent-assisted operation
