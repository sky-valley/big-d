---
title: Two doors — aligning external onboarding materials with the actual product surface
date: 2026-04-25
category: docs/solutions/design-patterns
module: docs
problem_type: design_pattern
component: documentation
severity: medium
applies_when:
  - "Writing external-facing copy (landing pages, blasts, agent packs) for an existing product"
  - "The product already exposes its own onboarding/entry surfaces"
  - "External materials risk drifting from the product if written without grounding"
related_components:
  - tooling
tags:
  - onboarding
  - landing-page
  - product-surface-alignment
  - agent-pack
  - welcome-mat
  - hackathon
---

# Two doors — aligning external onboarding materials with the actual product surface

## Context

We were writing the hackathon landing page for `hack.memetic.software`. The first draft had a generic "install the pack and prompt your agent to get started" instruction — the kind of thing a competent technical writer produces from first principles. It was clean, plausible, and *wrong* — not in any particular detail, but in shape: it described an idealized onboarding flow that did not match the one the product actually implements.

The user caught it bluntly: *"look at the contents of the spacebase1 project and its 2 onboarding paths."*

Reading `spacebase1/src/templates.ts` made the actual product surface obvious — there are two real entry doors, with real copy and real implementation:

1. **Door 1, the human web flow** — `spacebase1.differ.ac` shows a hero, a "Create Space" form, a generated prompt the user copies and hands to their agent, and a curl-able claim flow.
2. **Door 2, the agent HTTP flow** — `spacebase1.differ.ac/agent-setup` is a markdown doc the agent fetches, installs the `spacebase1-onboard` skill, and walks itself through commons signup → request → promise → accept → complete → bind.

The hackathon landing page's "At the hackathon" section was rewritten to mirror these two doors as `Door 01 / Door 02` — with the actual copy lifted from how each door behaves in production. The result was an external-facing artifact that tells the truth about the product, and that the user can grep for if they want to audit what the page is claiming.

## Guidance

Before writing external onboarding copy for any product the team already ships, **read the product's existing entry surfaces and let the copy mirror them**. Specifically:

1. **Identify every door.** A product with onboarding usually has 2-4: human web flow, agent HTTP flow, CLI flow, embed/integration flow. List them. If a door doesn't exist yet, do not invent it in external copy — fix the product first or describe a different door.

2. **Pull copy from the doors themselves.** The button text, the headings, the URL paths, the prompt template, the verb sequence — all of these belong to the product, not the marketing material. If your landing page says "Click Create Space → copy the generated prompt," verify those are the actual button label and the actual artifact.

3. **Ship parallel structure.** If the product has two doors, the external materials should explicitly enumerate two doors with the same names. Don't pick a favorite and hide the other. Don't conflate them.

4. **Honor the product's own honesty.** If the product surface is honest about constraints ("install, claim, agent-owned keys" — from `spacebase1/CLAUDE.md`), the external materials should be honest about the same constraints. If you find yourself writing something the product doesn't actually do, that's a signal to either fix the product or change what you wrote.

5. **Cross-link physically.** External materials should link to the actual product entry URLs, not just to a marketing page that re-describes them. If the agent flow lives at `/agent-setup`, link to `/agent-setup`. The product's own copy is the authoritative source.

## Why This Matters

External materials drift from the product *constantly* if they're written from first principles. The drift happens in three failure modes, each documented elsewhere in this repo:

- **Materials point at non-public surfaces.** [`headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md`](../integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md) documents what happened when academy materials told external agents to use `academy/skill-pack/...` — fine for repo-local runs, broken for fresh external agents because the runtime wasn't actually publicly served. *"The runtime was visible in principle, but not actually public."* Agents arrived, followed the instructions, hit dead ends.
- **Materials use academy-specific framing for a general audience.** [`2026-03-23-002-feat-root-level-intent-space-agent-pack-plan.md`](../../plans/2026-03-23-002-feat-root-level-intent-space-agent-pack-plan.md) documents the rewrite that pulled the canonical agent pack out of academy framing because external agents arriving fresh couldn't make sense of dojo-shaped instructions. *"External-agent-first framing... docs no longer depend on academy/dojo framing for conceptual clarity."*
- **Materials describe a flow that is half-built.** When the marketing surface promises "just sign up and post an intent" but the actual sign-up flow has three uncovered branches, the external materials get blamed for product gaps that they merely surfaced. The fix is to either ship the missing branches first or write copy that describes only what works.

The cost of drift is paid by every newcomer who follows the materials, hits a dead end, and either gives up or files a bug. The fix is cheap — read the product's existing surfaces *before* writing the marketing material — but only if the discipline is named so people remember to apply it.

A secondary win: marketing materials that mirror the product become *living docs*. When the product changes a button label or a flow step, the marketing material needs to change too — and someone notices, because the link is direct. Materials written from first principles drift silently.

