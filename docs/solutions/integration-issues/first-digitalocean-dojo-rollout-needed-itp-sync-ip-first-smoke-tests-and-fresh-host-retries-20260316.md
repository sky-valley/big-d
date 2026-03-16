---
title: "First DigitalOcean Dojo Rollout Needed ITP Sync, IP-First Smoke Tests, and Fresh-Host Retry Logic"
date: 2026-03-16
category: integration-issues
component: deployment
tags: [digitalocean, deployment, academy, dojo, tutor, caddy, bootstrap]
severity: high
root_cause: "The first live dojo rollout mixed a generic station repo layout with academy-owned dojo services, assumed the host only needed academy + intent-space synced, assumed the academy would be reachable on the configured IP-mode port immediately, and did not account for fresh-Ubuntu package-manager lock races."
---

# First DigitalOcean Dojo Rollout Needed ITP Sync, IP-First Smoke Tests, and Fresh-Host Retry Logic

## Problem

The first real DigitalOcean rollout for the friend dojo did create the Droplet, bootstrap the host, and start some services, but the live deployment was not actually healthy on the first pass.

The observed failures were:

- bootstrap hit transient `apt` and `dpkg` locks on the fresh Ubuntu host
- the station and tutor crashed after sync
- the academy smoke test targeted the wrong IP/port shape for IP-first mode
- the Reserved IP existed in DigitalOcean state, but it was not the usable public target during the rollout

The immediate risk was thinking the dojo had been deployed when only part of the stack was actually serving.

## Root Cause

There were four distinct causes.

### 1. Fresh-host package manager races

New Ubuntu droplets can have unattended package operations still in progress. The bootstrap script tried to run `apt-get` immediately and hit:

- `/var/lib/apt/lists/lock`
- `/var/lib/dpkg/lock-frontend`

So the bootstrap needed retry tolerance rather than assuming package management was instantly available.

### 2. Missing shared `itp/` sync

The refactor that moved dojo-specific logic into `academy/` did not remove the shared protocol dependency:

- `intent-space` still imports `@differ/itp`
- `academy/src/tutor.ts` imports `../../itp/src/protocol.ts`

The first bootstrap synced:

- `academy/`
- `intent-space/`

but not:

- `itp/`

That caused the live runtime failures:

- station: `Cannot find package '@differ/itp' imported from /srv/big-d/intent-space/src/service-intents.ts`
- tutor: `Cannot find module '/srv/big-d/itp/src/protocol.ts' imported from /srv/big-d/academy/src/tutor.ts`

So the deployment artifact set was incomplete even though the local repo structure was correct.

### 3. IP-first academy mode was modeled incorrectly

The intended pre-DNS rollout was:

- academy on raw IP
- station on raw IP plus port

But the smoke test and status output initially assumed the academy would be on:

- `http://<ip>:8080/`

while the copied Caddy configuration had also been started once on `:80`, and the actual academy artifact that mattered was:

- `/agent-setup.md`

This created confusion between:

- server alive
- correct port
- correct document path

The working smoke target turned out to be:

- `http://<droplet-public-ip>:8080/agent-setup.md`

not the earlier assumptions.

### 4. Reserved IP was not the reliable traffic target during rollout

DigitalOcean state showed both a direct Droplet public IP and a Reserved IP, but the services were only verifiably reachable on the direct public IP during the rollout. So the operationally correct rule for this phase is:

- treat the direct public IP as the ground truth until the Reserved IP is proven live from outside

## Solution

We changed both the deployment scripts and the rollout mental model.

### What changed in the bootstrap

The bootstrap now needs to sync all three runtime roots:

- `academy/`
- `intent-space/`
- `itp/`

That fixes both station and tutor resolution failures on the host.

### What changed in service activation

After copying deployment files, the bootstrap must explicitly restart services, not just enable them:

- `caddy`
- `intent-space-station`
- `intent-space-tutor`

That matters because the first host configuration can start with an earlier Caddy state and stale assumptions about which listener is active.

### What changed in smoke testing

For pre-DNS rollout, the smoke test should validate:

1. the actual academy document, not just `/`
2. the actual academy port in IP-first mode
3. the station TCP listener separately

The working smoke check was:

```bash
bash academy/deploy/scripts/smoke-test.sh \
  <droplet-public-ip> \
  4443 \
  http://<droplet-public-ip>:8080/agent-setup.md
```

That passed.

### What changed in rollout policy

For pre-DNS phase 1:

- use the Droplet public IP as the live target
- do not trust the Reserved IP until externally verified
- treat academy as IP-mode HTTP on its explicit port
- treat station as raw TCP on `4443`

Current working endpoints from the first rollout:

- academy: `http://<droplet-public-ip>:8080/agent-setup.md`
- station: `tcp://<droplet-public-ip>:4443`

## Prevention Tip

When deploying a split product surface like this one, do not think in terms of “main app plus extras.” Think in terms of **runtime roots**.

For this dojo, the live deployment depends on:

- generic station runtime
- academy-owned dojo runtime
- shared protocol package

If any one of those is missing from the host, the deployment is incomplete even if systemd units and web assets are present.

Also:

- fresh Ubuntu hosts should be assumed to have transient package-manager contention
- IP-first rollout should have a distinct smoke-test path from DNS/HTTPS rollout
- Reserved IPs should be treated as untrusted until a real external check confirms them

## Practical Next Step

Before inviting friends, add one more automated validation step to the deployment flow:

1. bootstrap host
2. check remote `ss -ltnp`
3. run smoke test against direct public IP
4. only then advertise the dojo endpoint

That keeps “host exists” separate from “dojo is actually reachable.”

## Related Documentation

- [academy/deploy/README.md](/Users/noam/work/skyvalley/big-d/academy/deploy/README.md)
- [academy/deploy/scripts/provision-do.sh](/Users/noam/work/skyvalley/big-d/academy/deploy/scripts/provision-do.sh)
- [academy/deploy/scripts/bootstrap-dojo-host.sh](/Users/noam/work/skyvalley/big-d/academy/deploy/scripts/bootstrap-dojo-host.sh)
- [academy/deploy/scripts/smoke-test.sh](/Users/noam/work/skyvalley/big-d/academy/deploy/scripts/smoke-test.sh)
- [docs/plans/2026-03-16-002-feat-digitalocean-academy-dojo-deploy-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-16-002-feat-digitalocean-academy-dojo-deploy-plan.md)
