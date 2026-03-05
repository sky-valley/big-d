---
title: "feat: Generalize Agent Loop to Any Repository"
type: feat
status: completed
date: 2026-03-05
brainstorm: docs/brainstorms/2026-03-05-exoskeleton-generalization-brainstorm.md
research: docs/solutions/architecture-decisions/promise-theory-informed-architecture.md
---

# Generalize Agent Loop to Any Repository

## Overview

The agent loop today guards its own source code (self-modifying mode). This plan generalizes it to wrap **any** git repository as an adaptive exoskeleton, while keeping self-modification as a valid special case.

The core architectural shift: separate "agent code" from "target code." The agent becomes a standalone process that can target any repo. The supervisor becomes a multi-agent orchestrator. The promise log gets a corrected data model where intents are permanent declarations and promises are autonomous agent commitments.

## Problem Statement

The current system has 30 identified coupling points that assume "target = self":

- **Schema**: No concept of target repo. INTENT and PROMISE share a `promiseId`, treating intents as tasks to be claimed (imposition pattern).
- **Agent**: Hardcoded TypeScript-only scope checks, self-referential LLM prompts, `process.cwd()` conflated with target repo.
- **Supervisor**: Build pipeline hardcodes `bun build src/loop/agent.ts`. Exit code 0 always triggers rebuild. Single-agent `spawnSync` loop.
- **CLI**: No `--target` option. No project registration. `git diff` runs in CWD.
- **Work**: System prompt hardcodes "self-modifying coding agent working on a TypeScript project."

## Proposed Solution

Six implementation phases, ordered by dependency. The schema redesign is the foundation — everything else builds on it.

## Technical Approach

### Design Decisions (from brainstorm)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | One supervisor, N agents | Each registered repo gets its own agent process |
| 2 | Shared promise log, agent self-selection | CFEngine pattern: distribute everything, filter locally |
| 3 | Intent = declaration, Promise = commitment | Promise Theory first principles. No imposition. |
| 4 | `.differ/intent.md` in target repo | Agent's "class context" for self-selection |
| 5 | `differ add /path/to/repo` for registration | Explicit, stored in `projects` table |
| 6 | Cross-agent cooperation via shared log | Agent posts INTENT, self-modifying agent picks it up |
| 7 | Self-mode restarts, external-mode loops | Exit only when agent's own code changed |
| 8 | Build/deploy as intents | Same protocol for code, build, deploy |
| 9 | UUID agent identity | Smarter identity later |
| 10 | Clean schema break | No backward compat needed |

### Critical Design Resolutions

These questions emerged from SpecFlow analysis. Resolved here:

**Q1: New schema for separated intents and promises.**
Two tables: `intents` (immutable declarations) and `promises` (with state machine). `messages` table stays as-is. Each PROMISE message gets its own `promiseId` with `intent_id` referencing the originating intent. Separate `intent_id` field (not overloaded `parentId`) to distinguish "in response to intent" from "revision of promise."

**Q2: Target repo crash recovery.**
Supervisor reads the `projects` registry. Passes `--target /path/to/repo` as CLI argument to each agent process. On crash, supervisor knows the target path and can reset it.

**Q3: Dirty target repo safety.**
Agent refuses to start work if the target repo has uncommitted changes. Logs a warning and returns to observe. Does NOT run `git checkout -- .` on user's work.

**Q4: Unaccepted promise cleanup.**
Agent polls for ACCEPT. If it sees an ACCEPT message for a *different* agent's promise on the same intent, it self-RELEASEs its own promise and returns to observe.

**Q5: Self-modification triggers all-agent restart.**
Yes. When agent-self exits(0), the supervisor rebuilds the agent binary and restarts ALL agents (they all share the same compiled code).

**Q6: `--target` on intent command.**
A hint stored in `payload.targetRepo`. Agents may use it in self-selection but are not bound by it. Consistent with "scoping is the observer's responsibility."

**Q7: Registration hot-reload.**
Supervisor periodically re-reads the registry (every 10s). New registrations are picked up without restart.

**Q8: Agent concurrency.**
One active promise at a time per agent. Sequential processing. Simpler, easier to reason about.

**Q9: `.differ/intent.md` format.**
Markdown with YAML frontmatter. Agent auto-generates on first contact, human can edit.