## When to Apply

- The product has an existing onboarding flow with real users / agents going through it.
- You are writing landing pages, blasts, agent packs, demo scripts, or any external-facing material that describes how to use the product.
- The product is changing fast enough that "from-first-principles" copy will be wrong by next week.
- You can name each door in 1-2 sentences. (If you can't, the product has too many doors and the external material is going to be confusing regardless.)

Do not over-apply when:

- The product is being announced *before* it exists — there are no doors yet to mirror; the external material is the spec, and you're writing the door spec, not describing it.
- You're describing a non-onboarding aspect (architecture explainer, philosophy doc, retrospective) where the marketing surface intentionally abstracts away from product details.

## Examples

### The change in this session

**Before** (drafted from first principles, never shipped):

> ## At the hackathon
>
> You won't write protocol code. You'll tell your agent what to do, and the agent talks to the space.
>
> Install the pack so Claude Code knows the protocol:
> ```
> /plugin marketplace add https://github.com/sky-valley/claude-code-marketplace.git
> /plugin install intent-space-agent-pack@skyvalley-marketplace
> ```
>
> Then prompt your agent: *"Connect to spacebase1.differ.ac. Post an intent..."*

That copy has three problems: (1) the install command is the user's job, not the agent's, but spacebase1's actual flow has the agent install its own onboarding skill via curl; (2) "Connect to spacebase1" is not a thing the protocol calls — the protocol calls it "enroll" and there are two distinct enrollment paths; (3) it conflates the human web door and the agent HTTP door into one undifferentiated step.

**After** (mirrored to the actual product):

> ## At the hackathon
>
> Two doors. Pick whichever is faster for you.
>
> **Door 01 — Through the website.** Go to spacebase1.differ.ac, click Create Space, copy the generated prompt, and paste it into Claude Code or Codex. The prompt installs the onboarding skill, claims the prepared space, and binds it. ~2 minutes.
>
> **Door 02 — Through your agent.** Tell your agent: *"Set me up on spacebase1.differ.ac. Follow the instructions at /agent-setup."* The agent reads the doc, installs the onboarding skill, signs up through the commons steward, and provisions itself a private home space through the full PROMISE → ACCEPT → COMPLETE lifecycle.
>
> Either door, you end up with a bound home space and an agent that knows the protocol. There's no anonymous write surface — every post is signed with key material your agent owns.

The "after" version uses the actual button label ("Create Space"), the actual flow words ("claim and bind," "PROMISE → ACCEPT → COMPLETE"), the actual URL (`/agent-setup`), and explicitly enumerates both doors. If anyone audits whether the page tells the truth, they can grep `spacebase1/src/templates.ts` and confirm.

### Pre-flight checklist when writing external onboarding copy

- [ ] Have I identified every door the product actually exposes?
- [ ] Am I using the product's actual button labels, URL paths, and flow verbs?
- [ ] Did I explicitly enumerate parallel structure (e.g. "Door 01 / Door 02"), or did I quietly pick a favorite?
- [ ] Am I linking to the product's own entry URLs, not just a marketing summary?
- [ ] If I had to defend this copy by greping the product source code, would the grep succeed?
- [ ] Is there anything in this copy that would silently drift if the product changed a label or a flow step? Can I add a link that would force the drift to be visible?

## Related

**Canonical implementations the new doc mirrors:**

- `docs/plans/2026-04-06-001-feat-spacebase1-agent-native-self-service-plan.md` — the agent self-service flow that became Door 02
- `docs/architecture/spacebase1-product-flow-addendum.md` — the product surface spec that pins the human and agent flows
- `spacebase1/src/templates.ts` — `renderHomepage()` is Door 01; `renderAgentSetup()` is Door 02; both functions are the source of truth for the copy in `hack.memetic.software`
- `claude-code-marketplace/plugins/intent-space-agent-pack/SKILL.md` — the agent-facing pack that Door 02's `/agent-setup` instructs the agent to install

**Cautionary precedents (drift failure modes documented elsewhere):**

- `docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md` — materials pointed at non-public surfaces; fresh agents failed silently
- `docs/plans/2026-03-23-002-feat-root-level-intent-space-agent-pack-plan.md` — materials used academy-specific framing for a general audience; required a rewrite once the audience was real
- `docs/solutions/integration-issues/headwaters-did-not-need-a-public-reference-agent-once-the-runtime-pack-was-honest-20260323.md` — once the product surface was honest, an extra "convenience" reference agent stopped being necessary

**Adjacent (the design principle this rests on):**

- `docs/solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md` — product redesigns that make the surface documentable honestly enable external materials to stop inventing
- `docs/solutions/architecture-patterns/public-read-surface-for-protocol-bound-state-2026-04-25.md` — the route-level instance of "if a new shape of access shows up, give it its own surface, do not retrofit the protocol"
