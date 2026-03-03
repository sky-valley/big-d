---
title: "feat: Add bun build step with blue-green binary swap"
type: feat
status: completed
date: 2026-03-03
---

# Bun build step with blue-green binary swap

## Overview

The supervisor runs the agent from a compiled binary (dist/). When the agent commits source changes and exits, the supervisor builds a new binary, swaps it in, and launches. If the new version fails to start, the supervisor rolls back to the previous known-good binary and restarts from that. No source rollback ever. The supervisor itself is the fixed point — it never changes.

## The Loop

```
Supervisor (fixed, runs via tsx, never self-modifies)
│
├── Build initial binary: bun build src/ → dist/current/
│
└── while (true)
    ├── Launch agent from dist/current/
    ├── Agent edits src/*.ts
    ├── Agent commits changes
    ├── Agent exits
    │   ├── code 0 (source committed, restart requested)
    │   │   ├── cp dist/current/ → dist/previous/    ← snapshot known-good
    │   │   ├── bun build src/ → dist/current/       ← build new version
    │   │   ├── Launch agent from dist/current/
    │   │   │   ├── Starts OK → continue loop
    │   │   │   └── Fails to start → rollback:
    │   │   │       ├── cp dist/previous/ → dist/current/
    │   │   │       └── Launch agent from dist/current/ (known-good)
    │   │   │
    │   ├── code 2 → clean shutdown, stop
    │   ├── SIGINT/SIGTERM → stop (no rollback, no rebuild)
    │   └── crash (mid-work, no commit)
    │       ├── src/ has uncommitted partial edits (that's fine)
    │       ├── dist/current/ still has the pre-crash binary (still good)
    │       └── Restart agent from dist/current/ (same version, retry)
    └── loop
```

Key properties:
- **Exit 0 (commit + restart):** Blue-green swap. Build new, keep old as fallback.
- **Crash (no commit):** Just restart the same binary. The agent resumes from its promise state and can see its partial src/ edits. No source rollback, no rebuild.
- **New version fails to start:** Roll back to previous binary. Agent runs from known-good code.
- **Source is never rolled back.** `git checkout -- .` is gone entirely.
- **Supervisor state is continuous.** The promise log, crash counters, etc. persist across all restarts.

## Technical Approach

### 1. Install bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Directory layout

```
dist/
  current/       ← active binary the agent runs from
    agent.js
    agent.js.map
  previous/      ← last known-good binary (rollback target)
    agent.js
    agent.js.map
```

Both directories are in `.gitignore` (dist/ already is).

### 3. Build function

```typescript
import { rmSync, cpSync, existsSync } from 'fs';

function build(sourceDir: string): boolean {
  const distCurrent = join(sourceDir, 'dist', 'current');
  try {
    rmSync(distCurrent, { recursive: true, force: true });
    execFileSync('bun', [
      'build', 'src/loop/agent.ts',
      '--outdir', join('dist', 'current'),
      '--target', 'node',
      '--format', 'esm',
      '--external', 'better-sqlite3',
      '--external', '@anthropic-ai/claude-agent-sdk',
      '--sourcemap=external',
    ], { cwd: sourceDir, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Build failed:', err);
    return false;
  }
}

function snapshotCurrent(sourceDir: string): void {
  const current = join(sourceDir, 'dist', 'current');
  const previous = join(sourceDir, 'dist', 'previous');
  if (existsSync(current)) {
    rmSync(previous, { recursive: true, force: true });
    cpSync(current, previous, { recursive: true });
  }
}

function rollback(sourceDir: string): boolean {
  const current = join(sourceDir, 'dist', 'current');
  const previous = join(sourceDir, 'dist', 'previous');
  if (!existsSync(previous)) return false;
  rmSync(current, { recursive: true, force: true });
  cpSync(previous, current, { recursive: true });
  return true;
}
```

### 4. Supervisor loop (pseudocode)