### Schema Design

#### New `intents` table (immutable declarations)

```sql
CREATE TABLE IF NOT EXISTS intents (
  intent_id   TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL,
  content     TEXT NOT NULL,
  criteria    TEXT,
  target_hint TEXT,            -- optional target repo hint
  timestamp   INTEGER NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_intents_timestamp ON intents(timestamp);
```

#### New `promises` table (agent commitments with state machine)

```sql
CREATE TABLE IF NOT EXISTS promises (
  promise_id    TEXT PRIMARY KEY,
  intent_id     TEXT NOT NULL REFERENCES intents(intent_id),
  parent_id     TEXT,          -- for REVISE chains only
  agent_id      TEXT NOT NULL,
  current_state TEXT NOT NULL DEFAULT 'PROMISED',
  content       TEXT,
  target_repo   TEXT,          -- the repo this agent will work on
  updated_at    INTEGER NOT NULL,
  CHECK (current_state IN (
    'PROMISED','ACCEPTED','COMPLETED','FULFILLED','BROKEN','REVISED','RELEASED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_promises_intent ON promises(intent_id);
CREATE INDEX IF NOT EXISTS idx_promises_agent ON promises(agent_id);
CREATE INDEX IF NOT EXISTS idx_promises_state ON promises(current_state);
```

#### New `projects` table (registry)

```sql
CREATE TABLE IF NOT EXISTS projects (
  project_id  TEXT PRIMARY KEY,  -- UUID
  repo_path   TEXT NOT NULL UNIQUE,
  agent_id    TEXT NOT NULL,     -- UUID for this agent
  name        TEXT,              -- human-readable, derived from repo
  mode        TEXT NOT NULL DEFAULT 'external',  -- 'self' or 'external'
  registered_at INTEGER NOT NULL,
  CHECK (mode IN ('self', 'external'))
);
```

#### `messages` table (append-only log, minimal changes)

```sql
CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  promise_id TEXT,              -- NULL for INTENT messages
  intent_id  TEXT,              -- set for INTENT and PROMISE messages
  parent_id  TEXT,
  sender_id  TEXT NOT NULL,
  timestamp  INTEGER NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  hmac       TEXT,
  CHECK (type IN ('INTENT','PROMISE','ACCEPT','DECLINE','COMPLETE','ASSESS','REVISE','RELEASE'))
);
```

#### State machine (unchanged)

```
PROMISED  → { ACCEPT: ACCEPTED,  REVISE: REVISED, RELEASE: RELEASED }
ACCEPTED  → { COMPLETE: COMPLETED, RELEASE: RELEASED }
COMPLETED → { ASSESS: FULFILLED|BROKEN }
```

DECLINE does NOT create a promise row. It is recorded in the `messages` table as metadata (which agent declined which intent, with reason) but creates no lifecycle entity.

### `.differ/intent.md` Format

```markdown
---
name: my-api
language: typescript
build_command: npm run build
test_command: npm test
project_type: web-api
frameworks:
  - express
  - prisma
constraints:
  - Do not modify files outside src/
  - Do not modify database migrations without review
generated_at: 2026-03-05T12:00:00Z
updated_at: 2026-03-05T12:00:00Z
---

# My API

A REST API for managing user accounts, built with Express and Prisma.

## Key Conventions

- All routes defined in src/routes/
- Database models in prisma/schema.prisma
- Tests in __tests__/
- Environment variables in .env (never committed)
```

The YAML frontmatter drives scope checks and system prompt generation. The body provides context for the LLM viability check and work prompt.

### Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Supervisor                 │
                    │  (reads projects registry,           │
                    │   spawns N agent processes,          │
                    │   manages lifecycle per-agent)       │
                    └──┬──────────┬──────────┬─────────┬──┘
                       │          │          │         │
                 ┌─────▼───┐ ┌───▼─────┐ ┌──▼────┐   │ (re-reads
                 │ Agent A  │ │ Agent B │ │ Agent │   │  registry
                 │ mode:self│ │ mode:ext│ │ mode: │   │  every 10s)
                 │ target:  │ │ target: │ │ ext   │   │
                 │ loop/    │ │ api/    │ │ web/  │   │
                 └────┬─────┘ └───┬─────┘ └──┬────┘   │
                      │           │          │         │
                      ▼           ▼          ▼         │
                 ┌──────────────────────────────────────┘
                 │     Shared Promise Log (SQLite)
                 │  ┌─────────┐  ┌──────────┐  ┌──────────┐
                 │  │ intents │  │ promises  │  │ projects │
                 │  └─────────┘  └──────────┘  └──────────┘
                 └─────────────────────────────────────────
                                    ▲
                              ┌─────┴─────┐
                              │   Human   │
                              │   (CLI)   │
                              └───────────┘
