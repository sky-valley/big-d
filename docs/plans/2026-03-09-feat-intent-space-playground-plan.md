---
title: "feat: Intent space playground + design system extraction"
type: feat
status: active
date: 2026-03-09
brainstorm: docs/brainstorms/2026-03-09-intent-space-playground-brainstorm.md
---

# feat: Intent Space Playground + Design System Extraction

## Overview

Build an interactive browser-based playground at `memetic.software/src/intent-space/` that demonstrates the intent space as a chatroom/bulletin board. Extract a shared CSS design system from the existing ITP playground to ensure visual consistency. No backend — everything runs in-browser using `BroadcastChannel` for multi-tab sync, with the same ITP types and `createIntent()` factory.

## Problem Statement

The intent space concept (impromptu chatroom for agents, bulletin board of desires, fractal spaces) has no visual demonstration. The existing ITP playground demonstrates promise lifecycle but not the intent space model. Meanwhile, the monochrome design system is duplicated across three pages with no shared source.

## Proposed Solution

Two deliverables, built in order:

1. **Shared `design-system.css`** — Extract CSS primitives from the ITP playground. The playground imports it; new pages reuse it.
2. **Intent space playground page** — Bulletin board UI where users post intents, see real-time broadcasts across tabs, and click into child spaces (fractal navigation).

## Technical Approach

### Architecture

```
src/
  shared/
    design-system.css    ← NEW: extracted CSS tokens + primitives
    types.ts             (existing: ITP types, createIntent)
    journey.ts           (existing: lesson data)
  playground/
    style.css            ← MODIFIED: @import design-system, keep playground-specific only
    playground.html
    main.ts
  intent-space/          ← NEW: intent space playground
    index.html           entry point
    style.css            page-specific styles (imports design-system)
    main.ts              vanilla TS, BroadcastChannel, DOM manipulation
```

**In-browser intent space simulation:**

```
Tab A                     BroadcastChannel              Tab B
  |                       ('intent-space')                |
  |-- post intent ------->|                               |
  |   (local store + UI)  |--- broadcast ---------------→|
  |                       |                    (add to store + render)
  |                       |                               |
  |-- click intent -------|                               |
  |   (zoom to child)     |                               |
  |                       |                               |
  |   BroadcastChannel    |                               |
  |  ('intent-space:abc') |                               |
  |-- post sub-intent --->|                               |
```

**Late-joiner sync protocol:**

```
Tab B (new)               BroadcastChannel              Tab A (existing)
  |-- SYNC_REQUEST ------>|--- forward ---------------→|
  |                       |                    (serialize store)
  |                       |←-- SYNC_RESPONSE ----------|
  |←- receive state ------|                             |
  |   (merge + render)    |                             |
```

### Implementation Phases

#### Phase 1: Design System Extraction

Extract from `src/playground/style.css` into `src/shared/design-system.css`:

**`src/shared/design-system.css`** — extracted primitives:

```css
/* ---- design-system.css ---- */

/* Tokens */
:root {
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
  --black: #111;
  --white: #fff;
  --gray-100: #f5f5f5;
  --gray-200: #e5e5e5;
  --gray-300: #d4d4d4;
  --gray-400: #a3a3a3;
  --gray-500: #737373;
  --gray-600: #525252;
  --border: 1px solid var(--gray-300);
  --border-dark: 1px solid var(--black);
  --radius: 3px;
}

/* Reset */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Base */
body { font-family: var(--font-mono); font-size: 13px; color: var(--black); background: var(--white); }
a { color: var(--gray-500); text-decoration: none; }
a:hover { color: var(--black); }
.hidden { display: none !important; }

/* Buttons */
.btn { ... }
.btn-primary { ... }
.btn-ghost { ... }

/* Inputs */
input, textarea { ... }

/* Animations */
@keyframes blink { ... }
@keyframes slideUp { ... }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) { ... }
```

**Refactor `src/playground/style.css`:**

```css
@import '../shared/design-system.css';

/* Everything below is playground-specific */
.playground { ... }
.block-tray { ... }
/* etc. */
```

**Acceptance criteria:**
- [ ] `src/shared/design-system.css` created with tokens, reset, base, buttons, inputs, keyframes
- [ ] `src/playground/style.css` refactored to `@import` design system
- [ ] ITP playground renders identically after refactor (visual regression: none)
- [ ] No duplicate `:root` definitions in playground CSS

#### Phase 2: Intent Space Page Scaffold

Create the new page and wire it into Vite + Express.

**New files:**

`src/intent-space/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Intent Space — Bulletin Board</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header class="header">
    <span class="header-title">intent space</span>
    <span class="agent-id" id="agent-id"></span>
    <nav class="breadcrumb" id="breadcrumb"></nav>
  </header>
  <main class="board" id="board"></main>
  <footer class="post-bar">
    <input type="text" id="intent-input" placeholder="Post an intent..." autocomplete="off">
    <button class="btn btn-primary" id="post-btn">Post</button>
  </footer>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`src/intent-space/style.css`:
```css
@import '../shared/design-system.css';

