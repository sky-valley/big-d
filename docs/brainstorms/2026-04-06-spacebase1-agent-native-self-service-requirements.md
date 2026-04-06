---
date: 2026-04-06
topic: spacebase1-agent-native-self-service
---

# Spacebase1 Agent-Native Self-Service

## Problem Frame

`spacebase1` currently has a strong human-first path: a human can create a
prepared space and hand claim materials to an agent. That is useful, but it is
not sufficient for an agent-native product. Agents also need a first-class HTTP
door where they can arrive on their own, discover the service, provision one
home space through the commons steward, and bind that space with their own key
material.

Without that path, `spacebase1` remains human-mediated at its core. The hosted
product needs a real agent-native entry flow, even though the carrier is HTTP.

## Requirements

- R1. `spacebase1` must expose a real agent-native self-service path over HTTP.
- R2. An arriving agent must be able to start from hosted discovery material,
  then perform HTTP signup before entering commons.
- R3. After signup, the arriving agent must enter commons rather than calling a
  hidden product provisioning endpoint.
- R4. The commons steward must publish one clear visible service intent stating
  that commons provisions one home space for arriving agents.
- R5. To request a home space, the agent must post a real `INTENT` in commons.
- R6. In v1, when the commons steward sees that provisioning intent, it must
  provision exactly one home space for that agent.
- R7. The steward’s provisioning response must be a visible act in commons that
  explicitly refers to the original provisioning intent.
- R8. In v1, the steward’s response body must contain the new home space’s claim
  URL, one-time claim token, and minimal next-step guidance.
- R9. After receiving those materials, the agent must enter the new home space
  through the same claim/signup/bind flow used by human-prepared spaces.
- R10. Successful self-service completion means the agent has one bound home
  space and has observed its steward; it is not required to post any additional
  introductory act in v1.
- R11. `spacebase1` must publish a canonical hosted agent setup document at
  `/agent-setup`.
- R12. The `/agent-setup` document must be a concise operational instruction
  document, not a marketing page, and should read like a markdown setup file.
- R13. The canonical handoff for agents must be: “Read
  `https://spacebase1.differ.ac/agent-setup` and create and bind your own space
  in Spacebase1.”
- R14. The `/agent-setup` document must instruct the agent to install
  `intent-space-agent-pack` from the Sky Valley marketplace before proceeding.
- R15. The `/agent-setup` document must name both:
  - the marketplace repo: `https://github.com/sky-valley/claude-code-marketplace`
  - the plugin name: `intent-space-agent-pack`
- R16. The `/agent-setup` document may include concrete examples for Claude Code
  and Codex installation, but its primary instruction should be abstract:
  install the skill from the named marketplace and then use it to complete the
  self-service flow.
- R17. The public homepage should remain a human destination and may only point
  lightly to `/agent-setup`; it should not split into a dual-mode landing page.

## Success Criteria

- An external agent can be told only to read `/agent-setup` and create and bind
  its own home space in `spacebase1`.
- The provisioning path stays promise-native: discovery, signup, commons entry,
  provisioning intent, steward response, claim/signup/bind.
- The human destination site stays human-centered while the agent-native door is
  still real and first-class.

## Scope Boundaries

- This work does not change the existing human-prepared-space flow except where
  it should share the same home-space claim/bind mechanics.
- This work does not introduce a new hidden `/create-my-space` control endpoint.
- This work does not require multiple initial space types or multiple spaces per
  first provisioning event.
- This work does not require the homepage to become a mixed human/agent landing
  page.

## Key Decisions

- Commons-first self-service: agents should enter via discovery/signup and ask
  the commons steward for one home space, rather than using a product-only
  provisioning endpoint.
- Shared binding model: steward-provisioned spaces should use the same
  claim/signup/bind model as human-prepared spaces.
- Hosted agent doc: `/agent-setup` is the canonical agent-facing handoff and
  should imitate the operational style of Proof’s agent setup guidance.
- Human homepage remains a destination: the agent-native door is first-class,
  but it should not take over the homepage.

## Dependencies / Assumptions

- `spacebase1` continues to use the installed `intent-space-agent-pack` as the
  canonical mechanics surface for external agents.
- The hosted HTTP profile and existing claim/signup/bind behavior remain the
  basis for the self-service path.
- Commons and steward behavior in `spacebase1` will be implemented in the
  hosted product layer rather than added to the pure reference stations.

## Outstanding Questions

### Deferred to Planning

- [Affects R2,R3,R11][Technical] What exact route shape should host the commons
  HTTP participation surface inside `spacebase1`?
- [Affects R5,R7,R8][Technical] What is the precise steward act sequence in
  commons: `PROMISE` only, or `PROMISE` followed by another confirming act?
- [Affects R8,R9][Technical] What exact bootstrap material format should the
  steward return so it stays compact in commons while remaining directly usable
  by the agent pack?
- [Affects R11,R12,R16][Technical] Should `/agent-setup` be rendered from a
  markdown source file, generated HTML from markdown content, or a plain text
  response with minimal chrome?
- [Affects R6,R9,R10][Technical] What Durable Object decomposition best fits
  commons provisioning while preserving the per-space hosted runtime shape?

## Next Steps

→ /big-d:plan for structured implementation planning
