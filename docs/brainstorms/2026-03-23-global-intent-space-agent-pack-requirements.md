---
date: 2026-03-23
topic: global-intent-space-agent-pack
---

# Global Intent Space Agent Pack

## Problem Frame

The repo currently exposes the most agent-oriented intent-space materials through `academy/skill-pack`, but that pack is framed around academy onboarding and dojo completion rather than intent space as a general substrate.

We want a new root-level canonical pack/plugin that can orient an external agent from zero knowledge, teach the intent-space model and mechanics clearly, and help the agent participate competently without scripting its behavior or stepping on its autonomy.

This pack should become the long-term entry point. Academy-specific onboarding is transitional and should not define the general surface.

## Requirements

- R1. The repo must provide a new root-level canonical agent pack/plugin for intent space.
- R2. The pack must be designed for an external agent with no prior repo context.
- R3. The pack must explain what intent space is in general terms, including its purpose, model, and key properties.
- R4. The pack must teach the fractal nature of the environment clearly: a space can contain intents, each intent is also a space, and spaces can nest indefinitely.
- R5. The pack must teach how an agent can join or connect to an existing space.
- R6. The pack must teach how an agent can create its own intent space.
- R7. The pack must teach how an agent can observe a space, read intents, enter subspaces, and navigate nested spaces correctly.
- R8. The pack must teach how an agent can post intents and optionally make promises, while making clear that agents are free to decline or ignore intents.
- R9. The pack must distinguish real protocol invariants from optional patterns or suggestions so agents are not over-directed.
- R10. The pack must minimize protocol mistakes, including attempts to perform actions the environment does not support.
- R11. The pack must reuse the existing mechanics surface from the current academy SDK/runtime as the starting point, while reworking the surrounding markdown/docs into general intent-space materials.
- R12. The pack must provide a concise orientation surface plus reference materials and runtime pointers, following the useful shape of the current academy pack without carrying academy-specific framing into the canonical entry point.
- R13. The first iteration must focus on the prompt/docs/skill surface rather than SDK/runtime experimentation.

## Success Criteria

- External agents can understand the intent-space model from the new root-level pack without needing the academy context.
- Agents can participate with fewer protocol and environment-model mistakes.
- Agents understand that participation is elective: they may observe, engage, decline, or ignore intents based on their own judgment.
- Agents can correctly reason about nested spaces and the fact that each intent is also a space.
- The new pack stands on its own as the canonical entry point for intent-space participation.

## Scope Boundaries

- The first iteration does not optimize or redesign the SDK/runtime surface.
- The first iteration does not define an A/B testing plan for prompt variants.
- The first iteration does not depend on academy remaining the long-term entry point.
- The pack should not prescribe agent goals, enforce behavioral policy, or imply that agents must pick up work they observe.
- The pack should not turn intent space into a workflow engine or collapse the distinction between desire space and promise authority.

## Key Decisions

- Root-level canonical pack: the long-term entry point should live at the repo root rather than under `academy/`.
- Directory name: the new root-level canonical pack should live in `agent-pack/`.
- External-agent-first: the pack should work for agents with no repo familiarity.
- Reuse existing mechanics: start from the current academy SDK/runtime rather than inventing a new mechanics surface immediately.
- Docs/prompt first: the first iteration should improve understanding and participation through the skill/docs layer before runtime changes.
- Autonomy-preserving guidance: the pack should orient and inform, not script or coerce.
- Fractal model is core content: nested spaces are not an advanced appendix; they are a first-class concept the pack must teach clearly.
- Structure parity with academy: `agent-pack/` should contain `SKILL.md`, `references/`, and `sdk/`.
- SDK carryover: the lower-level SDK file can be copied as-is initially; the markdown materials should be rewritten for the broader intent-space scope.

## Dependencies / Assumptions

- The existing academy SDK/runtime is a valid starting mechanics surface for extraction or reuse.
- Academy-specific materials can be separated from general intent-space guidance cleanly enough for a canonical pack to emerge.
- External agents may be given one or more URLs or entry documents and are expected to learn from those materials without repo archaeology.

## Outstanding Questions

### Resolve Before Planning

- None currently.

### Deferred to Planning

- [Affects R11][Technical] Which existing academy files move, which are copied, and which remain academy-specific consumers?
- [Affects R10][Needs research] What protocol and environment mistakes occur most often in current agent runs, and which docs changes would reduce them most?
- [Affects R12][Technical] How should the orientation doc, concept docs, forms/examples, and runtime references be organized for the best external-agent reading path?

## Next Steps

→ /prompts:ce-plan for structured implementation planning
