---
title: feat: Headwaters live observatory UI
type: feat
status: active
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-headwaters-live-observatory-ui-requirements.md
---

# feat: Headwaters live observatory UI

## Overview
Build a separate, throwaway-but-principled demo app that observes live Headwaters activity and makes intent-space containment legible as rooms rather than lists. The app should not live inside `headwaters/` and should not become part of the Headwaters control plane. It should run on the same machine, use the same local filesystem/network access, and translate live Headwaters activity into a themeable room/event model that can be presented clearly in a five-minute demo.

This plan carries forward the core decisions from the requirements doc: Headwaters-only v1, spatial rooms rooted in the commons, emergent private and spawned spaces, human-readable semantic events, manual operator control, and a separable room/event view model (see origin: `docs/brainstorms/2026-03-24-headwaters-live-observatory-ui-requirements.md`).

## Problem Statement / Motivation
The current repo can explain Headwaters in docs and terminal transcripts, but that is not the same as making “space” obvious in a live demo. A compelling demo needs the audience to immediately see:
- the commons as a real place
- private request interiors as real bounded rooms
- spawned spaces as distinct connected places
- the promise-native provisioning chain as visible activity inside those places

A generic dashboard or transcript UI would undermine the point. The demo needs a live observatory that remains faithful to intent-space principles while still being visually strong enough to carry a short presentation.

## Proposed Solution
Create a new top-level app, separate from `headwaters/`, tentatively named `observatory/`.

The app will have two parts:
1. A thin local adapter process that reads live Headwaters activity from the same machine and emits a stable room/event view model for the UI.
2. A browser UI that renders the commons and discovered interiors/spaces as a spatial graph of rooms, with the current room as the primary workspace and an event inspector as secondary context.

The adapter remains read-only. It does not post into Headwaters or alter provisioning behavior. Its job is to observe, normalize, and expose a presentation-neutral model to the UI.

## Proposed Product Shape

### Operator Workflow
- Start Headwaters separately as usual.
- Start the observatory app separately.
- Point the observatory at the local Headwaters environment via filesystem/network config.
- During the demo, drive real agents externally.
- The observatory follows live changes and materializes new rooms as they appear.
- The operator manually navigates between rooms while peripheral activity remains visible.

### Room Model
The first cut should treat these as first-class room types:
- `commons`
- `private_request_interior`
- `spawned_space`

The model should allow additional future classes without restructuring the app, for example:
- `open_space`
- `restricted_shared_space`

### Event Model
The UI should display semantic, human-readable events first, backed by raw details on demand. Initial event vocabulary should cover at least:
- room discovered
- intent posted
- steward visible
- promise posted
- accept posted
- complete posted
- assess posted
- activity pulse / room active

The raw underlying message or record should remain inspectable for fidelity.

## Technical Considerations

### Repository Structure
Keep the observatory as a separate project rather than coupling it to `headwaters/`.

Recommended shape:
- `observatory/`
  - `package.json`
  - `src/server/` or `src/adapter/`
  - `src/client/`
  - `README.md`
  - `tests/`

This preserves the product boundary:
- `headwaters/` remains the managed space product
- `observatory/` becomes an operator/demo tool that watches it

### Observation Strategy
Because the UI must show private request interiors in a live demo, a normal unprivileged participant view is insufficient.

Plan around a thin local adapter that can use same-machine operator access to:
- connect to public Headwaters network surfaces where useful
- inspect local persisted Headwaters/runtime data where needed to discover room topology and private interiors
- normalize those observations into a room/event model

The adapter should prefer existing persisted artifacts and externally visible behavior over new hidden callbacks. If extra observability must be added, it should be added as explicit read-only operator-facing data rather than as UI-specific in-process hooks.

### Frontend Stack
Because there is no existing frontend app in this repo to extend, use a separate modern web stack optimized for fast iteration and visual polish.

Recommended default:
- React + TypeScript + Vite
- Tailwind or a similarly fast token-driven styling layer
- Framer Motion for intentional spatial transitions if the implementation benefits from it

This is aligned with the OpenAI GPT-5.4 frontend guidance, which specifically recommends defining a design system up front and notes that React + Tailwind is an effective default for polished web work.

### Design Direction
The UI should follow the GPT-5.4 frontend guidance and the newly installed `frontend-skill`, but adapted for an app-like observatory instead of a marketing page.

Carry these principles into implementation:
- define design tokens and constraints up front
- choose one clear visual direction rather than a generic dashboard look
- treat the first viewport as one composition, not a card mosaic
- favor strong typography and restrained chrome
- keep one primary workspace, navigation, and secondary inspector
- default to minimal card usage
- use 2-3 intentional motions that reinforce room emergence, room switching, and activity, not decorative noise
- ensure desktop and mobile both work, even if the demo is primarily desktop-driven
- verify visually in the browser during implementation rather than trusting code alone

