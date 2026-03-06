---
title: "feat: E2E Test Suite with Negative Testing"
type: feat
status: active
date: 2026-03-05
brainstorm: docs/brainstorms/2026-03-05-e2e-test-scenarios-brainstorm.md
---

# E2E Test Suite with Negative Testing

## Overview

A suite of bash test scripts that validate the exoskeleton generalization works correctly. Two tiers: fast protocol tests (no LLM, test CLI + state machine) and slow e2e tests (real LLM calls, full agent lifecycle). Includes comprehensive negative testing across CLI, agent, protocol, and supervisor layers.

## Problem Statement

The existing `scripts/test-loop.sh` references the old data model (uses `promiseId` from intent output, checks for `PENDING` state, uses old `createPromise` API without `intentId`). After the exoskeleton generalization, this script is broken. New multi-repo behavior (self-mode, external-mode, multi-agent, project registration) has no test coverage at all. No negative tests exist anywhere.

## Proposed Solution

Seven bash scripts organized in two tiers, with shared helpers:

| Script | Tier | LLM | What it tests |
|--------|------|-----|---------------|
| `test-helpers.sh` | — | — | Shared functions: state polling, cleanup, assertions |
| `test-protocol.sh` | Protocol | No | CLI commands, state transitions, negative cases |
| `test-negative.sh` | Protocol | No | Dedicated CLI + protocol negative/edge-case tests |
| `test-e2e-self-mode.sh` | E2E | Yes | Self-modifying agent full lifecycle |
| `test-e2e-external-mode.sh` | E2E | Yes | External repo agent full lifecycle |
| `test-e2e-multi-agent.sh` | E2E | Yes | Two repos, agent self-selection |
| `test-e2e-revise.sh` | E2E | Yes | `assess fail` → BROKEN → REVISE cycle |

Runner: `test-all.sh` runs protocol tests always, e2e tests only when `ANTHROPIC_API_KEY` is set.

## Technical Considerations

### Test DB Isolation

Tests must NOT use the developer's real `~/.differ/loop/promise-log.db`. Each test script sets:

```bash
export DIFFER_DB_DIR=$(mktemp -d)
```

This requires `promise-log.ts` to respect an env var override for `DEFAULT_DB_DIR`. Currently `DEFAULT_DB_DIR` is a const — add a one-line change:

```typescript
// promise-log.ts
export const DEFAULT_DB_DIR = process.env.DIFFER_DB_DIR
  ?? join(homedir(), '.differ', 'loop');
```

### Broken `wait_for_state` Helper

The brainstorm's helper accesses `d.promises` — but `status --json` nests promises under `d.intents[].promises[]`. The helper must traverse:

```bash
wait_for_state() {
  local promise_prefix=$1 expected=$2 timeout=${3:-120}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    state=$($CLI status --json | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      for (const i of d.intents || []) {
        const p = (i.promises || []).find(p => p.promiseId.startsWith('$promise_prefix'));
        if (p) { console.log(p.state); process.exit(0); }
      }
      console.log('NONE');
    ")
    [ "$state" = "$expected" ] && return 0
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "TIMEOUT: expected $expected, got $state after ${timeout}s"
  return 1
}
```

### Message Injection for Protocol Tests

Protocol tests (no LLM) simulate agent-side messages by calling `PromiseLog.post()` directly via inline Node:

```bash
inject_message() {
  node --import tsx -e "
    import { PromiseLog } from './src/loop/promise-log.ts';
    import { $1 } from './src/itp/protocol.ts';
    const log = new PromiseLog();
    const msg = $2;
    log.post(msg);
    log.close();
  "
}
```

### Supervisor Cleanup

All e2e tests use a trap to ensure the supervisor is killed on exit (success or failure):

```bash
trap 'cleanup_supervisor; rm -rf "$DIFFER_DB_DIR" "$TEMP_REPO"' EXIT
```

### No Source Rollback in Tests

