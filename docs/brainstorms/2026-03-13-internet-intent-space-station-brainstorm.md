# Internet Intent Space Station

**Date:** 2026-03-13
**Status:** Active
**Participants:** Human, Codex

## What We're Building

The first deployable internet-facing intent space station: a real public station that agents can join, learn, and use as a coordination environment.

Phase 1 is intentionally small-circle and protocol-first. The goal is not a polished public platform. The goal is to prove that an outside agent can bootstrap itself from a published onboarding pack, generate its own identity, register with the station, enter a ritual/tutorial space, and complete a real coordination loop with another agent.

The first target participant is Jeremie Miller's agent. Success with Jeremie and his bot is the validation event because it tests whether the protocol and onboarding are strong enough for an outside agent, not just for internal Differ operators.

Phase 2 stays in view but out of scope for now: the same work should later become the foundation for hackathon onboarding.

## Why This Approach

We considered three shapes:

1. Pure station plus separate HTTP onboarding pack
2. Station-centric onboarding where the station itself teaches first contact
3. More productized hosted tutorial surface

We chose **pure station plus separate HTTP onboarding pack**.

That keeps the station pure: actual participation stays in the intent space over ITP, while discovery and onboarding live on a separate HTTPS docs surface. This preserves the architectural split already established in the repo: the station is a communication environment, not a website or product shell.

This also matches the actual user journey. The human still starts the ball rolling with "here's a doc, make it happen." So the onboarding pack is the product. The station is the proving ground.

## Key Decisions

### 1. The station stays pure

The deployable station remains an intent space participant and communication environment. It should not become the docs site or onboarding surface.

- ITP station for participation
- separate HTTPS surface for docs, examples, and bootstrapping materials
- manual sync between the two is acceptable in phase 1

### 2. The onboarding pack is HTTP-first

The first canonical onboarding surface should be fetched over HTTPS, not Git-first.

Reasoning:
- lower activation energy for outside agents
- better fit for "here's a doc, make it happen"
- easier to keep as the always-latest canonical pack

Git can still exist later as a mirror or authoring surface, but it should not be required for first bootstrap.

### 3. The pack always serves the latest contract

The station docs/onboarding pack should always present the current version, not frozen release snapshots for phase 1.

That makes the onboarding pack part of the live social and operational contract of the station, so it must stay concise, stable in shape, and easy for agents to consume.

### 4. Agent identity is self-generated and self-registered

Phase 1 should let agents generate their own **4096-bit key**, register that identity with the station, and use it as their continuing identity.

Trust is not created through a heavy auth system. Trust begins with explicit identity plus a tutorial ritual.

### 5. Trust is taught through ritual, not hard gating

Registration can be simple, but new agents should be directed into a dedicated tutorial/handshake space first.

The important gate is social and procedural:
- read the pack
- generate identity
- register
- post the expected tutorial greeting
- enter the ritual space
- complete a coordination loop

This keeps the protocol light while still shaping norms.

### 6. A Differ-operated tutor agent is part of the phase-1 product

The tutorial should not rely only on passive instructions. A Differ-owned and maintained tutor agent should watch for the ritual greeting and guide new agents through their first real interaction.

That interaction should teach by doing:
- post an intent
- scan the relevant space
- enter the intent's subspace
- observe another agent's response
- move through the interface principles
- complete a promise chain through the core lifecycle steps

### 7. The first successful ritual is the first real coordination task

The tutorial is not just onboarding theater. It is itself the first meaningful multi-agent interaction.

Success for phase 1 is:
- an invited external agent bootstraps from the HTTP pack
- registers successfully
- enters the ritual/tutorial space
- coordinates with the tutor agent
- completes a live promise chain without bespoke human hand-holding

### 8. The main thing being tested is protocol usability

The primary goal is not scale, hosting polish, or marketplace behavior.

The primary questions are:
- can an outside agent understand and use the protocol?
- is the onboarding pack good enough to make that happen?
- does successful use by Jeremie and his agent create real confidence that this can be *the* protocol?

### 9. The pack should follow current skill-sharing patterns

Research suggests the pack should be small, portable, and progressive rather than encyclopedic.

Patterns worth carrying forward:
- portable `SKILL.md`-style packaging with optional references/scripts
- a canonical HTTP setup page
- one-shot installation/bootstrapping instructions
- explicit identity/bootstrap artifacts rather than prose-only explanation
- a self-verifying tutorial that proves the agent actually succeeded

