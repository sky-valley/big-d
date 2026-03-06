#!/bin/bash
# Negative tests — error paths, invalid inputs, edge cases.
# No LLM calls. Each test function is independent.

source "$(dirname "$0")/test-helpers.sh"

echo "=== Negative Tests ==="

FAILURES=0

# Run a named test. Re-initializes the DB for each test.
run_test() {
  local name=$1
  shift
  STEP_NUM=0
  echo ""
  echo "--- $name ---"
  # Fresh DB for each test
  setup_test_db
  $CLI init --json > /dev/null 2>&1
  if "$@"; then
    echo "  PASS: $name"
  else
    echo "  FAIL: $name"
    FAILURES=$((FAILURES + 1))
  fi
  cleanup_test_db
}

# ============ CLI Registration Negatives ============

test_add_nonexistent_path() {
  step "add non-existent path"
  assert_json_error "Not a directory" $CLI add "/tmp/nonexistent-$$-$(date +%s)" --json
}

test_add_not_git_repo() {
  step "add directory that is not a git repo"
  local dir
  dir=$(mktemp -d)
  assert_json_error "Not a git repository" $CLI add "$dir" --json
  rm -rf "$dir"
}

test_add_duplicate() {
  step "add same path twice"
  local repo
  repo=$(create_temp_repo)
  $CLI add "$repo" --mode external --name dup-test --json > /dev/null
  assert_json_error "Already registered" $CLI add "$repo" --mode external --json
  rm -rf "$repo"
}

test_remove_nonexistent() {
  step "remove non-existent project"
  assert_json_error "Project not found" $CLI remove "nonexistent-$$" --json
}

# ============ CLI State Machine Negatives ============

test_accept_nonexistent() {
  step "accept non-existent promise"
  assert_json_error "NOT_FOUND" $CLI accept "zzzzzzzz" --json
}

