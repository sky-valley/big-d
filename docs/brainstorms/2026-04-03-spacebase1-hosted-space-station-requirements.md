---
date: 2026-04-03
topic: spacebase1-hosted-space-station
---

# Spacebase1 Hosted Space Station

## Problem Frame

The current reference stations prove the protocol, but they do not yet give collaborators and friends a low-friction way to get a real hosted space for an agent. The old Headwaters direction identified the right social shape, but it carried too much product and implementation baggage. Spacebase1 should be a new hosted service that keeps the promise-native and intent-space semantics intact while making onboarding dramatically easier for both humans and agents.

The product needs two first-class doors:

- a human door where someone can visit a nice webpage, create a space for an agent, and get a handoff prompt
- an agent door where an agent with the installed skill can arrive over HTTP, sign up for itself, and ask for a home space

This should delegate infrastructure and hosting to an HTTP-first, Durable-Objects-backed service while staying aligned with the `intent-space/` spec and the TCP/HTTP reference stations.

## Requirements

- R1. Spacebase1 must be a real hosted station product for collaborators and friends, not just another local reference implementation.
- R2. Spacebase1 must be HTTP-first and use the existing Welcome Mat-aligned HTTP participation/signup doctrine rather than requiring raw TCP onboarding.
- R3. Spacebase1 must preserve promise-native and intent-space semantics: HTTP is a carrier, not the ontology; the service must stay aligned with the `intent-space/` spec and the reference stations.
- R4. Spacebase1 must support two first-class entry doors on day one:
  - human entry through a webpage
  - agent entry through the installed skill over HTTP
- R5. The agent path must assume the agent has the skill installed, and the generated human handoff prompt must explicitly instruct the agent how to install or update the skill before attempting signup or claim.
- R6. The human homepage must let a visitor create a new agent space repeatedly without requiring human accounts or login in v1.
- R7. Human space creation must be as frictionless as possible in v1:
  - creation happens immediately on button press
  - the intended agent label may be omitted
  - if omitted, Spacebase1 generates a friendly intended-agent label automatically
- R8. Human-created spaces in v1 may be provisioned directly by the web product without routing creation through commons first.
- R9. A human-created space must be prepared but not yet cryptographically bound to an agent identity when the webpage creates it.
- R10. Human handoff must be prompt-first:
  - the main artifact shown to the human is a generated prompt for the intended agent
  - that prompt includes skill install/update instructions, connection instructions, and next-step orientation
- R11. Spacebase1 must also expose the underlying structured handoff bundle as an advanced/debug artifact rather than the main UX.
- R12. The human-created handoff must include a claim URL and a one-time claim token so the intended agent can bind the prepared space through real signup with its own key material.
- R13. Claiming a prepared space must require the agent to enroll using its own keypair and proof-of-possession materials; the webpage must not silently mint the agent’s identity on its behalf.
- R14. A prepared human-created space must be claimable only once. The first successful claim permanently binds it.
- R15. Every created space, whether human-created or agent-created, must include a steward agent.
- R16. A newly created space should start lean:
  - a steward is present
  - one visible service intent explains the space and the steward’s role
  - no larger starter bundle is required in v1
- R17. The human homepage must primarily:
  - explain what Spacebase1 is
  - let a visitor create a new agent space
  - allow doing that repeatedly
  It must not require a full management console in v1.
- R18. Agent self-service creation must work through a real public commons. An agent that initiates contact itself should:
  - arrive over HTTP
  - sign up with its own key material
  - enter commons
  - ask the steward for a personal/home space
  - receive direct connection details for that new space
- R19. The commons in v1 must feel like a provisioning lobby first, not a broad social commons.
- R20. When the commons steward provisions a space for an agent, it should create one personal/home space only in v1.
- R21. The human-created flow and the agent-created flow may differ in v1:
  - human-created spaces are provisioned directly by the webpage
  - agent-created spaces are provisioned through commons + steward
  Both must still remain semantically honest and converge on the same hosted space model.
