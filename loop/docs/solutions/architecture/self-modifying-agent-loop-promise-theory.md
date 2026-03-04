---
title: "Self-Modifying Agent Loop: Promise Theory Protocol with Blue-Green Binary Swap"
date: 2026-03-04
session_date: 2026-03-03
category: architecture
tags:
  - self-modifying-code
  - promise-theory
  - blue-green-deployment
  - claude-agent-sdk
  - supervisor-pattern
  - crash-recovery
  - exponential-backoff
  - sqlite-coordination
  - bun-build
  - source-runtime-separation
component: differ-loop
files_changed:
  - src/loop/supervisor.ts
  - src/loop/agent.ts
  - src/loop/work.ts
  - src/loop/cli.ts
  - src/loop/promise-log.ts
  - src/itp/types.ts
  - src/itp/protocol.ts
  - package.json
problem_type: architecture
severity: n/a
root_cause: "Design and implementation of an autonomous self-modifying agent system requiring crash-safe coordination between a fixed-point supervisor, an LLM-driven agent that edits its own source, and a human CLI -- all coordinated through Promise Theory's voluntary commitment protocol"
resolution: "Promise Theory ITP protocol with SQLite shared log, blue-green binary swap (bun build to dist/current + dist/previous), Claude Agent SDK for agentic code editing, exponential backoff for crash recovery, HMAC-signed human gates, and mandatory diff review before assessment"
---

# Self-Modifying Agent Loop with Promise Theory and Blue-Green Deployment

## Overview

A long-running agent that guards its own source code, modifies itself in response to human intent, and restarts as the new version. Three components -- supervisor, agent, CLI -- coordinate through Promise Theory (voluntary commitments, no impositions). The agent runs from a compiled binary while editing source, with blue-green deployment for safe version transitions.

Built in a single session on 2026-03-03. Six bugs discovered and fixed along the way, each revealing a fundamental design insight about self-modifying systems.

## Architecture

```
                    +----------------------------------------------------------+
                    |                     SUPERVISOR                            |
                    |            (fixed point, never self-modifies)             |
                    |                                                           |
                    |  Build (bun) --> Launch Agent --> Handle Exit              |
                    |       ^                              |                    |
                    |       |    dist/current/agent.js     |                    |
                    |       |                              |                    |
                    |       +-- exit 0: snapshot+build ----+                    |
                    |           exit 2: stop                                    |
                    |           signal: stop                                    |
                    |           crash: restart same binary (with backoff)       |
                    +----------------------------------------------------------+
                                           |
                +------------- ------------+---------------------------+
                |                          |                           |
                v                          v                           v
    +-------------------+    +-------------------+    +-------------------+
    |      AGENT        |    |    PROMISE LOG     |    |       CLI         |
    |  (autonomous A)   |<-->|   (SQLite WAL)     |<-->|  (human agent H)  |
    |                   |    |                     |    |                   |
    | Observe intents   |    | messages table      |    | intent <content>  |
    | Make PROMISE      |    | promise_state table  |    | accept <id>       |
    | Wait for ACCEPT   |    | HMAC verification   |    | assess <id> pass  |
    | doWork() via SDK  |    | Prefix resolution   |    | status            |
    | Post COMPLETE     |    |                     |    |                   |
    | Wait for ASSESS   |    | ~/.differ/loop/     |    | --json output     |
    | Commit + exit(0)  |    |   promise-log.db    |    | --sender <id>     |
    +-------------------+    |   .hmac-key         |    +-------------------+
                             +---------------------+
```

### Promise Protocol Flow

```
INTENT --> PROMISE --> ACCEPT --> [WORK] --> COMPLETE --> ASSESS
(human)    (agent)     (human)    (agent)    (agent)     (human)
                         ^                                  |
                    HUMAN GATE 1                     HUMAN GATE 2
                   (approve plan)                   (review diff)
                                                        |
                                        +---------------+--------+
                                        v                        v
                                    FULFILLED                  BROKEN
                                   (commit+exit)              (REVISE)
```

### Blue-Green Binary Swap