```typescript
// Initial build
if (!build(sourceDir)) {
  console.error('Initial build failed. Exiting.');
  return;
}

while (true) {
  const agentEntry = join(sourceDir, 'dist', 'current', 'agent.js');
  const result = spawnSync('node', ['--enable-source-maps', agentEntry], {
    stdio: 'inherit', cwd: sourceDir, env: { ...process.env },
  });

  const code = result.status ?? 1;
  const signal = result.signal;

  if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 130) {
    console.log('Stopped by user.');
    break;
  }

  if (code === 2) {
    console.log('Agent requested shutdown.');
    break;
  }

  if (code === 0) {
    // Agent committed new source. Blue-green swap.
    console.log('Agent committed changes. Building new version...');
    snapshotCurrent(sourceDir);           // save known-good
    if (!build(sourceDir)) {
      console.log('Build failed. Rolling back to previous version.');
      rollback(sourceDir);
    }
    // Either way, continue loop — launch from dist/current/
    consecutiveCrashes = 0;
    continue;
  }

  // Crash — restart same binary (agent can retry with its partial edits in src/)
  consecutiveCrashes++;
  console.log(`Agent crashed (code ${code}). Restarting same version (${consecutiveCrashes}/5)...`);
  if (consecutiveCrashes >= 5) {
    console.error('Too many crashes. Stopping.');
    break;
  }
  const backoff = Math.min(2 ** consecutiveCrashes, 60);
  spawnSync('sleep', [String(backoff)]);
}
```

### 5. Startup health check (placeholder for verification)

For now, "fails to start" = crashes immediately (exit code != 0 within a few seconds). Later this becomes a proper health check:

```typescript
// Future: verify the new agent is healthy
// - Agent responds to a health probe within N seconds
// - Agent successfully connects to the promise log
// - Agent's first API call succeeds
// For now: if the agent crashes on first launch after a build, rollback.
```

### 6. Package.json scripts

```json
{
  "scripts": {
    "build": "bun build src/loop/agent.ts --outdir dist/current --target node --format esm --external better-sqlite3 --external @anthropic-ai/claude-agent-sdk --sourcemap=external",
    "loop": "npm run build && node --env-file=.env node_modules/.bin/tsx src/loop/cli.ts",
    "loop:dev": "node --env-file=.env node_modules/.bin/tsx src/loop/cli.ts",
    "test": "bash scripts/test-loop.sh"
  }
}
```

### 7. Exclude dist/ from agent's work scope

Add to the doWork() system prompt in `src/loop/work.ts`:

```
- Do not modify files in the dist/ directory (it contains compiled output)
```

## Acceptance Criteria

- [x] `bun` installed, `npm run build` produces `dist/current/agent.js` + source map
- [x] `npm run loop -- run` builds, then runs agent from `dist/current/`
- [ ] Exit 0 → snapshot current, build new, swap in, restart
- [ ] New version fails to start → rollback to `dist/previous/`, restart
- [ ] Crash (mid-work) → restart same binary, agent retries with partial src/ edits
- [ ] SIGINT → clean stop, no rollback, no rebuild
- [ ] Build failure on exit 0 → rollback to previous, continue running
- [ ] 5 consecutive crashes → stop supervisor
- [ ] `npm run loop:dev` still works (tsx, no build)
- [x] Source is never rolled back (`git checkout -- .` is removed entirely)
- [x] Agent cannot modify `dist/` (excluded in system prompt)
- [ ] Stack traces show src/ paths via source maps
- [ ] Supervisor state (crash counter, promise log) persists across all restarts

## Files to Change

| File | Change |
|------|--------|
| `package.json` | Add `build` script, update `loop`, add `loop:dev` |
| `src/loop/supervisor.ts` | Add `build()`/`snapshotCurrent()`/`rollback()`, remove `git checkout`, update spawn |
| `src/loop/work.ts` | Add `dist/` exclusion to system prompt |

## Spike Test (before implementation)

```bash
curl -fsSL https://bun.sh/install | bash

bun build src/loop/agent.ts \
  --outdir dist/current \
  --target node \
  --format esm \
  --external better-sqlite3 \
  --external @anthropic-ai/claude-agent-sdk \
  --sourcemap=external

ls -la dist/current/
node --enable-source-maps dist/current/agent.js
```

Verify:
- [x] `.ts` import extensions rewritten in output
- [x] `better-sqlite3` loads at runtime
- [x] `@anthropic-ai/claude-agent-sdk` loads at runtime
- [x] Source maps present and functional
- [x] ESM format (matches `"type": "module"`)

## What We're NOT Doing

- Not compiling to a standalone binary (`bun build --compile`) — that's Phase 2
- Not changing the agent's tool set or behavior
- Not changing the promise protocol or CLI
- Not compiling the supervisor or CLI — only the agent runs from dist/
- Not implementing verification/health checks yet (placeholder for later)
- Not rolling back source. Ever.