```

## Implementation Phases

### Phase 1: Protocol Layer + Schema

**Goal:** New data model. Foundation for everything else.

**Success criteria:** New schema DDL. Updated types. Factory functions work with intent/promise separation. Old DB archived, new DB created on `differ init`.

#### Tasks

##### 1.1 Update `src/itp/types.ts`

Add `targetRepo` and `intentId` to `ITPPayload`:

```typescript
// src/itp/types.ts
export interface ITPPayload {
  content?: string;
  criteria?: string;
  reason?: string;
  assessment?: AssessmentResult;
  revisedContent?: string;
  plan?: string;
  filesChanged?: string[];
  summary?: string;
  targetRepo?: string;   // NEW: optional target hint on INTENT
  intentId?: string;     // NEW: links PROMISE back to INTENT
}
```

##### 1.2 Update `src/itp/protocol.ts`

- `createIntent()`: Add optional `targetRepo` parameter → stored in `payload.targetRepo`
- `createPromise()`: Change signature — takes `intentId` as new required param, generates its own `promiseId` (no longer reuses the intent's ID). Stores `payload.intentId`.
- Remove `PENDING` from the state machine. Intents have no state. Promises start at `PROMISED`.
- `TRANSITIONS` update:

```typescript
const TRANSITIONS: Record<PromiseState, Partial<Record<ITPMessageType, PromiseState>>> = {
  // PENDING removed — intents have no state machine
  PROMISED:  { ACCEPT: 'ACCEPTED', REVISE: 'REVISED', RELEASE: 'RELEASED' },
  ACCEPTED:  { COMPLETE: 'COMPLETED', RELEASE: 'RELEASED' },
  COMPLETED: { ASSESS: 'FULFILLED' }, // dispatches to FULFILLED or BROKEN
  DECLINED:  {},
  FULFILLED: {},
  BROKEN:    {},
  REVISED:   {},
  RELEASED:  {},
};
```

- Update `PromiseState` type: remove `'PENDING'`
- Update `TERMINAL_STATES`: add `'DECLINED'` if not already there

##### 1.3 Rewrite `src/loop/promise-log.ts` schema

- Replace existing `SCHEMA` constant with new DDL (intents, promises, projects, messages tables)
- `post()` method: split transaction logic:
  - INTENT → insert into `intents` table + `messages` table. No `promise_state` update.
  - PROMISE → insert into `promises` table (new promiseId, intent_id, agent_id) + `messages` table
  - DECLINE → insert into `messages` table only (no promise entity created)
  - ACCEPT/COMPLETE/ASSESS/REVISE/RELEASE → update `promises` table state + `messages` table
- Rewrite queries:
  - `getUnpromisedIntents()` → `getOpenIntents()`: intents with no FULFILLED promise
  - `getPromiseState()` → reads from `promises` table
  - `getAllPromises()` → joins `intents` and `promises`
  - `getActivePromiseForAgent(agentId)` → reads from `promises` where `agent_id = ?` and state is non-terminal
- Add new queries:
  - `getPromisesForIntent(intentId)` → all promises referencing an intent
  - `getProject(projectId)` / `getAllProjects()` → registry queries
  - `registerProject(repoPath, mode)` → insert into `projects`
  - `removeProject(projectId)` → delete from `projects`, RELEASE active promises
- `init` command: archive old DB, create new one

##### 1.4 Update `PromiseLog` constructor

- Keep `DEFAULT_DB_DIR` at `~/.differ/loop/` for now
- On `init`, if old `promise-log.db` exists, rename to `promise-log.db.bak`

---

### Phase 2: Agent Generalization

**Goal:** Agent can target any repo. Self-mode and external-mode work correctly.

**Success criteria:** Agent boots with a `--target` argument, reads `.differ/intent.md` from the target, uses it for scope checks and prompts. Self-mode exits after commit. External-mode loops back.

**Depends on:** Phase 1

#### Tasks

##### 2.1 Agent identity and target configuration

`src/loop/agent.ts`:

- Replace `const AGENT_ID = 'agent'` with UUID read from config/env
- Add CLI argument parsing: `--target <path>` and `--agent-id <uuid>` and `--mode <self|external>`
- Separate `agentDir` (where agent code lives) from `targetDir` (the repo to edit)
- On boot: if `targetDir` has no `.differ/intent.md`, auto-generate it (Phase 2.3)

```typescript
// src/loop/agent.ts (new boot sequence)
const agentId = process.env.DIFFER_AGENT_ID ?? 'agent';
const targetDir = process.env.DIFFER_TARGET_DIR ?? process.cwd();
const mode: 'self' | 'external' = (process.env.DIFFER_MODE as any) ?? 'self';
```

##### 2.2 Dynamic scope checks

`src/loop/agent.ts`:

- Remove hardcoded `OUT_OF_SCOPE_PATTERNS`
- Replace with a function that reads `.differ/intent.md` from `targetDir` and generates scope rules:
  - Language constraint from `language` field
  - Path constraints from `constraints` field
  - Project description from the markdown body
- Viability check prompt reads the project description from `.differ/intent.md` instead of hardcoding "self-modifying agent loop"

```typescript
// src/loop/agent.ts
interface ProjectContext {
  name: string;
  language: string;
  description: string;
  constraints: string[];
  buildCommand?: string;
  frameworks: string[];
}

