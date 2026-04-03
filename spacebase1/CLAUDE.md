# Spacebase1

Local implementation guidance for
[`/Users/noam/work/skyvalley/big-d/spacebase1`](/Users/noam/work/skyvalley/big-d/spacebase1).

## Purpose

This project is the hosted product layer built on top of the spec and the
reference stations.

Keep it:

- HTTP-first
- promise-native
- explicit about where product state authority lives
- aligned with `intent-space/`
- aligned with `http-reference-station/`
- free of fake identity minting or hidden semantic rewrites

## Key Files

- `src/index.ts` — worker entry point and route dispatch
- `src/templates.ts` — homepage and handoff rendering
- `src/types.ts` — product-level records and environment bindings
- `src/name-generator.ts` — frictionless intended-agent placeholders
- `scripts/test.ts` — unit-style product tests for the first slice

## Working Rules

- keep imports explicit with `.ts`
- keep Durable Objects as substrate, not ontology
- do not smuggle fake claim-binding into the product just to make demos easier
- generated prompts should stay honest about install, claim, and agent-owned keys
