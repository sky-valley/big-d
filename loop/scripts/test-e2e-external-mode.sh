#!/bin/bash
# E2E test: External-mode agent lifecycle.
# Requires ANTHROPIC_API_KEY. Uses real LLM calls.

source "$(dirname "$0")/test-helpers.sh"

echo "=== E2E: External-Mode Lifecycle ==="

setup_test_db
TEMP_REPO=$(create_temp_repo)
echo "Temp repo: $TEMP_REPO"
trap 'cleanup_supervisor; cleanup_test_db; rm -rf "$TEMP_REPO"' EXIT

# ---- 1. init + register temp repo as external-mode ----
step "init + add external-mode"
$CLI init --json > /dev/null
$CLI add "$TEMP_REPO" --mode external --name test-external --json > /dev/null
pass

# ---- 2. Start supervisor ----
step "start supervisor"
$CLI run &
SUP_PID=$!
sleep 5
pass

# ---- 3. Post intent targeting the temp repo ----
step "post intent"
INTENT_OUT=$($CLI intent "create a file called hello.txt with the content 'hello world'" --target "$TEMP_REPO" --json)
INTENT_ID=$(get_intent_id "$INTENT_OUT")
echo "  intentId: ${INTENT_ID:0:8}"
pass

# ---- 4. Wait for agent to promise ----
step "wait for PROMISED"
PROMISE_ID=$(wait_for_promise "${INTENT_ID:0:8}" 60)
echo "  promiseId: ${PROMISE_ID:0:8}"
pass

# ---- 5. Accept ----
step "accept"
$CLI accept "$PROMISE_ID" --json > /dev/null
pass

# ---- 6. Wait for COMPLETED ----
step "wait for COMPLETED"
wait_for_state "${PROMISE_ID:0:8}" "COMPLETED" 180
pass

# ---- 7. Assess pass ----
step "assess pass"
$CLI assess "$PROMISE_ID" pass --json > /dev/null
pass

# ---- 8. Verify file exists in temp repo ----
step "verify hello.txt in temp repo"
if [ -f "$TEMP_REPO/hello.txt" ]; then
  CONTENT=$(cat "$TEMP_REPO/hello.txt")
  echo "  Content: $CONTENT"
  if echo "$CONTENT" | grep -qi "hello"; then
    pass
  else
    echo "FAIL: hello.txt doesn't contain 'hello'"
    exit 1
  fi
else
  echo "FAIL: hello.txt does not exist in $TEMP_REPO"
  exit 1
fi

# ---- 9. Verify agent committed to the temp repo ----
step "verify git commit in temp repo"
# Agent needs time to process the ASSESS and commit after we post it
wait_for_commit "$TEMP_REPO" 2 30
COMMITS=$(git -C "$TEMP_REPO" log --oneline | wc -l | tr -d ' ')
echo "  Commits: $COMMITS"
pass

echo ""
echo "=== PASS: External-mode E2E lifecycle completed ==="
