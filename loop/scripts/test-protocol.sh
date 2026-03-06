#!/bin/bash
# Protocol tests — CLI commands and state machine transitions.
# No LLM calls. Agent-side messages are injected directly.

source "$(dirname "$0")/test-helpers.sh"

echo "=== Protocol Tests (no LLM) ==="

setup_test_db
trap 'cleanup_test_db' EXIT

# ---- 1. init ----
step "init"
INIT_OUT=$($CLI init --json)
echo "$INIT_OUT" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'))" > /dev/null
pass

# ---- 2. add ----
step "add (register current directory)"
TEMP_REPO=$(create_temp_repo)
ADD_OUT=$($CLI add "$TEMP_REPO" --mode external --name test-project --json)
echo "$ADD_OUT" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  if (!d.projectId) { console.error('missing projectId'); process.exit(1); }
"
pass

# ---- 3. projects ----
step "projects (verify registered)"
PROJ_OUT=$($CLI projects --json)
COUNT=$(echo "$PROJ_OUT" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  console.log(d.projects.length);
")
[ "$COUNT" -ge 1 ] || { echo "FAIL: expected >=1 projects, got $COUNT"; exit 1; }
pass

# ---- 4. intent ----
step "intent"
INTENT_OUT=$($CLI intent "add a /health endpoint that returns { status: ok }" --json)
INTENT_ID=$(get_intent_id "$INTENT_OUT")
[ -n "$INTENT_ID" ] || { echo "FAIL: no intentId in output"; exit 1; }
echo "  intentId: ${INTENT_ID:0:8}"
pass

# ---- 5. status — intent exists, no promises ----
step "status (intent exists, no promises)"
STATUS_OUT=$($CLI status --json)
PROMISE_COUNT=$(echo "$STATUS_OUT" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const i = d.intents.find(i => i.intentId === '$INTENT_ID');
  if (!i) { console.error('intent not found'); process.exit(1); }
  console.log((i.promises || []).length);
")
[ "$PROMISE_COUNT" -eq 0 ] || { echo "FAIL: expected 0 promises, got $PROMISE_COUNT"; exit 1; }
pass

# ---- 6. Inject PROMISE ----
step "inject PROMISE (simulate agent)"
PROMISE_ID=$(inject_promise "test-agent" "$INTENT_ID" "Will add /health route")
[ -n "$PROMISE_ID" ] || { echo "FAIL: no promiseId from injection"; exit 1; }
echo "  promiseId: ${PROMISE_ID:0:8}"
pass

# ---- 7. status — PROMISED ----
step "status (expect PROMISED)"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "PROMISED" ] || { echo "FAIL: expected PROMISED, got $STATE"; exit 1; }
pass

# ---- 8. accept ----
step "accept"
$CLI accept "$PROMISE_ID" --json > /dev/null
pass

# ---- 9. status — ACCEPTED ----
step "status (expect ACCEPTED)"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "ACCEPTED" ] || { echo "FAIL: expected ACCEPTED, got $STATE"; exit 1; }
pass

# ---- 10. Inject COMPLETE ----
step "inject COMPLETE (simulate agent)"
inject_complete "test-agent" "$PROMISE_ID" "Added /health endpoint" > /dev/null
pass

# ---- 11. status — COMPLETED ----
step "status (expect COMPLETED)"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "COMPLETED" ] || { echo "FAIL: expected COMPLETED, got $STATE"; exit 1; }
pass

# ---- 12. assess pass ----
step "assess pass"
$CLI assess "$PROMISE_ID" pass --json > /dev/null
pass

# ---- 13. status — FULFILLED ----
step "status (expect FULFILLED)"
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "FULFILLED" ] || { echo "FAIL: expected FULFILLED, got $STATE"; exit 1; }
pass

# ---- 14. RELEASE happy path (separate intent) ----
step "RELEASE happy path"
INTENT2_OUT=$($CLI intent "second intent for release test" --json)
INTENT2_ID=$(get_intent_id "$INTENT2_OUT")
PROMISE2_ID=$(inject_promise "test-agent" "$INTENT2_ID" "Will work on this")
$CLI release "$PROMISE2_ID" --reason "no longer needed" --json > /dev/null
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE2_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "RELEASED" ] || { echo "FAIL: expected RELEASED, got $STATE"; exit 1; }
pass

# ---- 15. RELEASE from ACCEPTED ----
step "RELEASE from ACCEPTED"
INTENT3_OUT=$($CLI intent "third intent for accepted release" --json)
INTENT3_ID=$(get_intent_id "$INTENT3_OUT")
PROMISE3_ID=$(inject_promise "test-agent" "$INTENT3_ID" "Will do it")
$CLI accept "$PROMISE3_ID" --json > /dev/null
$CLI release "$PROMISE3_ID" --reason "changed mind" --json > /dev/null
STATE=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE3_ID');
    if (p) { console.log(p.state); process.exit(0); }
  }
  console.log('NOT_FOUND');
")
[ "$STATE" = "RELEASED" ] || { echo "FAIL: expected RELEASED, got $STATE"; exit 1; }
pass

# ---- 16. remove ----
step "remove project"
$CLI remove test-project --json > /dev/null
PROJ_OUT=$($CLI projects --json)
COUNT=$(echo "$PROJ_OUT" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  console.log(d.projects.length);
")
[ "$COUNT" -eq 0 ] || { echo "FAIL: expected 0 projects after remove, got $COUNT"; exit 1; }
pass

# ---- 17. --json produces valid JSON on all commands ----
step "all commands produce valid JSON"
$CLI init --json | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'))" > /dev/null
$CLI projects --json | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'))" > /dev/null
$CLI status --json | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'))" > /dev/null
$CLI intent "json validity check" --json | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'))" > /dev/null
pass

# Cleanup temp repo
rm -rf "$TEMP_REPO"

echo ""
echo "=== PASS: All protocol tests passed ==="