test_accept_already_accepted() {
  step "accept a promise that is already ACCEPTED"
  local out
  out=$($CLI intent "test double accept" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  # Second accept should fail
  assert_json_error "must be PROMISED" $CLI accept "$pid" --json
}

test_release_fulfilled() {
  step "release a FULFILLED promise (terminal state)"
  local out
  out=$($CLI intent "test release fulfilled" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  inject_complete "agent" "$pid" "done" > /dev/null
  $CLI assess "$pid" pass --json > /dev/null
  # Now try to release — should fail
  assert_json_error "must be PROMISED or ACCEPTED" $CLI release "$pid" --json
}

test_assess_not_completed() {
  step "assess a PROMISED promise (not yet COMPLETED)"
  local out
  out=$($CLI intent "test early assess" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  # Skip accept+complete, go straight to assess
  assert_json_error "must be COMPLETED" $CLI assess "$pid" pass --json
}

test_assess_accepted_not_completed() {
  step "assess an ACCEPTED promise (not yet COMPLETED)"
  local out
  out=$($CLI intent "test assess accepted" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  # Try to assess before COMPLETE
  assert_json_error "must be COMPLETED" $CLI assess "$pid" pass --json
}

# ============ Ambiguous Prefix ============

test_ambiguous_prefix() {
  step "accept with ambiguous prefix"
  # Post two intents and inject two promises
  local out1 out2
  out1=$($CLI intent "first ambiguous test" --json)
  out2=$($CLI intent "second ambiguous test" --json)
  local iid1 iid2
  iid1=$(get_intent_id "$out1")
  iid2=$(get_intent_id "$out2")
  local pid1 pid2
  pid1=$(inject_promise "agent" "$iid1" "plan 1")
  pid2=$(inject_promise "agent" "$iid2" "plan 2")

  # Find common prefix between the two promise IDs (try first 1 char)
  # UUIDs are random enough that 1-char prefix may match both
  local prefix="${pid1:0:1}"
  local matches
  matches=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    let count = 0;
    for (const i of d.intents) {
      for (const p of i.promises || []) {
        if (p.promiseId.startsWith('$prefix')) count++;
      }
    }
    console.log(count);
  ")

  if [ "$matches" -ge 2 ]; then
    # We have an ambiguous prefix
    assert_json_error "Ambiguous" $CLI accept "$prefix" --json
  else
    # UUIDs didn't share a prefix — skip this test gracefully
    echo "  SKIP: promise IDs don't share a prefix (UUIDs diverged at char 1)"
  fi
}

# ============ Protocol Invalid Transitions ============

test_invalid_complete_on_promised() {
  step "COMPLETE on a PROMISED promise (skipping ACCEPT) — no state change"
  local out
  out=$($CLI intent "test skip accept" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  # Inject COMPLETE without ACCEPT — should be silently ignored
  inject_complete "agent" "$pid" "done" > /dev/null
  local state
  state=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    for (const i of d.intents) {
      const p = i.promises.find(p => p.promiseId === '$pid');
      if (p) { console.log(p.state); process.exit(0); }
    }
    console.log('NOT_FOUND');
  ")
  [ "$state" = "PROMISED" ] || { echo "FAIL: expected state to stay PROMISED, got $state"; return 1; }
}

test_double_accept_injection() {
  step "double ACCEPT via injection — no state change beyond ACCEPTED"
  local out
  out=$($CLI intent "test double accept inject" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  # Inject a second ACCEPT directly
  node --import tsx -e "
    import { PromiseLog } from '$LOOP_DIR/src/loop/promise-log.ts';
    import { createAccept } from '$LOOP_DIR/src/itp/protocol.ts';
    const log = new PromiseLog();
    log.post(createAccept('human', '$pid'));
    log.close();
  "
  local state
  state=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    for (const i of d.intents) {
      const p = i.promises.find(p => p.promiseId === '$pid');
      if (p) { console.log(p.state); process.exit(0); }
    }
    console.log('NOT_FOUND');
  ")
  [ "$state" = "ACCEPTED" ] || { echo "FAIL: expected ACCEPTED, got $state"; return 1; }
}

test_transition_on_terminal_fulfilled() {
  step "any message on FULFILLED promise — no state change"
  local out
  out=$($CLI intent "test terminal fulfilled" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  inject_complete "agent" "$pid" "done" > /dev/null
  $CLI assess "$pid" pass --json > /dev/null
  # Try to inject COMPLETE again
  inject_complete "agent" "$pid" "done again" > /dev/null
  local state
  state=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    for (const i of d.intents) {
      const p = i.promises.find(p => p.promiseId === '$pid');
      if (p) { console.log(p.state); process.exit(0); }
    }
    console.log('NOT_FOUND');
  ")
  [ "$state" = "FULFILLED" ] || { echo "FAIL: expected FULFILLED, got $state"; return 1; }
}

test_transition_on_terminal_released() {
  step "any message on RELEASED promise — no state change"
  local out
  out=$($CLI intent "test terminal released" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI release "$pid" --json > /dev/null
  # Try to accept the released promise
  assert_json_error "must be PROMISED" $CLI accept "$pid" --json
}

# ============ Edge Cases ============

test_special_characters_in_intent() {
  step "intent with special characters survives round-trip"
  local content='add a "health" endpoint with '"'"'quotes'"'"' and `backticks`'
  local out
  out=$($CLI intent "$content" --json)
  local iid
  iid=$(get_intent_id "$out")
  [ -n "$iid" ] || { echo "FAIL: no intentId"; return 1; }
  # Verify it appears in status
  local found
  found=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    const i = d.intents.find(i => i.intentId === '$iid');
    console.log(i ? 'found' : 'missing');
  ")
  [ "$found" = "found" ] || { echo "FAIL: intent not found in status"; return 1; }
}

test_intent_with_target_no_match() {
  step "intent with --target to non-registered path"
  local out
  out=$($CLI intent "test targeted intent" --target /tmp/nonexistent --json)
  local iid
  iid=$(get_intent_id "$out")
  [ -n "$iid" ] || { echo "FAIL: no intentId"; return 1; }
  # Intent should be posted successfully (no validation on target)
  pass
}

test_reinit_archives_db() {
  step "init when DB already exists — archives old DB"
  # DB already created by run_test. Post something to it.
  $CLI intent "before reinit" --json > /dev/null
  # Reinit
  $CLI init --json > /dev/null
  # Status should show empty (fresh DB)
  local count
  count=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    console.log((d.intents || []).length);
  ")
  [ "$count" -eq 0 ] || { echo "FAIL: expected 0 intents after reinit, got $count"; return 1; }
  # Check archive file exists
  local archives
  archives=$(ls "$DIFFER_DB_DIR"/promise-log.db.bak.* 2>/dev/null | wc -l)
  [ "$archives" -ge 1 ] || { echo "FAIL: no archive file found"; return 1; }
}

test_assess_fail_produces_broken() {
  step "assess fail produces BROKEN state"
  local out
  out=$($CLI intent "test assess fail" --json)
  local iid
  iid=$(get_intent_id "$out")
  local pid
  pid=$(inject_promise "agent" "$iid" "plan")
  $CLI accept "$pid" --json > /dev/null
  inject_complete "agent" "$pid" "done" > /dev/null
  $CLI assess "$pid" fail "not good enough" --json > /dev/null
  local state
  state=$($CLI status --json | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    for (const i of d.intents) {
      const p = i.promises.find(p => p.promiseId === '$pid');
      if (p) { console.log(p.state); process.exit(0); }
    }
    console.log('NOT_FOUND');
  ")
  [ "$state" = "BROKEN" ] || { echo "FAIL: expected BROKEN, got $state"; return 1; }
}

# ============ Run All Tests ============

run_test "CLI: add non-existent path" test_add_nonexistent_path
run_test "CLI: add non-git directory" test_add_not_git_repo
run_test "CLI: add duplicate" test_add_duplicate
run_test "CLI: remove non-existent" test_remove_nonexistent
run_test "CLI: accept non-existent promise" test_accept_nonexistent
run_test "CLI: accept already accepted" test_accept_already_accepted
run_test "CLI: release fulfilled promise" test_release_fulfilled
run_test "CLI: assess non-completed (PROMISED)" test_assess_not_completed
run_test "CLI: assess non-completed (ACCEPTED)" test_assess_accepted_not_completed
run_test "CLI: ambiguous prefix" test_ambiguous_prefix
run_test "Proto: COMPLETE on PROMISED (skip ACCEPT)" test_invalid_complete_on_promised
run_test "Proto: double ACCEPT injection" test_double_accept_injection
run_test "Proto: transition on terminal FULFILLED" test_transition_on_terminal_fulfilled
run_test "Proto: transition on terminal RELEASED" test_transition_on_terminal_released
run_test "Edge: special characters in intent" test_special_characters_in_intent
run_test "Edge: intent with non-matching target" test_intent_with_target_no_match
run_test "Edge: reinit archives DB" test_reinit_archives_db
run_test "Edge: assess fail → BROKEN" test_assess_fail_produces_broken

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "=== FAIL: $FAILURES negative test(s) failed ==="
  exit 1
else
  echo "=== PASS: All negative tests passed ==="
fi
