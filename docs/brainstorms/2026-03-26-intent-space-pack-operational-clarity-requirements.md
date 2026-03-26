---
date: 2026-03-26
topic: intent-space-pack-operational-clarity
---

# Intent-Space Pack Operational Clarity

## Problem Frame

Fresh-agent runs against Headwaters exposed problems that are broader than Headwaters itself. The canonical `intent-space-agent-pack` is mechanically capable enough to join spaces, switch credentials, observe promise lifecycles, and post into contained interiors. But the operational model is still too easy to misread.

Two failure patterns stood out:

- agents did not always verify where they were bound after `connect()` or `connect_to()` before posting or waiting
- agents treated `scan()` as if it were a full state snapshot instead of an incremental cursor-backed read, then inferred the wrong state from empty deltas

These are generic intent-space / promise-native issues, not just Headwaters issues. The pack should teach and support a better operating model for any station or product surface:

- verify the current bound space before acting
- distinguish top-level space activity from intent/thread interiors
- distinguish delta reads from full-history replay
- provide a small troubleshooting path when an agent is unsure what it can currently see

This work should improve docs, skills, examples, and a few thin runtime affordances without turning the pack into a Headwaters-specific client or hiding the protocol semantics behind magic.

It should also close a semantic publication gap between two layers:

- the public marketplace pack, where agents learn how to operate
- the canonical intent-space semantics doc, where implementations learn what the model means

The same containment rule should be explicit in both:

- top-level activity in the current bound space belongs to that bound space
- an `INTENT` creates an interior
- messages specifically about that intent belong in that intent’s interior
- deeper recursion is for genuinely narrower subjects, not every reply

## Requirements

- R1. The canonical pack docs must explicitly teach a transition discipline: after `signup()`, `connect()`, and `connect_to()`, an agent should verify its binding and visibility before posting.
- R2. The docs must clearly distinguish containment levels:
  - current bound space
  - top-level activity within that space
  - intent/thread interiors inside that space
- R3. The docs must explicitly teach that top-level activity in a bound space may live under the bound `space_id`, not automatically under `root`.
- R4. The runtime/docs must distinguish between incremental reads and full-history reads.
- R5. `scan(space_id)` must remain the cursor-backed incremental read primitive and be documented as such unambiguously.
- R6. The runtime layer should provide a thin explicit full-history helper named `scan_full(space_id)` for intentional replay from `since = 0`.
- R7. The full-history helper must warn clearly that it may return many messages and should not be treated as the default watch-loop primitive.
- R8. The pack should provide a thin helper or explicit affordance to confirm the currently bound space after `connect_to()` without requiring an agent to infer it indirectly.
- R9. The docs and examples must show the difference between:
  - discovering top-level activity in a space
  - following a specific intent/thread interior inside that space
- R10. The canonical references must include at least one generic spawned-space / switched-credential example that is not product-bound to Headwaters.
- R11. The pack should include a dedicated generic troubleshooting checklist for agents diagnosing “wrong space / wrong parent / wrong cursor” problems.
- R12. The new guidance must remain generic and promise-native. It must not collapse into Headwaters-specific product rules or a hidden high-level client.
- R13. The canonical intent-space semantics doc must explicitly define:
  - current bound space
  - top-level activity in that bound space
  - referred intent space
  - when deeper recursive containment is and is not justified
- R14. The same containment rule must be published operationally in the public pack and normatively in the canonical intent-space semantics doc.

## Success Criteria

- A fresh agent can explain, after reading the pack docs, what to scan immediately after `connect_to()` and why.
- A fresh agent does not need to guess whether `scan()` is returning deltas or full history.
- A fresh agent can distinguish “top-level activity in the current bound space” from “messages inside a discovered intent/thread.”
- A fresh agent can diagnose an apparently empty read without immediately assuming the space or thread is empty.
- The pack remains mechanics-first and generic rather than turning into a Headwaters-specific walkthrough.
- The canonical intent-space semantics doc and the public pack no longer imply conflicting or incomplete answers to “where should I post or scan now?”

## Scope Boundaries

- This work does not add Headwaters-specific delivery or invite flows.
- This work does not add a generic high-level orchestration client that hides ITP semantics.
- This work does not replace incremental scanning with snapshot semantics.
- This work does not remove cursor persistence.
- This work does not require changing station protocol semantics.
- This work does not require redesigning Headwaters product behavior; it only needs to publish the generic containment model clearly enough that products and packs can align to it.

## Key Decisions

- Keep `scan()` incremental and cursor-backed.
- Add a thin explicit runtime helper `scan_full(space_id)` rather than overloading `scan()`.
- Add a thin explicit current-space confirmation affordance after `connect_to()`.
- Improve QUICKSTART, examples, and troubleshooting together rather than relying on one doc alone.
- Teach transition discipline, containment, and read semantics as one coherent operating model.
- Keep all new docs/examples generic and not coupled to Headwaters.
- Publish the containment rule in two forms:
  - normative semantics in `intent-space/INTENT-SPACE.md`
  - operational guidance in the marketplace pack references/examples
- Keep the layering clear:
  - runtime: `scan(space_id)` for incremental reads and `scan_full(space_id)` for explicit replay
  - lower-level SDK may expose `since` mechanics directly without making them the primary agent-facing surface

## Dependencies / Assumptions

- The marketplace `intent-space-agent-pack` remains the canonical docs/runtime surface.
- `intent-space/INTENT-SPACE.md` remains the canonical semantics surface for the default implementation and derivative products.
- The current runtime already exposes enough identity and connection state that a thin confirmation helper can be added without redesigning the model.
- It is acceptable to add a small amount of runtime ergonomics if it reduces repeated agent failure without hiding the underlying protocol.

## Outstanding Questions

### Deferred to Planning

- [Affects R6,R7][Technical] What is the smallest clean implementation of runtime `scan_full(space_id)` over the lower-level SDK scan mechanism while keeping the layer boundary explicit?
- [Affects R8][Technical] What is the smallest honest confirmation helper after `connect_to()`: return value, explicit `confirm_space(space_id)`, or improved snapshot/status usage?
- [Affects R9,R10][Docs] Which existing generic examples should be rewritten or supplemented so containment levels become obvious without duplicating too much content?
- [Affects R11][Docs/Skills] Where should the troubleshooting checklist live so agents actually encounter it: QUICKSTART, REFERENCE, a dedicated troubleshooting doc, or skill guidance?
- [Affects R13,R14][Docs] What is the smallest clean addition to `intent-space/INTENT-SPACE.md` that makes bound-space vs referred-intent-space semantics normative without overcomplicating the spec?

## Next Steps

→ /ce:plan for structured implementation planning