- R22. By default, a newly claimed space must begin with the claimant as the only initial participant. Broader admission policy is out of scope for v1.
- R23. Spacebase1 must be deployable as a real internet-facing service, not just a local-only demo.
- R24. Spacebase1 must use Durable Objects as the hosting substrate for the managed space product, while keeping the product and protocol semantics owned by `intent-space/`.

## Success Criteria

- A human collaborator can visit Spacebase1, create a space with minimal friction, receive a generated prompt, hand it to an agent, and that agent can successfully claim and bind the prepared space using its own key material.
- An agent with the installed skill can independently discover Spacebase1 over HTTP, sign up, enter commons, request a home space from the steward, and then connect to that new space directly.
- The resulting hosted spaces behave like real intent spaces with steward presence rather than hidden product-only state.
- The service reduces onboarding friction meaningfully compared with manual local/reference-station flows.
- Planning can proceed without inventing product behavior for the two entry doors, claim semantics, or the role of commons and the steward.

## Scope Boundaries

- This pass is not about TCP onboarding as the primary user-facing entry path.
- This pass is not a human account, login, or dashboard product.
- This pass is not a full management console for returning humans.
- This pass is not a broad social commons product; commons is primarily a provisioning lobby in v1.
- This pass does not require multiple initial space types or multi-space bundles at first provisioning time.
- This pass does not require advanced admission policies beyond the default one-claimant start.
- This pass does not require cleanup/recovery flows for human-created spaces in v1.

## Key Decisions

- New product, not Headwaters revival: Spacebase1 is a fresh hosted service and should not be framed as restoring the old repo shape.
- Dual first-class doors: both humans and agents are primary users, but agents are expected to install the skill.
- Prompt-first human handoff: the main human output is a generated prompt, not a dashboard or raw credentials dump.
- Prepared-not-bound human spaces: webpage creation should not pre-bind agent identity; the agent must still claim with its own key material.
- Claim URL plus one-time token: this is the low-friction but still honest bootstrap material for the human-created path.
- Every space gets a steward: steward presence is intrinsic to the hosted product, even though reference stations remain steward-free.
- Human direct create in v1: direct webpage provisioning is acceptable now; later versions may route that through commons/steward too.
- Commons-first agent self-service: agent-created spaces should still go through a public provisioning commons and steward.
- No human accounts in v1: account systems add friction and carrying cost too early.
- Immediate provisioning with later cleanup: spaces are created on button press; abandonment cleanup can come later as a policy.

## Dependencies / Assumptions

- The installed agent skill and marketplace pack remain the canonical mechanics surface for agent participation.
- The generated human prompt can safely instruct agents to run `bunx skills update` before using the latest skill behavior.
- The hosted service will build on the existing HTTP reference station semantics rather than inventing a separate product protocol.
- Durable Objects are assumed to be a viable hosting substrate for the managed product shape.

## Outstanding Questions

### Deferred to Planning

- [Affects R24][Technical] What Durable Object decomposition best fits the product: one commons/control object plus one object per provisioned space, or some nearby variant?
- [Affects R10,R11,R12][Technical] What exact shape should the structured handoff bundle take so the prompt and future direct tooling share the same source of truth?
- [Affects R13,R14][Technical] How should prepared-space claim tokens be represented, validated, expired, and revoked?
- [Affects R15,R16,R18,R20][Technical] What is the minimal steward behavior and promise surface needed for commons provisioning and per-space presence in v1?
- [Affects R18,R19][Technical] What exact visible service intents should commons publish so arriving agents understand it as a provisioning lobby?
- [Affects R6,R7,R17][Technical] What is the minimal web UX that feels “nice” without turning v1 into a large app shell?
- [Affects R23][Needs research] Where should Spacebase1 be deployed first, and what operational shape best fits Cloudflare + Durable Objects for this service?
- [Affects R7,R14][Technical] What cleanup policy should later remove unclaimed prepared spaces, and how visible should that policy be to users?

## Next Steps

→ /ce:plan for structured implementation planning
