# Intent Space Playground — Interactive Demo

**Date:** 2026-03-09
**Status:** Active
**Participants:** Human, Claude

## What We're Building

An interactive browser-based playground that demonstrates the intent space as a chatroom/bulletin board. Users post intents, see them broadcast in real-time across browser tabs (each tab is an autonomous "agent"), and click into any intent to zoom into its own child space — showing the fractal nature of the design.

Two deliverables:

1. **Shared design system** — Extract the ITP playground's CSS (colors, typography, buttons, inputs, animations, layout) into a reusable `design-system.css`. The existing ITP playground imports it.

2. **Intent space playground** — A new page in `memetic.software` that uses the shared design system to build a bulletin board UI. No backend — everything runs in-browser using the same ITP types and protocol logic, backed by in-memory state and `BroadcastChannel` for multi-tab sync.

## Why This Approach

- **In-browser, no backend**: Same ITP types and `createIntent()` factory functions, but backed by arrays instead of SQLite and `BroadcastChannel` instead of Unix domain sockets. Zero server dependency. Hostable as a static page.
- **Multi-tab as agents**: Each browser tab is an autonomous agent in the same intent space. Post in one tab, broadcast appears in all others. True distributed feel.
- **CSS-level design system**: The visual identity (JetBrains Mono, monochrome palette, 3px radius, 1px borders) is what needs sharing, not component logic. The two playgrounds have different enough structures that TS component reuse would be forced.
- **Click-to-zoom fractal**: Click an intent to enter its child space — a mini bulletin board where promises and sub-intents live. Back button to return to parent. Same UI at every level, demonstrating the recursive property.

## Key Decisions

### 1. Lives in memetic.software

Alongside the existing ITP playground at `memetic.software/src/`. Design system extracted there too. Vite build already configured.

### 2. Shared CSS design system, not component library

Extract from the ITP playground:
- CSS custom properties (colors, borders, radius, font stack)
- Typography scale (24px → 9px)
- Button styles (`.btn`, `.btn-primary`, `.btn-ghost`)
- Input styles
- Status dot + blink animations
- Drawer pattern (fixed bottom panel, slideUp animation)
- Responsive breakpoints
- Reduced motion support

The ITP playground's `style.css` gets refactored to import the shared system and add only its page-specific styles.

### 3. In-browser simulation via BroadcastChannel

- Each tab creates an in-memory "intent store" (array of records)
- Posting an intent: adds to local store + sends via `BroadcastChannel`
- Receiving a broadcast: adds to local store + renders
- Same `StoredIntentRecord` type from `@differ/intent-space`
- Same `createIntent()` factory from `@differ/itp`
- `BroadcastChannel` name = the "space" identity (top-level or child)

### 4. Click-to-zoom into intent's child space

- Bulletin board shows intents as cards
- Click a card → view transitions to that intent's space (new `BroadcastChannel` scoped to the intent ID)
- Inside the child space: same bulletin board UI, but showing promises/sub-intents for that intent
- Back button returns to parent
- Same code, different scope — the fractal property in action

### 5. Vanilla TypeScript

No framework. DOM manipulation like the ITP playground. Vite for bundling.

### 6. The design should emphasize interface and protocol

- Show the NDJSON messages flowing (a small protocol inspector panel?)
- Make the "bulletin board" metaphor visual — cards for intents, clear sender/timestamp
- The chatroom framing: who's connected, what's posted, who's responding
- Service intents visible as "room description" — what this space does

## Resolved Questions

1. **What existing playground?** → The ITP playground at `memetic.software/src/playground/`
2. **Build both playgrounds?** → Extract design system, build new intent space playground. ITP playground gets refactored to use shared CSS.
3. **Backend required?** → No. In-browser simulation with `BroadcastChannel` for multi-tab.
4. **Agent representation?** → Multi-tab. Each browser tab is a different agent. Real distributed feel.
5. **Fractal display?** → Click-to-zoom. Navigate into an intent's child space. Same UI, scoped differently.
6. **Where does it live?** → `memetic.software/src/intent-space/` alongside existing playground.
7. **Design system scope?** → CSS-only (tokens + primitives). Not a TS component library.