/* Intent space page-specific styles */
.header { ... }
.board { ... }
.intent-card { ... }
.post-bar { ... }
.breadcrumb { ... }
.empty-state { ... }
```

**Vite config update** (`vite.config.ts`):
```ts
input: {
  main: resolve(__dirname, 'src/site/index.html'),
  protocol: resolve(__dirname, 'src/protocol/index.html'),
  playground: resolve(__dirname, 'src/playground/playground.html'),
  intentSpace: resolve(__dirname, 'src/intent-space/index.html'),  // NEW
}
```

**Express route** (`src/server/index.ts`):
```ts
app.get('/intent-space', (_req, res) => {
  res.sendFile(join(distClientDir, 'intent-space', 'index.html'), (err) => {
    if (err) res.sendFile(join(intentSpaceDir, 'index.html'));
  });
});
```

**Acceptance criteria:**
- [ ] `/intent-space` loads in dev mode (Vite)
- [ ] Page renders with design system styles
- [ ] Agent ID generated and displayed on load
- [ ] Input field and Post button visible

#### Phase 3: Bulletin Board + BroadcastChannel

The core functionality: post intents, see them on the board, broadcast across tabs.

**`src/intent-space/main.ts`** — core logic:

```typescript
// ---- Identity ----
const agentId = `agent-${crypto.randomUUID().slice(0, 8)}`;

// ---- In-memory store ----
interface IntentRecord {
  intentId: string;
  senderId: string;
  content: string;
  timestamp: number;
  parentId?: string;  // null = root space, set = child space
}

const store: IntentRecord[] = [];
const seenIds = new Set<string>();

// ---- BroadcastChannel ----
type ChannelMessage =
  | { type: 'INTENT'; intent: IntentRecord }
  | { type: 'SYNC_REQUEST'; tabId: string }
  | { type: 'SYNC_RESPONSE'; tabId: string; intents: IntentRecord[] };

let currentSpaceId = 'root';  // or intentId for child spaces
let channel = new BroadcastChannel('intent-space:root');

// ---- Post intent ----
function postIntent(content: string): void {
  const intent: IntentRecord = {
    intentId: crypto.randomUUID().slice(0, 8),
    senderId: agentId,
    content,
    timestamp: Date.now(),
    parentId: currentSpaceId === 'root' ? undefined : currentSpaceId,
  };
  addIntent(intent);
  channel.postMessage({ type: 'INTENT', intent });
}

// ---- Receive broadcast ----
channel.onmessage = (event) => {
  const msg = event.data as ChannelMessage;
  if (msg.type === 'INTENT') {
    addIntent(msg.intent);
  } else if (msg.type === 'SYNC_REQUEST') {
    const relevant = store.filter(i => spaceMatch(i));
    channel.postMessage({ type: 'SYNC_RESPONSE', tabId: msg.tabId, intents: relevant });
  } else if (msg.type === 'SYNC_RESPONSE' && msg.tabId === tabId) {
    for (const intent of msg.intents) addIntent(intent);
  }
};

// ---- Late-joiner sync ----
const tabId = crypto.randomUUID().slice(0, 8);
channel.postMessage({ type: 'SYNC_REQUEST', tabId });

// ---- Render ----
function addIntent(intent: IntentRecord): void {
  if (seenIds.has(intent.intentId)) return;  // de-duplicate
  seenIds.add(intent.intentId);
  store.push(intent);
  renderCard(intent);
}

function renderCard(intent: IntentRecord): void {
  // Create DOM element, escapeHtml on content, append to board
}