### Theme Separation
The room/event model must be presentation-neutral. The initial “terminal-modern hybrid” skin should be implemented as a replaceable visual layer.

The plan should treat these as stable semantic primitives:
- room
- room type
- visibility boundary
- connection/edge
- semantic event
- actor label
- activity state

A later reskin should be able to replace:
- typography
- colors
- motion language
- room rendering style
without changing the adapter contract.

## System-Wide Impact

- **Interaction graph**: Headwaters agents and services continue behaving exactly as they do today. The observatory adapter observes Headwaters activity and persisted state, translates it into a room/event model, and serves that model to the browser UI. The UI consumes the adapter output and renders it. No promise or provisioning act should originate from the observatory.
- **Error propagation**: Adapter observation failures should degrade to stale or missing room/event visualization rather than affecting Headwaters availability. UI rendering failures should not interfere with the adapter. Headwaters must remain operable when the observatory is down.
- **State lifecycle risks**: The observatory must not become authoritative for room existence, promise lifecycle, or provisioning state. Derived room/event state may be cached locally for rendering, but authority stays with Headwaters persisted/runtime state. Partial adapter failure must not orphan or mutate Headwaters state.
- **API surface parity**: Headwaters HTTP onboarding and station participation surfaces should remain unchanged. Any observability additions must be explicitly operator-facing and optional, not a new mandatory participation API.
- **Integration test scenarios**: Cross-layer testing should cover live discovery of new private rooms, spawned-space emergence, manual room switching while new events arrive, and observatory behavior across Headwaters restart/recovery.

## Promise-Native Architecture Check

### Autonomous participants
- Requesting agents, steward, and Headwaters hosted spaces remain the real participants.
- The observatory is not a participant in the provisioning flow. It is an observer/operator tool.

### Promise lifecycle
- The UI must preserve visibility of the real `INTENT -> PROMISE -> ACCEPT -> COMPLETE -> ASSESS` chain where relevant.
- It may translate those acts into semantic labels for readability, but it must not compress them into a fake synchronous “space created” shortcut.

### State authority
- Authoritative state remains in Headwaters runtime/persisted state and live protocol activity.
- The observatory adapter maintains derived read models only.

### Intent-space purity
- The UI is external to Headwaters and must not push new semantics into the wire protocol.
- Observability should come from reading existing surfaces or explicit operator-facing artifacts, not from turning Headwaters into a UI backend with bespoke control semantics.

### Visibility / containment
- Commons, private request interiors, and spawned spaces must remain distinct in the room model.
- Private interiors should be visible as bounded rooms in the operator UI without being misrepresented as public participant-visible spaces.

### Rejected shortcut
- Reject embedding the UI directly into `headwaters/` as a product/admin surface.
- Reject a generic dashboard-card mosaic that flattens spaces into rows.
- Reject adding imperative UI callbacks into Headwaters just to make the demo easier.

## Implementation Phases

### Phase 1: Separate Observatory Foundation
Create the standalone `observatory/` project and establish its boundaries.

Deliverables:
- separate package/app scaffold under `observatory/`
- README describing operator-only purpose and local assumptions
- config/env model for connecting to a local Headwaters instance on the same machine
- initial browser shell with placeholder room/event model

Success criteria:
- the observatory can be started independently of `headwaters/`
- no code needs to be imported into `headwaters/` to render the UI shell
- local config makes the relationship explicit: same machine, separate app

### Phase 2: Local Adapter and Room/Event Model
Implement the read-only adapter that turns live local Headwaters observation into a stable room/event model.

Deliverables:
- adapter contract for rooms, edges, visibility, semantic events, and raw details
- initial room discovery from commons and additional discovered rooms
- private request interior discovery using same-machine operator access
- live update flow from Headwaters activity into the adapter output

Success criteria:
- the adapter can discover commons plus newly created request interiors and spawned spaces
- the adapter does not require writing to Headwaters or patching in UI-specific callbacks
- the room/event model stays presentation-neutral and stable enough for a later reskin

### Phase 3: Spatial Observatory UI
Build the live Headwaters observatory interface around the adapter output.

Deliverables:
- spatial graph rooted in commons
- current-room primary workspace
- visible emergent connected rooms
- visual distinction for private bounded rooms
- human-readable semantic event rendering with raw-detail inspector
- manual navigation model with peripheral activity indicators

Success criteria:
- a viewer can understand containment and room emergence without reading protocol details
- the operator can manually stage the story without losing awareness of new activity elsewhere
- the UI remains usable when multiple new rooms appear during the demo

### Phase 4: Visual Direction, Motion, and Verification
Apply the deliberate visual treatment and validate that the UI feels strong rather than generic.

