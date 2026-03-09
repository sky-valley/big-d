# Intent Space as Chatroom — Reframing the Mental Model

**Date:** 2026-03-09
**Status:** Active
**Participants:** Human, Claude

## What We're Building

A reframing of the intent space's mental model — not changing the protocol or machinery, but establishing a more vivid, intuitive way to think about what it IS and where it's going.

The intent space is an **impromptu chatroom for agents**. You post a need (intent). Other agents scan for calls they can address. When one wants to help, it DMs you (promise). It's hookups for agents — "yo, I need X" → someone shows up and offers.

## Why This Framing

The formal Promise Theory language is correct but clinical. The chatroom metaphor makes the same mechanics visceral:

| Formal PT | Chatroom Metaphor |
|-----------|-------------------|
| Intent space | Bulletin board / bazaar |
| Post intent | Put up a flyer: "I need X" |
| Agent scans intents | Browse the board for calls to address |
| Promise | DM the poster: "I got you" |
| Accept | Poster picks a helper |
| Complete/Assess | Work done, thumbs up/down |
| Service intents | "Here's what this room is about" |

The metaphor doesn't replace PT — it makes PT legible. Every concept maps 1:1.

## Key Decisions

### 1. Parent space is pure desire

The top-level intent space is ONLY intents. No promises, no status updates, no negotiation noise. It's a clean bulletin board. If you want to see what's happening with an intent, you go deeper.

### 2. Each intent is conceptually its own space

When work begins on an intent, the negotiation (promise, accept, complete, assess) happens in the intent's own context — not in the parent bulletin board. The parent stays clean.

### 3. The recursion is a PROPERTY, not a FEATURE

This is the critical insight, arrived at by channeling Burgess, Hintjens, and Dean:

- **Burgess (Promise Theory):** "Spaces are autonomous. Relationships are in the observer, not the infrastructure. Don't build the tree — the tree emerges from agents traversing spaces."
- **Hintjens (ZeroMQ):** "The protocol doesn't change. If an agent wants a new space, it starts one. Same code, new socket. Don't build what you don't need yet."
- **Dean (Systems):** "Get the abstraction right. Whether it's one process or a thousand is an implementation detail."

The intent space protocol (NDJSON over socket, post intents, scan intents) works identically at every level. When an agent needs a child space, it creates one — same code, new instance. The link between parent intent and child space lives in the agent's mind, not in a registry or tree structure. No parent-child infrastructure to build.

### 4. Agents are passive discoverers (for now)

Agents don't announce capabilities on connect. They prove what they can do by what they promise on. Capability intents (service intents for agents) are a natural extension but a potentially one-way-door decision — defer until the pattern is proven.

### 5. Network topology is emergent

"Bots exchanging known network topology" happens naturally: agents connect to spaces, observe who else is active (by what intents and promises exist), and build their own mental map. The topology isn't declared — it emerges from observation. This is pure PT: scoping is the observer's responsibility.

## What This Means for the Current Implementation

**Nothing changes in the code right now.** The existing intent space already IS this — it's a bulletin board where you post needs and scan for calls. The reframing is about:

1. **Language** — Call it a chatroom/bulletin board in docs and comments, not just "intent space server"
2. **Design constraints** — The parent space should stay pure (intents only). Promise lifecycle belongs in a separate context.
3. **Future direction** — When we wire agents to the intent space (replacing the PromiseLog's intent table), the architecture is: agents connect to the bulletin board, scan for work, then create/join child spaces for negotiation.
4. **Protocol stability** — The wire protocol doesn't need to change. NDJSON over socket is the right abstraction at every level. Same code runs a top-level bazaar or a two-party negotiation room.

## Open Questions

*None — all questions resolved during brainstorm.*

## Resolved Questions

1. **One room or many?** → Many. The top-level space is a bulletin board. Each intent conceptually gets its own space.
2. **Recursive?** → Yes. An intent space IS an intent space at every level. Same protocol, fractal.
3. **How do agents advertise capabilities?** → They don't (for now). Passive — scan and promise. Capability intents deferred.
4. **Promise visibility?** → Promises are private to the intent's space. The parent bulletin board only shows desires, not negotiations.
5. **Build the tree?** → No. The tree is a property of the design, not infrastructure to implement. Agents hold the links. Ship one space.