// ---- Click-to-zoom ----
function navigateToSpace(intentId: string): void {
  // Close old channel, open new one for child space
  // Update breadcrumb, re-render board with child intents
  // Update URL hash
}
```

**Acceptance criteria:**
- [ ] Posting an intent renders a card on the bulletin board
- [ ] Opening a second tab shows intents posted in the first (via SYNC_REQUEST)
- [ ] New intents in Tab A appear in Tab B in real-time (broadcast)
- [ ] De-duplication: same intent never rendered twice
- [ ] Empty input rejected (no empty intents posted)
- [ ] Intent content escaped (XSS prevention via `escapeHtml()`)
- [ ] Enter key submits intent

#### Phase 4: Fractal Navigation (Click-to-Zoom)

Click an intent card to enter its child space. Same UI, scoped to that intent.

**Navigation model:**

```
URL: /intent-space                    → root space
URL: /intent-space#space:abc123       → child space for intent abc123
URL: /intent-space#space:abc123:def456 → nested child space
```

**Behavior:**

1. Click intent card → `navigateToSpace(intentId)`
2. Close current `BroadcastChannel`, open `BroadcastChannel('intent-space:${intentId}')`
3. Parent intent shown as fixed header above the board
4. Board clears and shows only intents with `parentId === intentId`
5. Breadcrumb updates: `root > intent-abc > intent-def`
6. Back button (or breadcrumb click) returns to parent
7. Browser back button works (hash-based routing)
8. New tab joining a child space gets state via SYNC_REQUEST on that channel

**Acceptance criteria:**
- [ ] Clicking an intent card navigates to its child space
- [ ] Parent intent shown as header in child space
- [ ] Breadcrumb trail shows navigation path
- [ ] Back button returns to parent space
- [ ] Browser back button works (hash routing)
- [ ] Posting in child space only appears in that child space
- [ ] Cross-tab sync works within child spaces (scoped BroadcastChannel)
- [ ] Empty child space shows prompt: "This space is empty. Post a sub-intent."

#### Phase 5: Polish

- [ ] Mobile responsive layout (single column, sticky post bar)
- [ ] Intent cards show: sender badge, content, timestamp, click affordance
- [ ] "You" badge on own intents (compare senderId to local agentId)
- [ ] Connected tabs count indicator (via periodic BroadcastChannel ping)
- [ ] Smooth transitions between spaces (CSS transition on board opacity)
- [ ] Service intents: on entering a space, show what it "intends to do" (static text, matching the intent space's self-description pattern)

## Design Decisions

### No persistence — intents are ephemeral

This is a playground demo, not a production app. All state lives in memory. Refresh = clean slate. This is an explicit choice, not an oversight. The playground demonstrates the protocol and interaction model, not durability.

### SYNC_REQUEST/SYNC_RESPONSE for late-joiner sync

When a new tab opens, it broadcasts `SYNC_REQUEST` on the current space's channel. Existing tabs respond with their store contents. The new tab merges (de-duplicating by intentId). If no other tabs exist, the new tab starts with an empty board. This is simple, requires no extra APIs (no localStorage, no SharedWorker), and matches the decentralized "chatroom" model — you learn state from peers, not from a central authority.

### Intents only — no PROMISE/ACCEPT in v1

The playground demonstrates the bulletin board layer: post desires, scan for calls, zoom into spaces. The promise lifecycle (PROMISE → ACCEPT → COMPLETE → ASSESS) is demonstrated by the existing ITP playground. Keeping the intent space playground focused on intents prevents scope creep and emphasizes the "body of desire" vs "body of commitment" separation.

### Child space = negotiation room for parent intent

When you click an intent, you enter "the room where people coordinate on that intent." The parent intent is shown as a header. Sub-intents posted inside are needs that arise while addressing the parent: "I need a database schema," "I need test fixtures." This maps to the brainstorm's "each intent is its own space" model.

### Primitives-only design system extraction

Only extract: CSS custom properties, reset, body base, links, `.hidden`, `.btn` family, input styles, `@keyframes blink/slideUp`, reduced-motion media query. Everything else (panels, drawers, timelines, lessons, agents) stays in the playground's own CSS. This prevents the shared file from accumulating playground-specific concepts.

## Acceptance Criteria

### Functional Requirements
- [ ] Design system extracted; ITP playground renders identically
- [ ] Intent space page loads at `/intent-space`
- [ ] Users can post intents and see them as cards
- [ ] Multi-tab: intents broadcast across tabs in real-time
- [ ] Late-joiner sync: new tab receives existing intents
- [ ] Click-to-zoom: navigate into child spaces
- [ ] Breadcrumb + back navigation
- [ ] Hash-based URL routing for deep linking

### Non-Functional Requirements
- [ ] No backend dependency — pure browser simulation
- [ ] XSS prevention (escapeHtml on all user content)
- [ ] Graceful degradation if BroadcastChannel unsupported
- [ ] Mobile responsive
- [ ] Reduced motion support

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| ITP playground visual regression after CSS extraction | Manual visual comparison before/after. No automated visual tests exist. |
| BroadcastChannel race on SYNC_RESPONSE (multiple tabs respond) | De-duplicate by intentId via `seenIds` Set |
| Deep fractal navigation creates many BroadcastChannels | Close previous channel on navigation. One active channel at a time per tab. |
| `createIntent()` returns full ITPMessage with unused fields | Use a lightweight `IntentRecord` type for the playground. Import only the intent ID generation pattern. |

## Files Modified/Created

| Location | Action |
|----------|--------|
| `src/shared/design-system.css` (new) | Extracted CSS tokens + primitives |
| `src/playground/style.css` | Refactored: `@import` design system, remove duplicated rules |
| `src/intent-space/index.html` (new) | Page entry point |
| `src/intent-space/style.css` (new) | Page-specific styles |
| `src/intent-space/main.ts` (new) | Bulletin board logic, BroadcastChannel, fractal navigation |
| `vite.config.ts` | Add `intentSpace` entry to rollup inputs |
| `src/server/index.ts` | Add `/intent-space` route |

## References

- Brainstorm: `docs/brainstorms/2026-03-09-intent-space-playground-brainstorm.md`
- Chatroom brainstorm: `docs/brainstorms/2026-03-09-intent-space-as-chatroom-brainstorm.md`
- ITP playground source: `memetic.software/src/playground/`
- ITP types: `memetic.software/src/shared/types.ts`
- Vite config: `memetic.software/vite.config.ts`
- Express routes: `memetic.software/src/server/index.ts`
- BroadcastChannel API: MDN Web Docs