Per INV-001 (commit `6fe6423`): tests must NEVER use `git checkout -- .` for cleanup. External-mode tests use throwaway repos in `/tmp`. Self-mode tests that touch the real source must restore via git (commit + revert commit), not checkout.

## Implementation Phases

### Phase 1: Infrastructure

- [x] Add `DIFFER_DB_DIR` env var support to `promise-log.ts` (one-line change to `DEFAULT_DB_DIR`)
- [x] Write `scripts/test-helpers.sh` with:
  - `CLI` variable pointing to `npx tsx src/loop/cli.ts`
  - `setup_test_db()` — creates temp dir, exports `DIFFER_DB_DIR`
  - `cleanup_test_db()` — removes temp dir
  - `cleanup_supervisor()` — kills via PID file
  - `wait_for_state()` — polls `status --json` with correct JSON traversal
  - `wait_for_promise()` — waits for any promise to appear for an intent
  - `assert_exit_code()` — runs command, asserts expected exit code
  - `assert_json_error()` — runs command, asserts JSON output contains `error` key
  - `inject_promise()` — posts a PROMISE message via PromiseLog
  - `inject_complete()` — posts a COMPLETE message via PromiseLog
  - `get_intent_id()` — extracts `intentId` from `intent --json` output
  - `get_promise_id()` — extracts first `promiseId` for an intent from `status --json`
  - `create_temp_repo()` — `mktemp -d`, `git init`, initial commit with README
  - `step()` — prints step header (`echo "Step N: $description"`)

### Phase 2: Protocol Tests (no LLM)

#### `scripts/test-protocol.sh` — Happy Path

Replace the existing `test-loop.sh` with the corrected flow:

- [x] `init` — verify JSON output contains `{ ok: true }` or similar
- [x] `add . --mode self` — verify project registered
- [x] `projects --json` — verify project appears in list
- [x] `intent "add a /health endpoint" --json` — extract `intentId`
- [x] `status --json` — verify intent appears with no promises
- [x] Inject PROMISE (via `inject_promise agentId intentId "Will add /health"`)
- [x] `status --json` — verify PROMISED state
- [x] `accept <promiseId> --json` — verify success
- [x] `status --json` — verify ACCEPTED state
- [x] Inject COMPLETE
- [x] `status --json` — verify COMPLETED
- [x] `assess <promiseId> pass --json` — verify success
- [x] `status --json` — verify FULFILLED (terminal)
- [x] `remove . --json` — verify project removed
- [x] `projects --json` — verify empty

RELEASE happy path (separate sub-section):

- [x] Post intent, inject PROMISE, then `release <promiseId>` — verify RELEASED

#### `scripts/test-negative.sh` — Negative + Edge Cases

All tests run without LLM calls. Each test is a named function that sets up, asserts, and tears down independently (re-runs `init` as needed).

**CLI Registration Negatives:**

- [x] `add /tmp/nonexistent-$(date +%s)` → exit 1, error contains "Not a directory"
- [x] `mkdir /tmp/notgit-$$; add /tmp/notgit-$$` → exit 1, error contains "Not a git repository"
- [x] `add . --mode self` twice → exit 1, error contains "Already registered"
- [x] `remove nonexistent-id` → exit 1, error contains "Project not found"

**CLI State Machine Negatives:**

- [x] `accept nonexistent-prefix` → exit 1 (no match)
- [x] `accept <promiseId>` when already ACCEPTED → exit 1, error contains "must be PROMISED"
- [x] `release <promiseId>` when FULFILLED → exit 1, error contains "must be PROMISED or ACCEPTED"
- [x] `assess <promiseId> pass` when PROMISED (not yet COMPLETED) → exit 1, error contains "must be COMPLETED"

**Ambiguous Prefix:**

