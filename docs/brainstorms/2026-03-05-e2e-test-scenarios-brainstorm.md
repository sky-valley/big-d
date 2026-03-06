---
title: "E2E Test Scenarios for Generalized Agent Loop"
date: 2026-03-05
status: complete
---

# E2E Test Scenarios for Generalized Agent Loop

## What We're Building

A suite of bash-based e2e test scripts that validate the exoskeleton generalization works correctly. These tests use real LLM calls and exercise the full lifecycle for both self-mode and external-mode agents.

The existing `scripts/test-loop.sh` tests the old protocol flow (references stale `PENDING` state, uses old `promiseId` from intent output). It needs updating, and new scenarios need to cover multi-repo behavior.

## Why This Approach

- **Bash scripts** — matches existing `test-loop.sh` pattern, no test framework to install
- **Real LLM calls** — validates the actual agent behavior end-to-end, not mocked approximations
- **Validation-focused** — goal is to confirm the generalization works, not build a lasting regression suite

## Key Decisions

1. **Layered approach** — Two tiers of tests:
   - **Protocol tests (no LLM)**: Update `test-loop.sh` for the new schema (intents vs promises, `intentId` in output, no `PENDING` state). These are fast and test CLI + state machine.
   - **Full e2e tests (with LLM)**: New scripts that start the supervisor, register repos, post intents, and let the agent actually do work. These are slow and require `ANTHROPIC_API_KEY`.

2. **Scenario-per-file** — Each e2e scenario gets its own script for clarity and independent execution:
   - `scripts/test-protocol.sh` — updated protocol flow (replaces `test-loop.sh`)
   - `scripts/test-e2e-self-mode.sh` — self-modifying lifecycle
   - `scripts/test-e2e-external-mode.sh` — external repo lifecycle
   - `scripts/test-e2e-multi-agent.sh` — two repos registered simultaneously

3. **Temp repos for external-mode** — External-mode tests create a throwaway git repo in `/tmp`, register it, and clean up after. Self-mode tests use the loop repo itself.

4. **Timeouts** — Real LLM calls can be slow. Each e2e script has a configurable timeout (default 120s per scenario) and kills the supervisor on exit.

5. **No cross-agent cooperation test** — Too complex for bash scripts with real LLM calls (requires two agents to coordinate via shared intents). Defer to manual testing.

## Test Scenarios

### Scenario 1: Protocol Flow (no LLM) — `test-protocol.sh`

Update the existing test-loop.sh for the new data model:

```
init → intent "add health endpoint" → check intent exists in status
→ simulate PROMISE (via PromiseLog) → check PROMISED state
→ accept → check ACCEPTED → simulate COMPLETE → check COMPLETED
→ assess pass → check FULFILLED
```

Changes from old script:
- `intent` command returns `intentId`, not `promiseId`
- No `PENDING` state — intent is permanent, promise starts at `PROMISED`
- `createPromise` now takes `intentId` parameter
- Status output groups intents with their promises
- Add: `add`/`remove`/`projects` command tests

### Scenario 2: Self-Mode E2E — `test-e2e-self-mode.sh`

Full lifecycle with real agent:

```
init → add . --mode self → run (background)
→ intent "add a comment to banner.ts" (trivial change)
→ wait for PROMISED → accept
→ wait for COMPLETED → assess pass
→ verify git log shows the commit
→ kill supervisor
```

Key assertions:
- Agent promises autonomously
- Agent edits source after acceptance
- Agent commits and exits(0)
- Supervisor rebuilds and restarts

### Scenario 3: External-Mode E2E — `test-e2e-external-mode.sh`

Full lifecycle targeting a throwaway repo:

```
create temp git repo in /tmp with a README
init → add /tmp/test-repo --mode external
→ run (background)
→ intent "add a hello.txt file" --target /tmp/test-repo
→ wait for PROMISED → accept
→ wait for COMPLETED → assess pass
→ verify hello.txt exists in /tmp/test-repo
→ kill supervisor, rm -rf temp repo
```

Key assertions:
- Agent targets the external repo, not loop/
- Agent commits to the external repo
- Agent loops back to observe (doesn't exit)
- Supervisor doesn't rebuild on exit(0)

### Scenario 4: Multi-Agent — `test-e2e-multi-agent.sh`

Two repos registered, verify both get agents:

```
create two temp repos
init → add /tmp/repo-a → add /tmp/repo-b
→ run (background)
→ projects (verify both listed)
→ intent "add file" --target /tmp/repo-a
→ wait for PROMISED by repo-a's agent
→ accept → wait for COMPLETED
→ verify only repo-a was modified
→ kill supervisor, cleanup
```

Key assertions:
- Supervisor spawns two agent processes
- Intent targeting repo-a is picked up by repo-a's agent, not repo-b's
- Agent self-selection works correctly

## Test Infrastructure

### Helper functions (shared)

```bash
# scripts/test-helpers.sh
wait_for_state() {
  local promise_id=$1 expected_state=$2 timeout=${3:-120}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    state=$($CLI status --json | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      const p = d.promises?.find(p => p.promiseId.startsWith('$promise_id'));
      console.log(p?.state ?? 'NONE');
    ")
    [ "$state" = "$expected_state" ] && return 0
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "TIMEOUT waiting for $expected_state (got $state)"
  return 1
}

cleanup_supervisor() {
  [ -f ~/.differ/loop/supervisor.pid ] && kill $(cat ~/.differ/loop/supervisor.pid) 2>/dev/null || true
}
```

### Runner

```bash
# scripts/test-all.sh
#!/bin/bash
set -euo pipefail
echo "=== Protocol Tests (no LLM) ==="
./scripts/test-protocol.sh
echo ""
echo "=== E2E Tests (requires ANTHROPIC_API_KEY) ==="
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "SKIP: ANTHROPIC_API_KEY not set"
  exit 0
fi
./scripts/test-e2e-self-mode.sh
./scripts/test-e2e-external-mode.sh
./scripts/test-e2e-multi-agent.sh
```

## Open Questions

None — scope is clear. Build these four scripts, share helpers, run with a top-level runner.
