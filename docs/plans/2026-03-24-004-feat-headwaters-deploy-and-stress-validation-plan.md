---
title: feat: Headwaters deploy and stress validation
type: feat
status: active
date: 2026-03-24
origin: docs/plans/2026-03-24-003-feat-headwaters-public-hackathon-hosting-plan.md
---

# feat: Headwaters deploy and stress validation

## Overview

Headwaters now has the core shared-host runtime cut, a deploy scaffold, and a public onboarding surface. The next job is to validate that this is a credible public single-host service on a real DigitalOcean Droplet before expanding scope further.

This plan is intentionally execution-oriented. It turns the current deployment and capacity conversation into a sequence we can follow and mark off in order:

1. make the smoke path trustworthy locally
2. provision one conservative medium Droplet
3. bootstrap Headwaters there in IP-first mode
4. prove the public happy path works end to end
5. measure the actual operating envelope under controlled load
6. decide what to tighten next from evidence, not instinct

## Problem Statement / Motivation

The repo now has:

- a shared-host Headwaters runtime
- restart recovery
- explicit capacity refusal scaffolding
- a DigitalOcean deploy scaffold
- a real fresh-agent harness

What it does not yet have is an honest, measured public operating envelope.

We still need to answer:

- does the public host come up cleanly on a real Droplet?
- does the smoke path remain trustworthy outside localhost?
- how many spaces can be provisioned before refusal begins?
- how many concurrent connections can the host sustain?
- what happens when one agent opens multiple simultaneous connections?
- how quickly does the service recover after restart under non-trivial hosted state?

This plan exists to answer those questions in the right order and avoid skipping from “it works locally” to “we assume it scales.”

## Proposed Solution

Use one conservative DigitalOcean General Purpose Droplet as the first public validation target and run a staged validation sequence:

1. **local smoke validation**
   Prove the smoke test shape locally with the normal operator flow before trusting it remotely.

2. **IP-first public rollout**
   Provision and bootstrap one Droplet without waiting on final DNS.

3. **public smoke validation**
   Run the same smoke path against the public IP and station port.

4. **structured load ramps**
   Separate the three pressure dimensions:
   - hosted space count
   - concurrent connections
   - mixed burst/recovery behavior

5. **capacity decision**
   Set the first real refusal posture from measured evidence.

## Promise-Native Architecture Check

- **Autonomous participants:** requesting agents, the Headwaters steward, the shared Headwaters host runtime, and each spawned space as its own identity/auth/persistence boundary.
- **Promises about self:** agents promise requests, accepts, and assessments; the steward promises provisioning behavior; the host promises availability, persistence, and explicit refusal when at capacity.
- **State authority:** provisioning authority stays in Headwaters control-plane/runtime state; promise lifecycle visibility stays explicit in the spaces; benchmark/load tooling observes behavior but does not become hidden authority.
- **Promise lifecycle honesty:** deployment and stress work must continue to validate `INTENT -> PROMISE -> ACCEPT -> COMPLETE -> ASSESS`, not bypass it with direct admin shortcuts.
- **Intent-space purity:** public validation may use HTTP for Welcome Mat onboarding and public docs, but live participation and stress behavior must remain ITP-native.
- **Visibility / containment:** provisioning artifacts remain in the appropriate private request interiors even during load; operator metrics/logging must not require leaking fulfillment artifacts into the commons.
- **Rejected shortcut:** do not reduce “stress testing” to HTTP health checks or TCP connect checks only. The core promise-native provisioning path must stay in the smoke/load loop.

## Technical Considerations

- The local smoke path must reflect the public service contract, not just process reachability.
- The public rollout should start in IP-first mode to remove DNS and TLS as initial blockers.
- The first target box should remain conservative:
  - DigitalOcean General Purpose
  - 4 dedicated vCPUs
  - 16 GiB RAM
- The first measured limits should distinguish:
  - hosted spaces
  - concurrent connections
  - mixed provision/scan/post traffic
- Stress scripts should reuse existing Headwaters mechanics where possible:
  - the public Python runtime
  - the Headwaters happy-path client
  - the shared public onboarding docs

## Implementation Phases

### Phase 1: Local Smoke Finalization

Goal: make sure the smoke path is worth trusting before using it on a Droplet.

Tasks:

- Validate `headwaters/deploy/scripts/smoke-test.sh` in a normal two-terminal local workflow
- Confirm it checks:
  - `/.well-known/welcome.md`
  - `/tos`
  - `/agent-setup.md`
  - pack file downloadability
  - TCP station reachability
  - full signup -> provisioning -> `ASSESS` -> home-space post
- Adjust script/runtime artifacts if local execution reveals gaps

Success criteria:

- local smoke passes end to end on the operator’s machine
- smoke output is concise and obviously actionable on failure

### Phase 2: Public IP-First Rollout

Goal: get one real public Headwaters host online with the new deploy scaffold.

Tasks:

- Create or reuse `headwaters/deploy/.env.do`
- Decide whether to reuse `academy/deploy/.env.do` directly for the first pass
- Provision one Droplet with:
  - General Purpose `g-4vcpu-16gb`
  - optional Reserved IP
- Bootstrap the host with:
  - `headwaters/deploy/scripts/provision-do.sh`
  - `headwaters/deploy/scripts/bootstrap-headwaters-host.sh`
- Capture:
  - target IP
  - HTTP onboarding URL
  - public station endpoint

Success criteria:

- one Droplet is provisioned and bootstrapped without manual console surgery
- Headwaters is reachable on both HTTP and the station port by IP

### Phase 3: Public Smoke Validation

Goal: prove the actual public host works before applying load.

Tasks:

- Run `headwaters/deploy/scripts/smoke-test.sh` against the Droplet IP
- Run a restart check:
  - `systemctl restart headwaters`
  - rerun smoke
- Confirm public artifacts are still correct:
  - onboarding docs
  - pack downloads
  - shared endpoint handoff

Success criteria:

- smoke passes against the public host
- smoke still passes after restart
- no manual host repair is needed between the two runs

### Phase 4: Hosted Space Count Ramp

Goal: estimate how many spaces the host can provision and recover cleanly.

Tasks:

- Build a repeatable space-ramp script
- Provision in batches:
  - 10
  - 25
  - 50
  - 75
  - 100
- Record at each level:
  - provision success count
  - average and p95 provision latency
  - host memory/RSS
  - CPU/load
  - open file descriptors
  - restart time
- Confirm restart recovery at meaningful checkpoints, not just at zero load

Success criteria:

- we know whether `100` hosted spaces is actually credible on this box
- we know the point where refusal should begin before failure

### Phase 5: Concurrent Connection Ramp

Goal: measure the more likely real bottleneck: live connections.

Tasks:

- Build a repeatable connection-load script
- Exercise:
  - many agents with one connection each
  - one agent with multiple simultaneous connections
  - subagent-style concurrent scans inside the same space
  - participation across multiple spaces at once
- Ramp connection counts:
  - 25
  - 50
  - 100
  - 200
- Record:
  - auth success/failure
  - scan/post latency
  - socket/fd usage
  - memory growth
  - disconnect/error rate

Success criteria:

- we know whether space count or connection pressure is the real first constraint
- we know whether multi-connection agents are materially more expensive than expected

### Phase 6: Mixed Burst And Recovery Test

Goal: validate behavior under the public-service shape we actually expect.

Tasks:

- Mix:
  - new provisioning
  - repeated reconnects
  - concurrent scans
  - posts in existing spaces
- While under non-trivial load:
  - restart Headwaters
  - rerun smoke
  - confirm previously provisioned spaces still work
  - confirm new provisioning still behaves honestly

Success criteria:

- recovery remains legible under realistic use
- failure modes are explicit and recoverable, not mysterious

### Phase 7: Capacity Decision And Follow-Up Work

Goal: end with a concrete service stance, not just benchmark notes.

Tasks:

- Choose the initial deployed `HEADWATERS_MAX_SPACES`
- Decide whether refusal should stay count-based only for now or add resource-pressure gates
- Identify the next real bottleneck:
  - memory
  - file descriptors
  - restart time
  - auth/join overhead
  - storage/persistence
- Open the next implementation plan from measured evidence

Success criteria:

- the deployed service has an explicit first operating envelope
- the next implementation step is evidence-driven

## Validation Strategy

- **Local validation**
  - run the smoke test against a normal local server
- **Public validation**
  - run the same smoke path against the Droplet IP
- **Lifecycle validation**
  - restart and recovery checks at several load levels
- **Load validation**
  - separate hosted-space, connection, and mixed-burst ramps

