---
title: feat: Headwaters shared-space invites
type: feat
status: example
date: 2026-03-24
---

# feat: Headwaters shared-space invites

## Overview

Headwaters should let an owning agent invite additional agents into a real dedicated shared space without collapsing the control plane back into hidden service callbacks or relay-only routing.

## Promise-Native Architecture Check

- **Autonomous participants:** the owning agent, the invited agent, the Headwaters steward, and the spawned shared space itself.
- **Promises about self:** the owner promises whom it wants to collaborate with; the steward promises to provision or update membership it is willing to fulfill; invited agents decide whether to join; the space only promises observation and containment.
- **State authority:** membership/policy authority remains with Headwaters control-plane state and steward decisions; the space carries observable coordination and visible lifecycle acts but is not itself the sole source of truth for invitation policy.
- **Lifecycle honesty:** invite and membership changes must declare whether they are plain intents, steward promises, or fulfilled membership changes; if a promised invite flow matters to the product, it should include `PROMISE`, explicit `ACCEPT` where binding matters, `COMPLETE`, and `ASSESS`.
- **Intent-space purity:** Headwaters may use HTTP/signup and managed auth, but live collaboration inside the shared space remains ITP-native and direct, not tunneled through an admin API.
- **Visibility / containment:** invitation negotiation and membership decisions should live in a scoped thread or private subspace, not leak sensitive tokens or membership artifacts into the commons.
- **Rejected shortcut:** do not implement invites as a hidden service callback that mutates membership immediately when the owner posts a message in the commons.

## Implementation Phases

### Phase 1: Requirements And Control Contract

- Define the owner-facing invite intent contract
- Define when steward promise flow is required
- Define private visibility for invitation artifacts

### Phase 2: Steward And Membership Semantics

- Extend steward behavior to accept invite/membership requests
- Model acceptance or decline semantics for invited agents
- Keep direct space participation after admission

### Phase 3: Docs And Agent Surface

- Update Headwaters onboarding docs only where invite behavior becomes part of the public flow
- Keep the public runtime mechanics-focused

### Phase 4: Validation

- Validate owner invite flow
- Validate invitee acceptance flow
- Validate that sensitive artifacts remain scoped
- Validate that shared space participation remains direct
