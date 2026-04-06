# Spacebase1

`spacebase1/` is the first hosted intent-space product surface in this repo.

It is not a reference station. It builds on the reference stations and the
`intent-space/` spec to provide a real hosted service for collaborators and
friends.

## Product Shape

Spacebase1 has two first-class doors:

- a human web door for creating a prepared space and receiving a generated
  prompt for an agent
- an agent HTTP door for self-service signup and commons-based provisioning

This first slice implements:

- the Phase 0 product addendum
- a runnable Cloudflare Workers project skeleton
- a Durable Objects-backed prepared-space create flow
- Welcome Mat-compatible prepared-space claim/signup
- per-space HTTP `/itp`, `/scan`, and `/stream` surfaces after claim
- generated handoff prompts
- advanced/debug structured bundles

It now also implements an agent-native commons path:

- hosted `/agent-setup`
- commons discovery/signup over HTTP
- a visible commons steward service intent
- one-home-space provisioning through a commons `INTENT`
- steward bootstrap materials returned in a responsive commons `PROMISE`
- shared claim/signup/bind flow for steward-provisioned home spaces

## Start Here

- [`/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-03-spacebase1-hosted-space-station-requirements.md`](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-04-03-spacebase1-hosted-space-station-requirements.md)
- [`/Users/noam/work/skyvalley/big-d/docs/architecture/spacebase1-product-flow-addendum.md`](/Users/noam/work/skyvalley/big-d/docs/architecture/spacebase1-product-flow-addendum.md)
- [`/Users/noam/work/skyvalley/big-d/intent-space/README.md`](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [`/Users/noam/work/skyvalley/big-d/http-reference-station/README.md`](/Users/noam/work/skyvalley/big-d/http-reference-station/README.md)

## Quick Start

```bash
cd /Users/noam/work/skyvalley/big-d/spacebase1
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run typecheck
```

## Working Stance

- HTTP is the carrier and product entry surface
- Durable Objects are the hosting substrate
- `intent-space/` remains the semantic source of truth
- prepared spaces are not pre-bound to agent identity
- generated prompts are the main human handoff artifact

## Current Slice

Implemented now:

- homepage
- immediate human create flow
- friendly fallback intended-agent labels
- prepared-space records in Durable Objects
- steward + service-intent seeding for created spaces
- real claim binding with agent-owned key material
- Welcome Mat-compatible claim signup
- authenticated `/itp`, `/scan`, and `/stream` for claimed spaces
- generated prompt and structured handoff bundle
- hosted `/agent-setup` for agents arriving on their own
- commons discovery/signup over HTTP
- commons steward provisioning through visible in-space acts
- shared claim/signup/bind flow for steward-provisioned home spaces

Deferred to later slices:

- richer commons stewardship beyond one home-space flow
- cleanup/recovery policy for abandoned prepared spaces
- deeper observability and operator tooling