function loadProjectContext(targetDir: string): ProjectContext {
  const intentPath = join(targetDir, '.differ', 'intent.md');
  // Parse YAML frontmatter + markdown body
  // Return structured context
}

function scopeCheck(intentContent: string, ctx: ProjectContext): string | null {
  // Dynamic checks based on project context
  // e.g., if ctx.language !== detected language in intent → decline
}
```

##### 2.3 Auto-generate `.differ/intent.md`

`src/loop/agent.ts` (new function):

- On first boot against a target repo with no `.differ/intent.md`:
  - Read `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `README.md`, etc.
  - Make a 1-turn LLM call to generate the intent document
  - Write to `targetDir/.differ/intent.md`
  - Commit to the target repo: `git add .differ/intent.md && git commit -m "differ: initialize project intent document"`
- On subsequent boots: read existing `.differ/intent.md`

##### 2.4 Self-selection algorithm

`src/loop/agent.ts` (modify observe loop):

- Load project context from `.differ/intent.md`
- For each open intent:
  1. Check `payload.targetRepo` hint — if set and doesn't match this agent's target, skip (not decline — just skip, another agent will handle it)
  2. Run dynamic scope check against project context
  3. If scope passes, run viability check with project-specific prompt
  4. If viable, create PROMISE (new promiseId, intentId = intent's id)
- Filter: skip intents where this agent has already promised or declined

##### 2.5 Lifecycle modes

`src/loop/agent.ts`:

- Rename `commitAndExit()` to `commitPhase()`
- If `mode === 'self'`: commit + `process.exit(0)` (triggers rebuild)
- If `mode === 'external'`: commit + return (loops back to observe)
- On crash recovery: use `targetDir` for `git checkout -- .`, not CWD
- Safety: if target repo is dirty on boot (and no active promise in ACCEPTED state), refuse to work — log warning, skip to observe

```typescript
async function commitPhase(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  targetDir: string,
  mode: 'self' | 'external',
): Promise<void> {
  // ... git add, commit in targetDir ...
  if (mode === 'self') {
    promiseLog.close();
    process.exit(0);
  }
  // external mode: return to caller, which loops back to observe
}
```

##### 2.6 Unaccepted promise self-release

`src/loop/agent.ts` (modify `waitAccept()`):

- While polling for ACCEPT on this agent's promise, also watch for ACCEPT on *other* agents' promises for the same intent
- If another agent's promise is accepted: self-RELEASE own promise, return to observe

```typescript
// In waitAccept():
if (msg.type === 'ACCEPT' && msg.promiseId !== myPromiseId) {
  // Another agent was accepted for this intent
  const otherPromise = promiseLog.getPromiseState(msg.promiseId);
  if (otherPromise && otherPromise.intentId === myIntentId) {
    const releaseMsg = createRelease(agentId, myPromiseId, 'Another agent was accepted');
    promiseLog.post(releaseMsg);
    log('Another agent accepted for this intent. Self-releasing.');
    return;
  }
}
```

##### 2.7 Commit message format

`src/loop/agent.ts`:

- Replace hardcoded `"loop: ${intentContent}"` with project-aware format
- Read `name` from `.differ/intent.md` frontmatter
- Format: `"${projectName}: ${intentContent}"`

---

### Phase 3: Work Generalization

**Goal:** `doWork()` generates a project-appropriate system prompt and operates on the target repo.

**Success criteria:** LLM receives correct context about the target project. Files are edited in the target repo.

**Depends on:** Phase 2

#### Tasks

##### 3.1 Dynamic system prompt

`src/loop/work.ts`:

- `doWork()` signature: add `projectContext: ProjectContext` parameter
- Generate system prompt from project context:

```typescript
function generateSystemPrompt(ctx: ProjectContext): string {
  const rules = [
    `You are a coding agent working on ${ctx.name}, a ${ctx.language} project.`,
    ctx.description ? `\nProject description: ${ctx.description}` : '',
    '\nRules:',
    '- Read existing files before modifying them to understand context',
    '- Follow existing code style and conventions',
    '- Keep changes minimal and focused on the intent',
    '- Do not modify files outside the project root',
    ...ctx.constraints.map(c => `- ${c}`),
  ];
  return rules.filter(Boolean).join('\n');
}
```

##### 3.2 Rename `cwd` to `targetDir`

`src/loop/work.ts`:

- Rename parameter in `doWork()` and `getChangedFiles()`
- Pass `targetDir` to the Claude Agent SDK `query()` as `cwd`

---

### Phase 4: Supervisor Multi-Agent

**Goal:** Supervisor manages N agent processes concurrently.

**Success criteria:** `differ run` spawns one agent per registered project. Self-mode agent restart triggers all-agent rebuild. External-mode agent crash triggers restart of just that agent.

**Depends on:** Phase 2

#### Tasks

##### 4.1 Rewrite supervisor from `spawnSync` to `spawn`

`src/loop/supervisor.ts`:

- Replace the `while (true) { spawnSync(...) }` loop with concurrent child process management
- Use Node's `spawn` (async) with event handlers per agent
- Track agent processes in a `Map<projectId, ChildProcess>`

```typescript
// src/loop/supervisor.ts
import { spawn, ChildProcess } from 'child_process';

interface AgentHandle {
  projectId: string;
  repoPath: string;
  agentId: string;
  mode: 'self' | 'external';
  process: ChildProcess | null;
  consecutiveCrashes: number;
}

const agents = new Map<string, AgentHandle>();
```

##### 4.2 Agent spawning with per-agent config

- Read `projects` table from promise log
- For each project, spawn an agent with env vars:

```typescript
function spawnAgent(handle: AgentHandle, agentEntry: string): void {
  const child = spawn('node', ['--enable-source-maps', agentEntry], {
    stdio: 'inherit', // TODO: per-agent log files later
    env: {
      ...process.env,
      DIFFER_AGENT_ID: handle.agentId,
      DIFFER_TARGET_DIR: handle.repoPath,
      DIFFER_MODE: handle.mode,
    },
  });

  child.on('exit', (code, signal) => {
    handleAgentExit(handle, code, signal);
  });

  handle.process = child;
}
```

##### 4.3 Exit code handling per-mode

```typescript
function handleAgentExit(handle: AgentHandle, code: number | null, signal: string | null): void {
  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    // User killed it, don't restart
    return;
  }

  if (code === 2) {
    // Clean shutdown, remove from active agents
    agents.delete(handle.projectId);
    return;
  }

  if (code === 0 && handle.mode === 'self') {
    // Self-modifying agent committed changes. Rebuild ALL agents.
    rebuildAndRestartAll();
    return;
  }

  if (code === 0 && handle.mode === 'external') {
    // External agent finished work. Restart to pick up next intent.
    handle.consecutiveCrashes = 0;
    spawnAgent(handle, agentEntry(agentDir));
    return;
  }

  // Crash
  handle.consecutiveCrashes++;
  if (handle.consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
    console.error(`Agent ${handle.agentId} crashed ${handle.consecutiveCrashes} times. Stopping.`);
    return;
  }

  // Crash recovery: reset target repo if dirty
  resetTargetRepo(handle.repoPath);

  const backoff = Math.min(2 ** handle.consecutiveCrashes, 60);
  setTimeout(() => spawnAgent(handle, agentEntry(agentDir)), backoff * 1000);
}
```

##### 4.4 Registry hot-reload

- Every 10 seconds, re-read the `projects` table
- Spawn agents for newly registered projects
- Stop agents for removed projects (send SIGTERM, RELEASE active promises)

##### 4.5 Build pipeline: conditional on self-mode

- `build()` function stays — only called on initial startup and when self-mode agent exits(0)
- `rebuildAndRestartAll()`: stop all agents, rebuild, restart all
- Blue-green swap only applies to agent binary, not to target repos

##### 4.6 Split `sourceDir` into `agentDir`

- `runSupervisor(agentDir: string)` — the loop's own source directory
- Each agent gets its own `targetDir` from the registry
- PID file stays singular (one supervisor process)

---

### Phase 5: CLI

**Goal:** CLI supports multi-repo operations.

**Success criteria:** `differ add`, `differ intent --target`, `differ status` showing intent/promise tree, `differ remove`.

**Depends on:** Phase 1

#### Tasks

##### 5.1 `differ add <path>` command

`src/loop/cli.ts`:

```typescript
program
  .command('add <path>')
  .description('Register a repository with Differ')
  .option('--name <name>', 'Human-readable project name')
  .option('--mode <mode>', 'Agent mode: self or external', 'external')
  .action((path, opts) => {
    const absPath = resolve(path);
    // Validate it's a git repo
    // Generate UUID for agent
    // Insert into projects table
    // Print confirmation
  });
```

##### 5.2 `differ remove <name-or-path>` command

- Remove from `projects` table
- RELEASE any active promises for that agent
- Supervisor will stop the agent on next registry poll

##### 5.3 Update `differ intent` with `--target`

- Add `--target <path>` option (hint, stored in `payload.targetRepo`)
- Call updated `createIntent()` with `targetRepo` parameter

##### 5.4 Update `differ accept`

- Must now reference a promise ID (not an intent ID)
- Show which agent made the promise and for which intent
- If multiple promises exist for the intent, list them and let user choose

##### 5.5 Update `differ status`

- Show intents as top-level entities
- Group promises under their parent intents
- Show agent name/ID and target repo for each promise
- Show registered projects with their agent status

```
Intents:
  abc-123  "add a health check endpoint"
    ├─ PROMISE def-456 by agent-api (my-api/) — PROMISED
    ├─ PROMISE ghi-789 by agent-web (my-web/) — DECLINED: "not relevant"
    └─ no other promises

Projects:
  my-api   /Users/me/code/api    agent-abc  external  idle
  loop     /Users/me/work/loop   agent-def  self      observing
```

##### 5.6 Update `differ assess`

- Run `git diff HEAD~1` in the target repo (read target path from the promise's `target_repo` field)

##### 5.7 Update `differ run`

- No longer takes implicit CWD as sourceDir
- Reads `agentDir` from the loop's own location (or CWD as default)
- Supervisor spawns agents based on the registry

---

### Phase 6: Integration + Polish

**Goal:** Everything works end-to-end. Both modes tested.

**Success criteria:** Full lifecycle works for self-mode AND external-mode. Cross-agent cooperation works.

**Depends on:** All previous phases

#### Tasks

##### 6.1 End-to-end test: self-mode

- `differ init` (clean break, new DB)
- `differ add . --mode self` (register loop itself)
- `differ intent "add a /health endpoint"`
- `differ run` → agent promises, human accepts, agent works, human assesses
- Agent commits, exits(0), supervisor rebuilds, restarts

##### 6.2 End-to-end test: external-mode

- Create a test repo (simple Node project)
- `differ add /path/to/test-repo --mode external`
- `differ intent "add a README"`
- `differ run` → agent promises on the test repo intent
- Human accepts, agent works in the test repo
- Human assesses, agent commits to test repo, loops back to observe (no restart)

##### 6.3 End-to-end test: multi-agent

- Register both the loop (self) and a test repo (external)
- Post an ambiguous intent
- Verify both agents evaluate it
- One promises, one declines (or both promise, human picks)
- Verify unaccepted promise self-releases

##### 6.4 End-to-end test: cross-agent cooperation

- External agent posts an INTENT (e.g., "improve scope check logic")
- Self-modifying agent picks it up
- Verify the full promise lifecycle across agents

##### 6.5 Update banner

`src/loop/banner.ts`: Update subtitle from "self-modifying agent" to "adaptive agent loop" or similar.

##### 6.6 Update documentation

- `loop/CLAUDE.md`: Update identity, exit code table, architecture description
- `loop/README.md`: Update commands, add `differ add`, update workflow walkthrough
- Root `CLAUDE.md`: Update description

## Acceptance Criteria

### Functional Requirements

- [x] `differ add /path/to/repo` registers a project and spawns an agent
- [x] `differ intent "..." --target /path` posts intent with target hint
- [x] Agent auto-generates `.differ/intent.md` on first contact with a repo
- [x] Agent self-selects intents based on project context (not hardcoded regex)
- [x] Multiple agents can promise on the same intent
- [x] Human ACCEPTs one promise; other agents self-RELEASE
- [x] Self-mode agent: commit → exit(0) → supervisor rebuilds all → restart
- [x] External-mode agent: commit → loop back to observe (no exit)
- [x] Agent refuses to work on dirty target repo (uncommitted user changes)
- [x] `differ status` shows intent/promise tree with per-agent info
- [x] Cross-agent cooperation: external agent posts intent, self-modifying agent picks it up
- [x] Crash recovery works in both modes (correct repo is reset)

### Non-Functional Requirements

- [x] SQLite WAL mode handles N concurrent agents without SQLITE_BUSY at N <= 5
- [x] Agent boot time < 5s including `.differ/intent.md` read
- [x] Supervisor hot-reloads registry within 10s of `differ add`

### Quality Gates

- [x] All existing self-modifying functionality still works (backward compat at behavior level)
- [x] No hardcoded "self-modifying agent loop" or "TypeScript" strings remain in agent/work code
- [x] CLAUDE.md updated with new architecture and commands

## Risk Analysis & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Supervisor rewrite (spawnSync → spawn) is architecturally different | High | Keep the spawnSync path for single-agent mode as fallback. Test supervisor independently. |
| `.differ/intent.md` auto-generation produces poor project description | Medium | Make it a reviewable step — agent generates, human can edit before first work cycle. |
| SQLite contention at higher agent counts | Low | WAL + busy_timeout handles N<=5. Monitor and consider per-agent DBs if contention appears. |
| Self-mode exit(0) triggering all-agent restart is disruptive | Medium | Keep self-mode changes rare. Consider a "rebuild on next idle" strategy instead of immediate restart. |
| `git checkout -- .` on wrong repo | Critical | Agent explicitly tracks which repo it targets. Refuse to reset if targetDir is not in projects registry. |

## Dependencies & Prerequisites

- Node.js built-in `child_process.spawn` (no new deps)
- Existing `better-sqlite3` handles the new schema
- Claude Agent SDK `query()` for `.differ/intent.md` generation and viability checks

No new npm dependencies required.

## References & Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-03-05-exoskeleton-generalization-brainstorm.md`
- Architecture decisions: `docs/solutions/architecture-decisions/promise-theory-informed-architecture.md`
- Current agent: `src/loop/agent.ts` (30 coupling points identified)
- Current supervisor: `src/loop/supervisor.ts` (5 changes needed)
- Current schema: `src/loop/promise-log.ts:20-45`
- Protocol: `src/itp/protocol.ts` (state machine, factory functions)
- Types: `src/itp/types.ts` (ITPPayload, PromiseState)

### External References

- [CFEngine Classes Documentation](https://docs.cfengine.com/docs/3.26/reference-promise-types-classes.html) — scoping pattern
- [Kubernetes Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) — reconciliation loop pattern
- Mark Burgess, *Thinking in Promises* (2015) — formal framework
