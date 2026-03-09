#!/bin/bash
# Shared test helpers for the Differ loop test suite.
# Source this file from test scripts: source "$(dirname "$0")/test-helpers.sh"

set -euo pipefail

# ============ CLI ============

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="npx tsx $LOOP_DIR/src/loop/cli.ts"

# ============ Test DB Isolation ============

setup_test_db() {
  export DIFFER_DB_DIR=$(mktemp -d)
  echo "Test DB dir: $DIFFER_DB_DIR"
}

cleanup_test_db() {
  if [ -n "${DIFFER_DB_DIR:-}" ] && [ -d "$DIFFER_DB_DIR" ]; then
    rm -rf "$DIFFER_DB_DIR"
  fi
}

# ============ Temp Repo ============

create_temp_repo() {
  # Use short /tmp paths so LLMs don't hallucinate truncated macOS /var/folders paths
  local dir="/tmp/differ-test-$$-$(date +%s)-$RANDOM"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init --initial-branch=main -q
  echo "# Test Repo" > "$dir/README.md"
  git -C "$dir" add README.md
  git -C "$dir" commit -m "initial commit" -q
  echo "$dir"
}

# ============ Supervisor Cleanup ============

cleanup_supervisor() {
  local pid_path="${DIFFER_DB_DIR:-$HOME/.differ/loop}/supervisor.pid"
  if [ -f "$pid_path" ]; then
    local pid
    pid=$(cat "$pid_path")
    kill "$pid" 2>/dev/null || true
    # Wait briefly for clean shutdown
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    # Force kill if still alive
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$pid_path"
  fi
}

# ============ State Polling ============

# Wait for a promise to reach a specific state.
# Usage: wait_for_state <promise_id_prefix> <expected_state> [timeout_seconds]
wait_for_state() {
  local promise_prefix=$1 expected=$2 timeout=${3:-120}
  local elapsed=0 state
  while [ $elapsed -lt $timeout ]; do
    state=$($CLI status --json 2>/dev/null | node -e "
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
  echo "TIMEOUT: expected $expected for $promise_prefix, got $state after ${timeout}s" >&2
  return 1
}

# Wait for any promise to appear for an intent.
# Returns the promise ID on stdout.
# Usage: wait_for_promise <intent_id_prefix> [timeout_seconds]
wait_for_promise() {
  local intent_prefix=$1 timeout=${2:-120}
  local elapsed=0 promise_id
  while [ $elapsed -lt $timeout ]; do
    promise_id=$($CLI status --json 2>/dev/null | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      for (const i of d.intents || []) {
        if (i.intentId.startsWith('$intent_prefix')) {
          const p = (i.promises || [])[0];
          if (p) { console.log(p.promiseId); process.exit(0); }
        }
      }
      console.log('');
    ")
    if [ -n "$promise_id" ]; then
      echo "$promise_id"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "TIMEOUT: no promise found for intent $intent_prefix after ${timeout}s" >&2
  return 1
}

# Wait for a git commit to appear in a repo (polls until commit count exceeds baseline).
# Usage: wait_for_commit <repo_path> <min_commits> [timeout_seconds]
wait_for_commit() {
  local repo=$1 min_commits=$2 timeout=${3:-30}
  local elapsed=0 count
  while [ $elapsed -lt $timeout ]; do
    count=$(git -C "$repo" log --oneline 2>/dev/null | wc -l | tr -d ' ')
    [ "$count" -ge "$min_commits" ] && return 0
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "TIMEOUT: expected >=$min_commits commits in $repo, got $count after ${timeout}s" >&2
  return 1
}

# ============ JSON Extraction ============

# Extract intentId from `intent --json` output
get_intent_id() {
  local output=$1
  echo "$output" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    console.log(d.intentId || '');
  "
}

# Extract first promise ID for an intent from `status --json`
get_promise_id() {
  local intent_prefix=$1
  $CLI status --json 2>/dev/null | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    for (const i of d.intents || []) {
      if (i.intentId.startsWith('$intent_prefix')) {
        const p = (i.promises || [])[0];
        if (p) { console.log(p.promiseId); process.exit(0); }
      }
    }
    console.log('');
  "
}

# ============ Message Injection ============

# Inject an INTENT message directly into the promise log.
# Usage: inject_intent <senderId> <content> [criteria]
# Returns the intentId on stdout.
inject_intent() {
  local sender_id=$1 content=$2 criteria=${3:-}
  node --import tsx -e "
    import { PromiseLog } from '$LOOP_DIR/src/loop/promise-log.ts';
    import { createIntent } from '$LOOP_DIR/../itp/src/protocol.ts';
    const log = new PromiseLog();
    const msg = createIntent('$sender_id', '$content', '$criteria' || undefined);
    log.post(msg);
    console.log(msg.intentId);
    log.close();
  "
}

# Inject a PROMISE message directly into the promise log.
# Usage: inject_promise <agentId> <intentId> [plan]
inject_promise() {
  local agent_id=$1 intent_id=$2 plan=${3:-"Will do the work"}
  node --import tsx -e "
    import { PromiseLog } from '$LOOP_DIR/src/loop/promise-log.ts';
    import { createPromise } from '$LOOP_DIR/../itp/src/protocol.ts';
    const log = new PromiseLog();
    const msg = createPromise('$agent_id', '$intent_id', '$plan');
    log.post(msg);
    console.log(msg.promiseId);
    log.close();
  "
}

# Inject a COMPLETE message directly into the promise log.
# Usage: inject_complete <agentId> <promiseId> [summary]
inject_complete() {
  local agent_id=$1 promise_id=$2 summary=${3:-"Work done"}
  node --import tsx -e "
    import { PromiseLog } from '$LOOP_DIR/src/loop/promise-log.ts';
    import { createComplete } from '$LOOP_DIR/../itp/src/protocol.ts';
    const log = new PromiseLog();
    const msg = createComplete('$agent_id', '$promise_id', '$summary', []);
    log.post(msg);
    log.close();
  "
}

# Inject a DECLINE message directly into the promise log.
# Usage: inject_decline <agentId> <intentId> <reason>
inject_decline() {
  local agent_id=$1 intent_id=$2 reason=$3
  node --import tsx -e "
    import { PromiseLog } from '$LOOP_DIR/src/loop/promise-log.ts';
    import { createDecline } from '$LOOP_DIR/../itp/src/protocol.ts';
    const log = new PromiseLog();
    const msg = createDecline('$agent_id', '$intent_id', '$reason');
    log.post(msg);
    log.close();
  "
}

# ============ Assertions ============

# Assert that a command exits with the expected code.
# Usage: assert_exit_code <expected_code> <command...>
assert_exit_code() {
  local expected=$1
  shift
  local actual=0
  "$@" 2>/dev/null || actual=$?
  if [ "$actual" -ne "$expected" ]; then
    echo "FAIL: expected exit code $expected, got $actual for: $*" >&2
    return 1
  fi
}

# Assert that a command fails (exit 1) and its JSON output contains an error.
# Usage: assert_json_error <pattern> <command...>
assert_json_error() {
  local pattern=$1
  shift
  local output
  output=$("$@" 2>&1) && {
    echo "FAIL: expected non-zero exit, but command succeeded: $*" >&2
    return 1
  }
  if ! echo "$output" | grep -qi "$pattern"; then
    echo "FAIL: expected error containing '$pattern', got: $output" >&2
    return 1
  fi
}

# ============ Logging ============

STEP_NUM=0

step() {
  STEP_NUM=$((STEP_NUM + 1))
  echo "Step $STEP_NUM: $1"
}

pass() {
  echo "  OK"
}
