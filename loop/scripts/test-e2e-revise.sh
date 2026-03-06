#!/bin/bash
# E2E test: BROKEN → REVISE cycle.
# Requires ANTHROPIC_API_KEY. Uses real LLM calls.

source "$(dirname "$0")/test-helpers.sh"

echo "=== E2E: Revise Cycle (assess fail → BROKEN → REVISE) ==="

setup_test_db
TEMP_REPO=$(create_temp_repo)
echo "Temp repo: $TEMP_REPO"
trap 'cleanup_supervisor; cleanup_test_db; rm -rf "$TEMP_REPO"' EXIT

# ---- 1. init + register ----
step "init + add external-mode"
$CLI init --json > /dev/null
$CLI add "$TEMP_REPO" --mode external --name test-revise --json > /dev/null
pass

# ---- 2. Start supervisor ----
step "start supervisor"
$CLI run &
SUP_PID=$!
sleep 5
pass

# ---- 3. Post intent ----
step "post intent"
INTENT_OUT=$($CLI intent "create a file called greet.txt that contains exactly the text 'hello universe'" --target "$TEMP_REPO" --json)
INTENT_ID=$(get_intent_id "$INTENT_OUT")
echo "  intentId: ${INTENT_ID:0:8}"
pass

# ---- 4. Wait for first PROMISED ----
step "wait for first PROMISED"
PROMISE_ID=$(wait_for_promise "${INTENT_ID:0:8}" 60)
echo "  promiseId: ${PROMISE_ID:0:8}"
pass

# ---- 5. Accept first promise ----
step "accept first promise"
$CLI accept "$PROMISE_ID" --json > /dev/null
pass

# ---- 6. Wait for COMPLETED ----
step "wait for COMPLETED"
wait_for_state "${PROMISE_ID:0:8}" "COMPLETED" 180
pass

# ---- 7. Assess FAIL ----
step "assess fail (trigger BROKEN → REVISE)"
$CLI assess "$PROMISE_ID" fail "the file should contain 'hello universe' - please fix it" --json > /dev/null
pass

# ---- 8. Verify BROKEN or REVISED state ----
# Agent may process BROKEN and post REVISE before we check, so accept either
step "verify BROKEN or REVISED"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "BROKEN" ] || [ "$STATE" = "REVISED" ] || { echo "FAIL: expected BROKEN or REVISED, got $STATE"; exit 1; }
echo "  state: $STATE"
pass

# ---- 9. Wait for revised promise (new PROMISE from agent) ----
step "wait for revised PROMISED"
# The agent should post a REVISE which creates a new promise
sleep 10  # Give agent time to see BROKEN and post REVISE
REVISED_PID=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    if (i.intentId === '$INTENT_ID') {
      const revised = (i.promises || []).find(p =>
        p.promiseId !== '$PROMISE_ID' && p.state === 'PROMISED'
      );
      if (revised) { console.log(revised.promiseId); process.exit(0); }
    }
  }
  console.log('');
")

# If not found yet, poll
if [ -z "$REVISED_PID" ]; then
  for _ in $(seq 1 20); do
    sleep 5
    REVISED_PID=$($CLI status --json | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
      for (const i of d.intents) {
        if (i.intentId === '$INTENT_ID') {
          const revised = (i.promises || []).find(p =>
            p.promiseId !== '$PROMISE_ID' && p.state === 'PROMISED'
          );
          if (revised) { console.log(revised.promiseId); process.exit(0); }
        }
      }
      console.log('');
    ")
    [ -n "$REVISED_PID" ] && break
  done
fi

[ -n "$REVISED_PID" ] || { echo "FAIL: no revised promise found"; exit 1; }
echo "  revised promiseId: ${REVISED_PID:0:8}"
pass

# ---- 10. Accept revised promise ----
step "accept revised promise"
$CLI accept "$REVISED_PID" --json > /dev/null
pass

# ---- 11. Wait for revised COMPLETED ----
step "wait for revised COMPLETED"
wait_for_state "${REVISED_PID:0:8}" "COMPLETED" 180
pass

# ---- 12. Assess pass on revised promise ----
step "assess pass on revised"
$CLI assess "$REVISED_PID" pass --json > /dev/null
pass

# ---- 13. Verify FULFILLED ----
step "verify FULFILLED"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$REVISED_PID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "FULFILLED" ] || { echo "FAIL: expected FULFILLED, got $STATE"; exit 1; }
pass

# ---- 14. Verify greet.txt exists ----
# Give agent time to commit after ASSESS
wait_for_commit "$TEMP_REPO" 2 30 || true  # Don't fail if commit takes long
step "verify greet.txt"
if [ -f "$TEMP_REPO/greet.txt" ]; then
  CONTENT=$(cat "$TEMP_REPO/greet.txt")
  echo "  Content: $CONTENT"
  pass
else
  echo "FAIL: greet.txt does not exist"
  exit 1
fi

echo ""
echo "=== PASS: Revise cycle completed ==="