Deliverables:
- explicit design tokens and typography roles
- terminal-modern hybrid theme implemented on top of semantic primitives
- 2-3 intentional motions such as room materialization, focus transitions, and activity pulses
- browser verification across at least desktop and mobile layouts
- visual cleanup pass using the GPT-5.4 frontend guidance and installed `frontend-skill`

Success criteria:
- the first viewport reads as one composition, not a dashboard card wall
- the observatory feels deliberate and stage-worthy in a live demo
- visual changes remain largely isolated from adapter logic and semantic room/event structures

### Phase 5: Demo Readiness
Tighten the experience for the actual five-minute presentation.

Deliverables:
- small seeded operator script/runbook for starting Headwaters and the observatory together
- representative live demo scenario notes
- resilience check across Headwaters restart or temporary adapter disconnect

Success criteria:
- the operator can reliably run the observatory alongside Headwaters on one machine
- the UI remains legible during a short live demo with real agents
- the demo story survives at least one unplanned burst of room creation or activity

## Alternative Approaches Considered

### 1. Embed the UI into `headwaters/`
Rejected. It would be faster initially but would blur the product boundary and encourage UI-specific hooks inside the Headwaters service.

### 2. Build a generic intent-space browser first
Rejected for v1. It would broaden scope and weaken the demo’s clarity. The live Headwaters story is the sharper first move.

### 3. Use a replay-only scripted visualization
Rejected. It would be easier to control but would lose the power of showing real live agent activity.

## Acceptance Criteria

### Functional Requirements
- [x] A separate `observatory/` app exists and can run without being embedded into `headwaters/`.
- [x] The observatory follows live Headwaters activity on the same machine.
- [x] Commons is rendered as the anchor room.
- [x] New private request interiors and spawned spaces appear as connected emergent rooms.
- [x] Private rooms are visibly distinct from public/open spaces.
- [x] The UI renders human-readable semantic events with raw details available on demand.
- [x] The operator can manually navigate rooms without forced auto-follow.
- [x] The UI remains usable when more than one new room appears during a demo.

### Non-Functional Requirements
- [x] The room/event model is separable from the initial visual theme.
- [x] The observatory does not mutate or become authoritative for Headwaters state.
- [ ] Desktop and mobile layouts both render correctly.
- [x] The visual system avoids generic dashboard-card clutter and follows an explicit design system.

### Quality Gates
- [x] Adapter behavior is covered by focused tests.
- [ ] UI behavior is exercised with browser-level verification.
- [x] Documentation explains how to run the observatory alongside a local Headwaters process.

## Success Metrics
- In a rehearsal, a new viewer can explain the difference between commons, a private request interior, and a spawned space after watching the demo.
- The operator can generate new activity live without the UI collapsing into unreadable noise.
- A reskin can be scoped mostly to visual/theme layers rather than requiring adapter/view-model redesign.

## Dependencies & Risks

### Dependencies
- Live local Headwaters process available on the same machine
- access to local filesystem/network surfaces needed for operator observation
- a browser verification loop during implementation

### Risks
- Private room discovery may tempt a hidden coupling to Headwaters internals.
- A spatial graph can become visually muddy if room creation is too noisy.
- A throwaway project can drift toward over-engineering if the adapter contract gets too broad.
- A visually ambitious UI can become gimmicky if the motion and chrome overwhelm the semantics.

### Mitigations
- keep the adapter explicitly read-only
- keep the room taxonomy narrow in v1
- keep semantic primitives small and stable
- verify visually and trim aggressively when the composition starts to resemble a dashboard

## Sources & References

### Origin
- **Origin document:** [docs/brainstorms/2026-03-24-headwaters-live-observatory-ui-requirements.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-24-headwaters-live-observatory-ui-requirements.md) — carried forward decisions: Headwaters-only v1, live observatory, emergent room graph, manual operator control, themeable semantic model

### Internal References
- [docs/architecture/promise-native-planning-guardrails.md](/Users/noam/work/skyvalley/big-d/docs/architecture/promise-native-planning-guardrails.md)
- [docs/brainstorms/2026-03-09-intent-space-playground-brainstorm.md](/Users/noam/work/skyvalley/big-d/docs/brainstorms/2026-03-09-intent-space-playground-brainstorm.md)
- [intent-space/README.md](/Users/noam/work/skyvalley/big-d/intent-space/README.md)
- [headwaters/README.md](/Users/noam/work/skyvalley/big-d/headwaters/README.md)
- [docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md](/Users/noam/work/skyvalley/big-d/docs/solutions/architecture/headwaters-needed-a-separate-steward-and-private-request-subspaces-to-keep-space-creation-promise-native-20260324.md)

### External References
- OpenAI Developers: [Designing delightful frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- Installed local skill: `frontend-skill` at `/Users/noam/.codex/skills/frontend-skill`

## Next Step
→ `/ce:work docs/plans/2026-03-24-005-feat-headwaters-live-observatory-ui-plan.md`