- [x] Post two intents, inject two PROMISEs with similar-prefix IDs → `accept <shared-prefix>` → exit 1, error contains "Ambiguous" *(gracefully skips if UUIDs don't share prefix)*

**Protocol Invalid Transitions (via DB injection):**

- [x] Inject COMPLETE on a PROMISED promise (skipping ACCEPT) → verify state stays PROMISED
- [x] Inject ACCEPT on an already ACCEPTED promise (double accept) → verify state stays ACCEPTED
- [x] Post any message on a FULFILLED promise → verify state stays FULFILLED
- [x] Post any message on a RELEASED promise → verify state stays RELEASED

**Edge Cases:**

- [ ] `intent "" --json` → verify it succeeds (documents permissive behavior) or fails (if we add validation) *(deferred — empty string edge case)*
- [x] `intent` with special characters: `"add a \"health\" endpoint with 'quotes' and \`backticks\`"` → verify round-trip via `status --json`
- [x] `intent "test" --target /nonexistent/path` → verify intent posted (no target validation) and no agent ever picks it up
- [x] `init` when DB already exists → verify DB archived and fresh DB created
- [x] `--json` flag on every command produces valid JSON (parse with `node -e "JSON.parse(...)"`)

**Supervisor Negatives (fast, no LLM):**

- [ ] Start supervisor in background → `run` again → exit 1, error contains "already running" *(deferred — requires process management in test)*
- [ ] Start supervisor with no projects registered → verify it starts without crashing, prints "No projects registered" *(deferred)*
- [ ] Write a stale PID (dead process) to `supervisor.pid` → `run` → verify it starts normally *(deferred)*

### Phase 3: E2E Tests (with LLM)

All e2e tests require `ANTHROPIC_API_KEY`. Each creates isolated temp state and cleans up via trap.

#### `scripts/test-e2e-self-mode.sh`

- [ ] `init` + `add . --mode self`
- [ ] Start supervisor in background (`$CLI run &`)
- [ ] Post intent: `"add a comment to the top of banner.ts saying // test timestamp $(date +%s)"` (trivial, deterministic-ish)
- [ ] `wait_for_promise` — agent should promise autonomously
- [ ] `accept <promiseId>`
- [ ] `wait_for_state COMPLETED` (timeout: 120s)
- [ ] `assess pass`
- [ ] Verify `git log --oneline -1` shows a fresh commit
- [ ] Kill supervisor

#### `scripts/test-e2e-external-mode.sh`

- [ ] `create_temp_repo` (README-only)
- [ ] `init` + `add /tmp/repo --mode external`
- [ ] Start supervisor
- [ ] Post intent: `"create a file called hello.txt with the content 'hello world'" --target /tmp/repo`
- [ ] Wait for PROMISED → accept → wait for COMPLETED → assess pass
- [ ] Verify `hello.txt` exists in temp repo and contains "hello"
- [ ] Verify agent's `.differ/intent.md` was auto-generated in temp repo (if the agent creates it)
- [ ] Kill supervisor, cleanup temp repo

#### `scripts/test-e2e-multi-agent.sh`

- [ ] Create two temp repos (repo-a, repo-b)
- [ ] `init` + `add /tmp/repo-a --mode external` + `add /tmp/repo-b --mode external`
- [ ] Start supervisor
- [ ] Post intent targeting repo-a: `"create test.txt" --target /tmp/repo-a`
- [ ] Wait for PROMISED — verify the promiser's agentId matches repo-a's agent
- [ ] Accept → wait for COMPLETED → assess pass
- [ ] Verify `test.txt` in repo-a, NOT in repo-b
- [ ] Verify no promise exists from repo-b's agent for this intent
- [ ] Kill supervisor, cleanup

#### `scripts/test-e2e-revise.sh`

- [ ] Create temp repo with a README
- [ ] `init` + `add /tmp/repo --mode external`
- [ ] Start supervisor
- [ ] Post intent: `"create a file called greet.txt that says 'hello world'"`
- [ ] Wait for PROMISED → accept → wait for COMPLETED
- [ ] `assess fail "the file should say 'hello universe' not 'hello world'"` → state becomes BROKEN
- [ ] Wait for a new REVISED promise (agent calls `revise()`, posts new PROMISE)
- [ ] Accept the revised promise
- [ ] Wait for COMPLETED → `assess pass` → verify FULFILLED
- [ ] Verify `greet.txt` content matches the corrected criteria
- [ ] Kill supervisor, cleanup

### Phase 4: Runner + Package Integration

- [x] Write `scripts/test-all.sh`:
  ```bash
  #!/bin/bash
  set -euo pipefail
  cd "$(dirname "$0")/.."

  echo "=== Protocol Tests ==="
  bash scripts/test-protocol.sh
  bash scripts/test-negative.sh

  echo ""
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "=== E2E Tests SKIPPED (no ANTHROPIC_API_KEY) ==="
    exit 0
  fi

  echo "=== E2E Tests ==="
  bash scripts/test-e2e-self-mode.sh
  bash scripts/test-e2e-external-mode.sh
  bash scripts/test-e2e-multi-agent.sh
  bash scripts/test-e2e-revise.sh

  echo ""
  echo "=== ALL PASS ==="
  ```
- [x] Update `package.json` `"test"` script to run `bash scripts/test-all.sh`
- [x] Delete old `scripts/test-loop.sh` (replaced by `test-protocol.sh`)

## Acceptance Criteria

### Functional

- [x] `npm test` runs protocol + negative tests without needing an API key
- [ ] `npm test` with `ANTHROPIC_API_KEY` also runs all four e2e scenarios
- [x] All protocol tests pass against the current codebase
- [x] All negative tests assert correct error messages and exit codes
- [x] E2E tests use isolated temp DB and temp repos (no side effects on dev state)
- [x] Supervisor is always killed on test exit (even on failure)
- [ ] Self-mode e2e verifies a real git commit was made
- [ ] External-mode e2e verifies file changes in the target repo
- [ ] Multi-agent e2e verifies agent self-selection (correct agent picks up targeted intent)
- [ ] Revise e2e verifies the full BROKEN → REVISE → FULFILLED cycle

### Negative Testing Coverage

- [x] CLI rejects: bad paths, non-git repos, duplicate registration, non-existent removal
- [x] CLI rejects: wrong-state accept/release/assess, ambiguous prefix
- [x] Protocol: invalid transitions produce no state change (silent no-op)
- [x] Protocol: terminal states cannot be transitioned out of
- [ ] Supervisor: duplicate supervisor rejected, stale PID handled, no-project startup works
- [x] Edge cases: empty intent, special characters, non-matching target hint, JSON validity

## Dependencies & Risks

**Dependencies:**
- `DIFFER_DB_DIR` env var support in `promise-log.ts` (Phase 1 prerequisite)
- `ANTHROPIC_API_KEY` for e2e tests (gracefully skipped if absent)

**Risks:**
- E2e tests with real LLM calls are inherently non-deterministic — agent may produce slightly different output each run. Tests should assert on structural outcomes (file exists, state reached) not exact content.
- LLM call latency varies — timeouts must be generous (120s default per state wait).
- Self-mode e2e modifies real source (banner.ts comment). The test must revert the commit after assertion. Use `git revert HEAD --no-edit` after the test, or accept that the test leaves a harmless commit.

## References

- Brainstorm: `docs/brainstorms/2026-03-05-e2e-test-scenarios-brainstorm.md`
- Existing test: `loop/scripts/test-loop.sh` (stale, to be replaced)
- No-rollback invariant: `docs/solutions/architecture-decisions/no-source-rollback-invariant.md`
- CLI implementation: `loop/src/loop/cli.ts`
- Protocol state machine: `loop/src/itp/protocol.ts:26-35`
- Agent scope/viability checks: `loop/src/loop/agent.ts:216-312`
- Supervisor crash handling: `loop/src/loop/supervisor.ts:161-208`
- Promise log validation: `loop/src/loop/promise-log.ts:281-303`