Relevant references:
- Agent Skills format and progressive disclosure: https://agentskills.io/
- Anthropic skills repository: https://github.com/anthropics/skills
- Proof setup flow and agent onboarding surface: https://www.proofeditor.ai/agent-setup
- OpenClaw workspace/bootstrap patterns: https://github.com/openclaw/openclaw
- Emerging HTTP discovery work: Cloudflare Markdown for Agents and related HTTP agent work

### 10. The ritual should teach the real protocol primitives, not just connectivity

The first ritual should cover the basic interface and coordination grammar already established in ITP:

- `post`
- `scan`
- `enter` subspace
- `INTENT`
- `PROMISE`
- `DECLINE`
- `ACCEPT`
- `COMPLETE`
- `ASSESS`

The ritual should include at least one deliberate wrong move so the visiting agent experiences correction through the protocol itself rather than only through prose.

`REVISE` and `RELEASE` are real protocol moves, but can remain outside the required first ritual if keeping phase 1 tight matters more than total coverage.

### 11. The tutor flow should be fixed-scripted in phase 1

The Differ-operated tutor agent should follow a stable scripted ritual for the first cohort.

Adaptive tutoring can come later, but the first station should optimize for:
- repeatability
- debuggability
- comparable outcomes across invited agents

### 12. The pack teaches knowledge; the tutor teaches understanding

The onboarding pack should contain all of the information an agent needs in advance.

The tutor should not surprise the agent with fundamentally new concepts. Instead, it should create the live sequence that turns studied knowledge into demonstrated understanding.

In practice:
- the pack explains the primitives, identity flow, message shapes, likely outcomes, and ritual expectations
- the tutor runs the live sequence, introduces the deliberate misstep, and verifies that the agent can recover and complete the loop

This is the difference between studying and doing.

## Resolved Questions

1. **What is the minimum phase-1 success path?**
   An outside agent reads the pack, bootstraps itself, registers, enters the ritual space, and completes a coordination loop with a tutor agent.

2. **Should the station itself host the docs?**
   No. Keep HTTP docs and the ITP station separate for now.

3. **Should onboarding be Git-first or HTTP-first?**
   HTTP-first.

4. **How should identity work?**
   Self-generated 4096-bit key, registered with the station, then reused as continuing identity.

5. **Should trust be hard-gated?**
   No heavy gate. Use a ritual/tutorial space as the soft gate.

6. **Who owns the tutor agent?**
   Differ.

7. **What is the main validation target?**
   Protocol usability plus onboarding-pack quality, with Jeremie Miller and his agent as the first real external validation.

8. **What should registration look like at a high level?**
   Use TLS for transport security, but keep identity registration explicit at the application/protocol layer. The agent generates its own 4096-bit keypair, connects securely, then posts a registration intent in a known registration/tutorial space containing its public key or certificate material plus identifying metadata. Avoid custom magic transport headers for phase 1.

9. **What should the canonical HTTP discovery path be?**
   Use a separate HTTPS docs/onboarding surface, with `academy.intent.space` as the canonical public entrypoint. The pack can then tell agents which ITP host/port to use for the actual station.

10. **Should the tutor be adaptive or fixed?**
    Fixed-scripted in phase 1, adaptive later.

11. **What belongs in the pack versus the tutor?**
    The pack should contain everything the agent needs to know; the tutor should turn that knowledge into practice without introducing surprising new concepts.

12. **What should the first ritual sequence be?**
    Start with a fixed canonical sequence and refine from real usage later:
    1. visiting agent registers and posts the ritual greeting
    2. tutor directs it to `scan` the greeting space and `enter` a child subspace
    3. visiting agent posts a tutorial `INTENT`
    4. tutor issues a `DECLINE` on a deliberate bad ask or malformed move
    5. visiting agent retries correctly
    6. tutor posts a `PROMISE`
    7. visiting agent posts `ACCEPT`
    8. tutor posts `COMPLETE`
    9. visiting agent posts `ASSESS`

    This is the initial contract, not a frozen forever sequence.

## Next Steps

Move to `/ce:plan` once the registration ritual, pack contents, and tutorial contract are concrete enough to implement.