```
     src/*.ts (editable)                dist/ (compiled, immutable at runtime)
    +----------------+                 +----------------------------------+
    | agent.ts       |                 |  current/                        |
    | work.ts        |-- bun build --> |    agent.js     <-- runs here    |
    | promise-log.ts |                 |    agent.js.map                  |
    | protocol.ts    |                 +----------------------------------+
    | types.ts       |                 |  previous/                       |
    +----------------+                 |    agent.js     <-- rollback tgt |
                                       |    agent.js.map                  |
    Agent edits here                   +----------------------------------+
    (while running from dist/)

    Exit 0 swap sequence:
    1. cp dist/current/ -> dist/previous/  (snapshot)
    2. bun build src/ -> dist/current/     (rebuild)
    3. node dist/current/agent.js          (launch)
       - If crash on first launch:
         cp dist/previous/ -> dist/current/ (rollback)
         node dist/current/agent.js         (retry)
```

## Problems Solved

### 1. Prefix ID Matching

**Symptom:** `status` displayed truncated 8-char IDs (e.g., `a3f7b2c1`) but `accept`/`assess` required full UUIDs. Users couldn't copy from status output to use in commands.

**Root cause:** Display format diverged from input format. `cli.ts` truncated with `.slice(0, 8)` but `getPromiseState()` did exact match.

**Fix:** Added `resolvePromiseId()` to `promise-log.ts` using SQL `LIKE` prefix matching:

```typescript
resolvePromiseId(prefix: string): string | null {
  const rows = this.db.prepare(
    `SELECT promise_id FROM promise_state WHERE promise_id LIKE ? || '%'`
  ).all(prefix) as Array<{ promise_id: string }>;
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].promise_id;
  const exact = rows.find(r => r.promise_id === prefix);
  if (exact) return exact.promise_id;
  throw new Error(`Ambiguous prefix "${prefix}" matches ${rows.length} promises`);
}
```

**Lesson:** Any system that displays shortened identifiers must accept shortened identifiers as input. Git solved this for commit hashes; the same pattern applies to UUIDs.

### 2. Rate Limit Crash Loop

**Symptom:** Agent hit 429 rate limit, crashed, supervisor restarted instantly, hit 429 again, creating a tight loop that burned through API rate limits with no useful work.

**Root cause:** No backoff between crash restarts. Supervisor had zero delay on restart, amplifying a transient API error into sustained load.

**Fix:** Exponential backoff in `supervisor.ts`:

```typescript
const backoffSec = Math.min(2 ** consecutiveCrashes, 60);
spawnSync('sleep', [String(backoffSec)]);
```

Plus `MAX_CONSECUTIVE_CRASHES = 5` as a circuit breaker. Counter resets on any successful exit (code 0).

**Lesson:** Every process restart loop needs three mechanisms: exponential backoff, a max failure ceiling, and a reset condition. Without all three, transient failures become permanent.

### 3. Supervisor Reverting Human Edits (Blast Radius)

**Symptom:** `git checkout -- .` on crash destroyed ALL uncommitted files in the working tree -- including human infrastructure edits made outside the agent. This happened silently 3+ times before being caught.

**Root cause:** Source and runtime were the same files. The agent ran directly from `src/` via tsx, so the supervisor's "rollback agent's changes" operation was actually "rollback everything." Blast radius exceeded change scope.

**Fix:** Complete architectural shift to blue-green binary swap. Agent runs from compiled `dist/current/agent.js`, edits `src/*.ts`. Source is NEVER rolled back. On crash, supervisor just restarts the same binary. On exit 0, supervisor snapshots current, builds new, swaps in.

```typescript
// supervisor.ts header:
// Source is NEVER rolled back. The supervisor never runs `git checkout`.
```

**Lesson:** In self-modifying systems, separate the code being modified from the code being executed. The running binary must be immutable. A bad edit to source doesn't crash the running agent -- it only takes effect after a build succeeds.

### 4. SIGINT Treated as Crash

**Symptom:** Ctrl-C triggered crash handler (rollback + restart) instead of clean shutdown.

**Root cause:** Supervisor only checked `result.status`. When SIGINT killed the agent, `result.status` was null, interpreted as `null ?? 1` = crash.

**Fix:** Check `result.signal` before exit code:

```typescript
const signal = result.signal;
if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 130) {
  console.log(`Agent stopped by ${signal ?? 'interrupt'}. Stopping supervisor.`);
  break;
}
```

**Lesson:** In any process supervisor, always check signal before exit code. User-initiated stop (SIGINT) and system failure (crash) require fundamentally different responses.

### 5. Silent Work Phase