## Risks / Tradeoffs

- The current smoke path may still need small operator-facing improvements after the first public run.
- The public bottleneck may be concurrent connections rather than space count.
- Restart recovery may degrade sooner than provisioning does.
- The Droplet may prove too small or slightly oversized; that is acceptable as long as the measurements are honest.
- DNS/TLS should not be allowed to obscure first service readiness; IP-first rollout remains the right first move.

## Deliverables

- a validated local smoke path
- one real public Headwaters host
- one public smoke result before and after restart
- at least one hosted-space ramp result
- at least one concurrent-connection ramp result
- a first real deployed operating envelope

## Execution Notes

### Current Measured Envelope

- Public host is live on one `m-2vcpu-16gb` Droplet in `nyc1`
- Public smoke passed before and after restart
- Updated host-health probe now aggregates the full `systemd -> npm -> tsx -> node` process tree, not just the wrapper PID
- Current measured idle resource profile on the public host:
  - `processCount: 6`
  - `rssKb: ~401568`
  - `fdCount: 446`
  - `tcpConnections: 2`
  - `cpuPct: ~88.6`
- Hosted-space ramp results:
  - `10`, `25`, `50`, and `75` total hosted spaces all provisioned successfully
  - `100` hosted spaces were reached successfully
  - the next provisioning requests declined explicitly with `HEADWATERS_CAPACITY_OR_PROVISIONING_FAILURE`
- Commons connection ramp results:
  - `25` concurrent held connections succeeded cleanly
  - `50` concurrent held connections succeeded cleanly
  - `100` concurrent held connections succeeded cleanly once the local runner file-descriptor limit was raised
  - `200` concurrent held connections also succeeded cleanly
- Mid-run host checks confirmed:
  - about `52` live TCP connections during the `50`-connection hold run
  - about `102` live TCP connections during the `100`-connection hold run
  - about `202` live TCP connections during the `200`-connection hold run
  - during the `200`-connection hold run:
    - `rssKb: ~410396`
    - `fdCount: 647`
    - `cpuPct: ~88.2`
- Recovery checks under non-trivial hosted state succeeded:
  - service restart returned to `active`
  - an already provisioned home space reconnected and accepted a new post after restart
  - new provisioning still declined honestly after restart when the host remained full

### Current Interpretation

- The first hard product limit is currently the configured hosted-space ceiling, not observed commons connection pressure.
- The public host handled `200` simultaneous commons connections on the shared endpoint without observed service failure.
- The first `100`-connection failure was caused by the local load generator hitting `EMFILE`, not by the public Headwaters host.
- The new probe shows that commons connection pressure only raised process-tree RSS by about `9 MB` and fd usage by about `201` descriptors over idle.
- The dominant observed runtime issue is now high steady-state CPU in the steward-side Node process, not connection collapse on the shared host.
- The next useful measurement is no longer “can the box basically work?” It is “how much memory, fd growth, and latency do we see once mixed traffic and non-commons participation are involved?”

## Execution Checklist

- [x] Local smoke path is defined for the normal two-terminal workflow and the smoke script now exercises the full happy path
- [x] `headwaters/deploy/.env.do` exists with Headwaters-specific deploy values
- [x] One conservative DigitalOcean Droplet is provisioned (`m-2vcpu-16gb` in `nyc1`, because the expected 16 GB general-purpose slug was not available there)
- [x] Headwaters is bootstrapped in IP-first mode
- [x] Public smoke passes
- [x] Public smoke passes after restart
- [x] Hosted-space count ramp script exists
- [x] Hosted-space ramp results are recorded
- [x] Concurrent-connection ramp script exists
- [x] Concurrent-connection results are recorded
- [x] Mixed burst/recovery test is run
- [x] First deployed operating envelope is written down

## References

- [2026-03-24-003-feat-headwaters-public-hackathon-hosting-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-24-003-feat-headwaters-public-hackathon-hosting-plan.md)
- [headwaters/deploy/README.md](/Users/noam/work/skyvalley/big-d/headwaters/deploy/README.md)
- [headwaters/deploy/scripts/smoke-test.sh](/Users/noam/work/skyvalley/big-d/headwaters/deploy/scripts/smoke-test.sh)
- [headwaters/scripts/headwaters-agent.py](/Users/noam/work/skyvalley/big-d/headwaters/scripts/headwaters-agent.py)
