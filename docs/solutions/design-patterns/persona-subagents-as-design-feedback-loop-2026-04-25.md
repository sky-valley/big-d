---
title: Persona subagents as a design feedback loop
date: 2026-04-25
category: docs/solutions/design-patterns
module: docs
problem_type: design_pattern
component: documentation
severity: medium
applies_when:
  - "Reviewing copy, marketing materials, or interaction design before shipping"
  - "Audience is heterogeneous and the team can name 3-5 distinct archetypes"
  - "You can profile each archetype in 3-4 sentences without losing texture"
  - "Iteration speed matters more than statistical rigor"
related_components:
  - tooling
tags:
  - design-review
  - copy-review
  - persona
  - subagent
  - parallel-feedback
  - hackathon
---

# Persona subagents as a design feedback loop

## Context

Before shipping the hackathon 1-pager (`hack.memetic.software`) we needed external feedback on whether the copy was actually going to land — and from whom. The audience was the kind of crowd that shows up to a NYC weekday-evening hackathon on an esoteric subject in 2026: a mix of startup engineers, indie hackers, distsys veterans, AI/ML researchers, and designer-types. They'd read the copy in five very different ways. A single pass of self-review couldn't simulate any of them honestly.

Getting five real humans to read a draft and give in-voice feedback in 30 minutes is not a thing. So we did the next best thing: profiled five archetypes in detail (Maya the startup engineer, Devon the indie hacker, Raghav the distsys veteran, Priya the AI/ML researcher, Sam the designer), spawned a subagent for each one with strict instructions to stay in voice, and read the five returned critiques side-by-side.

The result was sharper than any single review pass would have produced — convergent praise on one specific line ("every intent is itself a space, you go inside it"), convergent demand for a paragraph the page was missing (contention/fairness/abuse), and informative *divergence* on the curl block (one persona converted on the spot; another bounced from it). The page was revised against those patterns and shipped within an hour.

The pattern is a workflow primitive that should compound — same shape, different copy, every time we ship something audience-facing.

## Guidance

When you have a draft and need feedback before shipping, **profile 3-5 audience archetypes in voice and spawn one subagent per persona** with three constraints: stay in character, return the response in the persona's native medium (Slack DM, voice memo, LinkedIn comment, text-to-friend), and don't be polite.

Mechanics:

1. **Profile carefully.** Each persona gets 3-4 sentences naming who they are, what they know, what they don't know, and what they care about. Aim for sharp differentiation: a startup engineer is *not* an indie hacker, even if both ship code. The differentiation is what makes the parallel review surface different signals.

2. **Spawn one subagent per persona, in parallel.** Each prompt should include the persona's full profile, the situational framing (how/where they encountered the artifact), the artifact verbatim, and a brief asking for honest reactions in the persona's voice with a length cap (~200 words). The "in voice" constraint is doing real work — it forces the subagent to stay in character rather than slipping into reviewer-mode generic feedback.

3. **Look for convergence and divergence patterns.** Convergent praise → keep that line, it landed for everyone. Convergent criticism → fix it, it failed for everyone. Divergent reactions → investigate why; usually it means the artifact serves one persona at the cost of another and you have to choose. The pattern surfaces what no single critic could.

4. **Synthesize, don't average.** The output of the loop is not a "consensus document" — it's a list of patterns plus the in-voice quotes that surfaced them. The artifact's revision should be calibrated against the patterns, not against any individual critic's preferences.

5. **Keep the personas reusable.** The five archetypes from this session are durable enough to use again next time we ship something hackathon-adjacent. Store profiles as artifacts (see "Examples" below) so the next pass starts from "use the existing roster, swap in the new artifact" instead of "re-profile from scratch."

## Why This Matters

Single-pass review misses things. The reviewer (you) has one set of priors and one tone. The artifact lands on people with very different priors and tones. The mismatch is the whole problem.

Three failure modes the persona loop guards against:

- **Writing for an imaginary unified audience.** When you write to "the audience" you write to no one. The persona loop forces you to admit the audience is plural and to see the copy through each member's eyes. Convergence reveals the genuinely shared signal; divergence reveals the choices you didn't know you were making.

- **Missing patterns that only emerge across multiple voices.** No single critic would have surfaced the pattern that "the curl block converted Devon and bounced Sam" — that's a pair-wise comparison only visible when you have both critiques in front of you. Single-reviewer loops literally cannot produce that signal.

- **Over-weighting a single critic's taste.** If you ask one trusted person to review, you absorb their priors. The persona loop dilutes any single voice and makes it easy to spot when one critic's complaint is idiosyncratic rather than representative.

A separate compounding benefit: *profile artifacts are durable*. Once you've written a sharp 4-sentence Maya-the-startup-engineer profile, you have her forever. The next artifact you ship to a similar audience starts at "spawn the same five" rather than "profile from scratch." This is the same DNA-level pattern as [agent-profiled swarm eval](../../plans/2026-03-25-002-feat-agent-profiled-swarm-eval-plan.md), which uses a fixed roster of agent profiles for evaluation runs — the pattern there is "deterministic profile assignment, profile metadata is first-class, results are comparable across runs." This pattern is the copy-review cousin of that one.

The loop is also *cheap*. Five subagent dispatches in parallel return in 30-60 seconds; a revision of the artifact follows in another 20 minutes. The whole loop fits in under an hour. There is no real-human equivalent that runs this fast, even if you had five real humans on call.