**Symptom:** `doWork()` produced no output for minutes during multi-turn LLM tool loops. User couldn't distinguish "working" from "hung."

**Root cause:** Original hand-rolled API loop had no per-turn logging.

**Fix:** Stream messages from Agent SDK with per-turn logging:

```typescript
for await (const message of query({ prompt, options: { ... } })) {
  if (message.type === 'assistant') {
    turns++;
    // Log each tool call and text preview
    for (const block of toolBlocks) {
      log(`  tool: ${block.name}(...)`);
    }
    log(`  Turn ${turns} -- ${toolBlocks.length} tool calls`);
  }
  if (message.type === 'result') {
    log(`Session complete: ${message.num_turns} turns, $${costUsd.toFixed(4)}`);
  }
}
```

**Lesson:** Any operation that can exceed 5 seconds must emit progress. The user's mental model should never be "is it stuck?" -- it should be "it is on turn 7 of 20, currently editing agent.ts."

### 6. Claude Agent SDK Migration

**Symptom:** Hand-rolled agentic loop was 195 lines with 4 primitive custom tools (`read_file`, `write_file`, `list_files`, `shell`), no retry logic for API errors, and raw shell access with no sandboxing.

**Root cause:** Duplicating what the Agent SDK already provides.

**Fix:** Replaced entire hand-rolled loop with `query()` from `@anthropic-ai/claude-agent-sdk`:

```typescript
for await (const message of query({
  prompt,
  options: {
    cwd,
    systemPrompt: `You are a self-modifying coding agent...`,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    maxTurns: 20,
  },
})) { ... }
```

File went from 195 lines to 107. Gained: built-in retry logic, full tool suite (Read, Edit, Bash, Glob, Grep), streaming output, cost tracking.

**Lesson:** Build vs. integrate decision. When an SDK provides the exact tools you need with better error handling, use it. The `doWork()` function is deliberately a "black box" -- the loop framework doesn't depend on how work gets done.

## Key Design Patterns

### Fixed-Point Supervisor

The supervisor never self-modifies. It runs via tsx from source. Only the agent runs from compiled output. The supervisor IS the stable reference frame that allows the agent to modify itself safely. Without a fixed point, there is no recovery path from a bad self-modification.

### Exit Code Contract

| Code | Meaning | Supervisor Action |
|------|---------|-------------------|
| 0 | Source committed, restart | Blue-green swap: snapshot, build, launch |
| 2 | Clean shutdown | Stop supervisor |
| SIGINT/SIGTERM | User stop | Stop supervisor (no rollback) |
| Other | Crash | Restart same binary with backoff |

### Crash-Only Boot

The agent derives state entirely from the SQLite promise log on every boot. No checkpoint file. If there's an active promise in ACCEPTED state, re-enter work phase. If COMPLETED, wait for ASSESS. If PROMISED, wait for ACCEPT. The recovery path IS the normal startup path.

### Two Human Gates

ACCEPT before work (approve the plan) and ASSESS after work (review the diff). Both are HMAC-signed to prevent the agent from forging human approval. The ASSESS gate forces a `git diff HEAD~1` to be displayed before the human can approve.

### Self-Intent Filtering

```typescript
const humanIntents = intents.filter(i => !i.senderId.startsWith('agent'));
```

The agent cannot process intents it posted itself. Without this filter, a self-modifying agent could create a closed modification loop with no human oversight.

## Lessons Learned

1. **Blanket git rollback is a multi-tenant hazard.** The working tree is shared territory. Any destructive operation must be scoped to a known, bounded set of files.

2. **Crash-restart loops amplify the original failure.** Always: exponential backoff + max failure ceiling + reset condition.

3. **SIGINT/SIGTERM are deliberate stop signals, not crashes.** Check signal before exit code in every supervisor.

4. **Display format = input format.** If you show `abc12345`, accept `abc12345` as input everywhere.

5. **Long-running silent processes erode user trust.** Log every turn. Log every tool call. Log elapsed time and cost.

6. **Package name similarity is a real trap.** `@anthropic-ai/claude-code` (CLI binary, no exports) vs `@anthropic-ai/claude-agent-sdk` (programmatic SDK). Verify package exports before installing.

7. **`git add -A` stages everything.** The agent's commit function stages all changes, including unrelated human files. Should scope to `filesChanged` from the work result.

