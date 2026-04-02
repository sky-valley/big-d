---
title: Promise-native planning guardrails
date: 2026-03-24
status: active
---

# Promise-native planning guardrails

Use this doc when planning work in `big-d` that touches:

- `intent-space/`
- `tcp-reference-station/`
- `loop/`
- any promise lifecycle
- any agent control surface or managed coordination flow

This is not a general architecture essay. It is a pre-plan pressure test.

## Why this exists

Generic planning workflows are good at producing implementable phases. They are not good at preserving Promise Theory automatically.

Without an explicit check, plans drift toward:

- embedded callbacks instead of real participants
- imperative service control instead of autonomous promises
- HTTP or admin layers colonizing ITP semantics
- vague “success” without `ASSESS`
- state authority silently migrating into the intent space

This repo has already hit those failures. Use this doc to prevent repeating them.

## The checks

Every plan for promise-native work should answer these questions explicitly.

### 1. Who are the autonomous participants?

Name the real actors.

If the design talks about “the system” doing something, that is usually too vague. Ask:

- which participant observes?
- which participant decides?
- which participant promises?
- which participant fulfills?
- which participant assesses?

If a social act appears on the wire, a real participant should own it.

### 2. Are promises about self?

Promise Theory is about what an agent says it will do, not what it commands others to do.

Pressure test:

- Is a participant promising its own behavior?
- Or is the plan hiding centralized control behind a friendly name?

Red flag:

- “The steward/service auto-creates X when it sees Y” with no real promise/acceptance boundary.

### 3. Where is state authority?

The intent space is observational and containment-oriented. It is not automatically authoritative just because messages pass through it.

Every plan should state:

- what is authoritative state?
- what is projected for visibility?
- what can be reconstructed from observation vs what must be persisted elsewhere?

Red flag:

- lifecycle truth drifting into stored space messages without an explicit authority model.

### 4. Is the promise lifecycle modeled honestly?

If the product claims a flow is promise-native, the plan should model the real lifecycle rather than a shortcut.

At minimum, ask:

- does this need `INTENT`?
- does it need `PROMISE`?
- does it need explicit `ACCEPT`?
- does it need `COMPLETE`?
- does it need `ASSESS`?
- does `RELEASE` matter on failure or cancellation?

Not every feature needs the full chain. But if the chain is omitted, the plan should say why.

Red flag:

- a feature described as promise-native that is implemented as a direct callback or synchronous service reply.

### 5. Does the design preserve intent-space purity?

ITP exists for a reason. Auth, management, onboarding, and transport layers can complement it, but they should not erase its native semantics.

Pressure test:

- are we keeping promise-native and spatial semantics endemic on the wire?
- or are we stuffing HTTP/admin state machinery into the protocol until it stops being ITP in spirit?

Red flag:

- control/auth layers becoming the semantic center of the protocol.

### 6. Is visibility scoped correctly?

Containment and privacy are part of the architecture, not an afterthought.

Ask:

- where should the act be visible?
- who can see the root declaration?
- who can see the interior thread or subspace?
- where should fulfillment artifacts appear?

Red flag:

- sensitive coordination or fulfillment artifacts leaking into a public commons because the plan never discussed visibility.

### 7. What shortcut was rejected?

Good plans should say what tempting implementation shortcut was considered and rejected because it violated the stance.

Examples:

- embedded callback instead of real participant
- hidden relay instead of direct participation
- fake subspace instead of real dedicated space
- bearer-style control instead of proof-of-possession continuation

If the plan never names the tempting shortcut, it probably has not really pressure-tested the architecture.

## Required plan section

Plans covered by this doc should include a section named:

`## Promise-Native Architecture Check`

That section should answer, briefly:

- autonomous participants
- promise lifecycle
- state authority
- intent-space purity
- visibility / containment
- rejected shortcut

## Red flags that should block or revise a plan

- An embedded service callback replaces a real participant
- A “promise-native” flow omits the actual lifecycle without explanation
- `ASSESS` is missing where fulfillment quality matters
- State authority silently moves into the space
- A relay/proxy becomes the mandatory path without explicit justification
- Auth/management concerns replace ITP semantics rather than complementing them
- Sensitive fulfillment details have no scoped visibility model

## Sources

Local learnings:

- [welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md](../solutions/architecture/welcome-mat-cutover-kept-itp-pure-by-splitting-http-signup-from-station-auth-20260323.md)
- [promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md](../solutions/architecture-decisions/promise-native-runtime-should-keep-space-primitive-and-thread-derived-20260316.md)

Promise Theory sources:

- [Promise Theory FAQ](https://markburgess.org/promiseFAQ.html)
- [Book of Promises](https://markburgess.org/BookOfPromises.pdf)
- [Architecture and Security](https://markburgess.org/archive/manuals/st-security)
- [Structure and criteria for service assessment in promise theory](https://markburgess.org/blog_virtual.html)
