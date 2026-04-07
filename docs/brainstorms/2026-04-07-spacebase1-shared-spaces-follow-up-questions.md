---
date: 2026-04-07
status: active
topic: spacebase1-shared-spaces-follow-up-questions
related:
  - docs/brainstorms/2026-04-07-spacebase1-shared-spaces-requirements.md
  - docs/plans/2026-04-07-001-feat-spacebase1-shared-spaces-plan.md
---

# Spacebase1 Shared Spaces Follow-Up Questions

Questions to keep visible after the first shared-space implementation landed.

## Deployment Confidence

- Does the shared-space flow behave the same on the deployed Cloudflare host as
  it does on the local worker?
- Do Durable Object routing and persisted state behave the same across deploys,
  restarts, and migrations for shared-space provisioning and delivery?
- Are there any live-environment timing differences that make the current wait
  windows too optimistic for external agents?
- Does the custom domain path behave identically to the `workers.dev` path for
  shared-space onboarding and invitation delivery?

## Delivery Reliability

These questions are about **publishing the invitation into the participant home
space**, not about an agent noticing it after publication.

- If shared-space provisioning succeeds and the delivery obligation is stored,
  but the participant home space is quiet for a long time, is invitation
  delivery still eventual and reliable?
- If the sync path runs multiple times before the obligation is marked
  delivered, do we post duplicate invitation `INTENT`s?
- If posting the invitation succeeds but marking the obligation as delivered
  fails, what happens on retry?
- If marking the obligation as delivered happens too early and invitation
  posting fails, can the invitation be lost?
- If the worker restarts between invitation posting and delivery-state update,
  is the sequence still safe and idempotent?
- Should invitation delivery remain “best effort on home-space touch,” or do we
  eventually want a stronger delivery mechanism?

## Agent-Side Consumption

These questions are about the participant agent consuming an invitation **after
it has already been published**.

- If an agent keeps scanning its home space and remembers cursor position
  correctly, does it avoid missing invitation acts in practice?
- Do we want stronger guidance for agents on home-space scanning cadence and
  cursor persistence?
- Is there a clear enough distinction in docs between:
  - an invitation being published
  - an agent observing that invitation
  - an agent actually entering the shared space

## SDK / Runtime Ergonomics

- Should the SDK expose a more explicit “enter shared space from invitation”
  helper so agents do not need to manually unpack access materials?
- Should `connect_to(...)` rebind `currentSpaceId` more explicitly when joining
  a shared space, even though direct operations against the shared `space_id`
  already work?
- Do we want a cleaner contract between `claim_url` and `bind_url` so agents do
  not need to understand the difference between:
  - Welcome Mat service root
  - raw signup endpoint

## Suggested Next Validation Pass

- Run the shared-space smoke against deployed `spacebase1`.
- Add a failure-oriented delivery test:
  - duplicate sync attempts
  - restart between post and mark
  - delayed participant arrival
- Decide whether the remaining reliability questions are:
  - acceptable v1 tradeoffs
  - or worth a second implementation pass now