8. **Source is never rolled back.** When the agent crashes mid-edit, partial edits in `src/` stay. The agent can see what it already changed on next boot. This is a feature, not a bug.

## Prevention Strategies

### For Self-Modifying Systems

- **Maintain a fixed point.** At least one component must never modify itself. This is your trust anchor for recovery.
- **Separate source from runtime.** The agent edits `src/`, runs from `dist/`. A bad edit doesn't crash the running process.
- **Design for crash-restart, not crash-fix.** The recovery path should be the normal startup path. Derive state from durable log, not in-memory checkpoints.
- **Make all state transitions auditable.** Append-only log. HMAC signatures. Never mutate historical entries.
- **Require human gates.** Two gates minimum: approve before work, review after work.
- **Never let the agent process its own intents.** Self-directed modification loops are the primary existential risk.

### Testing Recommendations

1. **Rollback scope isolation:** Create an uncommitted file, trigger agent crash, verify the file survives.
2. **Crash loop backoff:** Force immediate crashes, verify exponential delays and max-5 circuit breaker.
3. **SIGINT clean shutdown:** Send SIGINT, verify no rollback, no restart, clean exit.
4. **Prefix ID resolution:** Test unique prefix, ambiguous prefix, and no-match cases.
5. **Work phase progress output:** Mock LLM with delays, verify per-turn log lines appear.
6. **Build failure rollback:** Commit invalid TypeScript, verify supervisor rolls back to `dist/previous/`.
7. **New version crash rollback:** Deploy crashing agent, verify single rollback to previous version.
8. **HMAC verification:** Post ACCEPT with tampered HMAC, verify agent rejects it.
9. **State recovery after kill -9:** Kill agent mid-work, restart, verify it resumes from promise state.
10. **Self-intent filtering:** Insert agent-sourced intent, verify agent ignores it.

## Commit History

```
70d8ca8 loop: remove 5-minute timeout (agent self-fix)
249acb5 loop: remove /health endpoint (agent self-modification)
66166cc loop: add /health endpoint (first successful self-modification)
08c90d1 docs: mark bun build plan as completed
02f4bf4 feat: blue-green binary swap for supervisor
9d60705 fix: treat SIGINT/SIGTERM as clean shutdown, not crash
2fea362 feat: Agent SDK, prefix IDs, supervisor backoff
5eb007c feat: implement self-modifying agent loop
5d41a07 init: differ-loop repo with plan, ITP types, and project scaffolding
```

Commits `66166cc`, `249acb5`, and `70d8ca8` are evidence of the loop working -- the agent successfully modified its own codebase, and then subsequent intents modified it further.

## Cross-References

### Internal Documents
- [PLAN.md](/PLAN.md) -- Full implementation plan with schema, pseudocode, acceptance criteria
- [BRAINSTORM.md](/BRAINSTORM.md) -- Original design exploration
- [Blue-green build plan](/docs/plans/2026-03-03-feat-bun-build-step-supervisor-plan.md) -- Detailed plan for bun build step

### Promise Theory References
- Mark Burgess, *Thinking in Promises: Designing Systems for Cooperation* (2015, O'Reilly)
  - Ch 1: Agent autonomy -- agents can only promise about own behavior
  - Ch 3 s3.7: Promise polarity (+b give-promise, -b use-promise)
  - Ch 3 s3.11: Cooperative binding -- both +b and -b required
  - Ch 5: Assessment -- subjective judgment by promisee
  - Ch 5 Def 26: Event-driven agents -- promise conditionally on sampling events
  - Ch 17: CFEngine as promise-keeping engine (supervisor analogy)

### Technology
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) -- `query()` for agentic code editing
- [Bun bundler](https://bun.sh/docs/bundler) -- TypeScript compilation with `--external` for native modules
- [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) -- SQLite with WAL mode for concurrent access
- [Commander.js](https://www.npmjs.com/package/commander) -- CLI framework

### Runtime Paths
| Path | Purpose |
|------|---------|
| `~/.differ/loop/promise-log.db` | SQLite promise log (shared state) |
| `~/.differ/loop/.hmac-key` | HMAC-SHA256 signing key (0600) |
| `~/.differ/loop/supervisor.pid` | PID file for supervisor |
| `dist/current/agent.js` | Active compiled agent |
| `dist/previous/agent.js` | Rollback target |