## When to Apply

- You have a draft of audience-facing material and ~30-60 minutes before you'd ship.
- The audience is heterogeneous and you can name the archetypes (3-5 is a sweet spot — fewer than 3 misses pattern, more than 5 dilutes the signal).
- The artifact is short enough to fit in each persona prompt verbatim (1-page docs, landing page sections, short emails, prompt templates).
- The cost of getting it wrong with the audience is meaningfully higher than the cost of an extra review pass.

Do not over-apply when:

- The artifact is internal-only and the team is the only audience.
- You'd ship to one specific known person and you can ask them directly.
- The artifact is long-form (full essays, technical specs) — the prompt cost gets prohibitive and the personas would skim, not read.
- You've already run two persona passes on the same artifact — diminishing returns set in fast; trust the patterns you have.

## Examples

### The five personas used in this session

These are reusable. Store them as artifacts; reuse for the next hackathon-adjacent artifact.

- **Maya, 30** — startup engineer at a NYC AI-native Series A. Ships agent products in production. Knows Kafka, NATS, MCP. Pattern-matches new abstractions to known ones; respects clean abstractions when they earn it; impatient with marketing language. *Native medium: Slack DM to a friend.*
- **Devon, 28** — indie hacker / vibe coder. Ships Claude Code projects on weekends. Doesn't know distributed systems deeply. Loves clean primitives. Wants to ship something tweetable in 3 hours. *Native medium: voice memo to self / Twitter thread.*
- **Raghav, 42** — distributed systems veteran at a NYC fintech. Built Kafka pipelines. Knows Linda tuple spaces from an actual paper. Calibrated; not a hype-believer or a hater. Will surface specific technical questions the artifact ducked. *Native medium: LinkedIn comment / engineering Slack.*
- **Priya, 33** — research scientist at a NYC AI lab. Thinks about cooperative AI and multi-agent RL. Patient with abstraction; impatient with hype. Wants to know what's intellectually novel. *Native medium: Notion note to self.*
- **Sam, 27** — designer at a small AI-native consumer startup. Strong product designer, soft spot for AI art and creative coding. Doesn't live in a terminal. Bounces hard from anything that requires CLI gymnastics in the first 10 minutes. *Native medium: text to friend.*

### Prompt template (one-line skeleton — see this session for full version)

```
You are <NAME>. Stay in character.

WHO YOU ARE: <3-4 sentence profile>

THE SITUATION: <1-2 sentences on how you encountered the artifact>

WHAT TO DO: React in your own voice — what you'd actually <write/say> after reading this.
Be specific:
  - <3-5 specific questions to push the persona on>
Length: ~200 words. <Native-medium reminder>.

THE ARTIFACT:

<paste verbatim>
```

### What the loop produced this session

Convergent praise (4 of 5 personas):
> "every intent is itself a space, you go inside it" — named as the line that elevated the page above pub/sub.

Convergent criticism (3 of 5 personas, technical-leaning):
> No paragraph addressed contention / fairness / abuse. *"What happens when 200 agents scan the same intent and all decide to help?"*

Informative divergence:
> Curl block — Devon converted on the spot ("typed it into a-shell, saw my hello pop up, that closed it for me"). Sam bounced ("eyes literally just slid past, saw the dollar signs and noped"). Pattern: the curl block was the right call for one persona and the wrong call for another; the revision moved the curl below a no-account observe link so Sam doesn't bounce before reaching it.

The synthesis took ~10 minutes; the revision took another 20. The artifact shipped meaningfully sharper than the v1 draft, and the pattern is reusable for the next ship.

## Related

**Foundational precedent (the DNA-level ancestor):**

- `docs/brainstorms/2026-03-25-agent-profiled-swarm-eval-requirements.md` and `docs/plans/2026-03-25-002-feat-agent-profiled-swarm-eval-plan.md` — agent-profiled swarm evaluation. Same shape (deterministic profile assignment, parallel execution, profile-as-first-class-metadata, results comparable across runs) applied to *agent task evaluation* rather than *copy review*. Borrow patterns: store profile metadata on every artifact, keep the roster fixed across runs, surface profile column in summary tables.

**Methodological precedent (iterate-with-fresh-eyes loop):**

- `docs/solutions/integration-issues/headwaters-needed-a-public-pack-and-repeatable-claude-loop-for-fresh-agent-feedback-20260323.md` — repeatable fresh-agent feedback loop where each iteration narrowed the complaint. The persona loop should follow the same shape: draft → multi-voice critique → synthesis → revise → optional second pass with new personas to check convergence.

**Adjacent infrastructure (operational patterns to borrow):**

- `docs/runbooks/dojo-agent-evaluation-harness.md` (and brainstorm at `docs/brainstorms/2026-03-14-dojo-agent-evaluation-harness-brainstorm.md`) — workspace isolation per run, summary JSON with metadata, timeline markdown indexed by actor. Borrow: per-persona artifact path so critiques are individually inspectable.

**Companion pattern (separating audience surfaces):**

- `docs/solutions/architecture-patterns/public-read-surface-for-protocol-bound-state-2026-04-25.md` — the principle that different audiences need different surfaces, applied at the route level. Same instinct applied at the design-review level here: do not homogenize feedback across personas; keep their voices distinct.
