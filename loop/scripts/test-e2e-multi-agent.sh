#!/bin/bash
# E2E test: Multi-agent with two external repos.
# Requires ANTHROPIC_API_KEY. Uses real LLM calls.

source "$(dirname "$0")/test-helpers.sh"

echo "=== E2E: Multi-Agent Self-Selection ==="

setup_test_db
REPO_A=$(create_temp_repo)
REPO_B=$(create_temp_repo)
echo "Repo A: $REPO_A"
echo "Repo B: $REPO_B"
trap 'cleanup_supervisor; cleanup_test_db; rm -rf "$REPO_A" "$REPO_B"' EXIT

# ---- 1. init + register both repos ----
step "init + add two repos"
$CLI init --json > /dev/null
$CLI add "$REPO_A" --mode external --name repo-a --json > /dev/null
$CLI add "$REPO_B" --mode external --name repo-b --json > /dev/null
pass

# ---- 2. Verify both registered ----
step "verify projects"
COUNT=$($CLI projects --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  console.log(d.projects.length);
")
[ "$COUNT" -eq 2 ] || { echo "FAIL: expected 2 projects, got $COUNT"; exit 1; }
pass

# ---- 3. Start supervisor ----
step "start supervisor"
$CLI run &
SUP_PID=$!
sleep 8  # Give time for two agents to spawn
pass

# ---- 4. Post intent targeting repo-a ----
step "post intent targeting repo-a"
INTENT_OUT=$($CLI intent "create a file called test.txt with the content 'from repo-a'" --target "$REPO_A" --json)
INTENT_ID=$(get_intent_id "$INTENT_OUT")
echo "  intentId: ${INTENT_ID:0:8}"
pass

# ---- 5. Wait for a promise ----
step "wait for PROMISED"
PROMISE_ID=$(wait_for_promise "${INTENT_ID:0:8}" 60)
echo "  promiseId: ${PROMISE_ID:0:8}"
pass

# ---- 6. Verify the promiser is repo-a's agent (not repo-b's) ----
step "verify correct agent promised"
AGENT_ID=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const i of d.intents) {
    const p = i.promises.find(p => p.promiseId === '$PROMISE_ID');
    if (p) { console.log(p.agentId); process.exit(0); }
  }
  console.log('');
")
REPO_A_AGENT=$($CLI projects --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = d.projects.find(p => p.repoPath === '$REPO_A');
  console.log(p ? p.agentId : '');
")
echo "  Promise by: ${AGENT_ID:0:8}, Repo-A agent: ${REPO_A_AGENT:0:8}"
[ "$AGENT_ID" = "$REPO_A_AGENT" ] || { echo "FAIL: wrong agent promised"; exit 1; }
pass

# ---- 7. Accept → COMPLETED → assess pass ----
step "accept"
$CLI accept "$PROMISE_ID" --json > /dev/null
pass

step "wait for COMPLETED"
wait_for_state "${PROMISE_ID:0:8}" "COMPLETED" 180
pass

step "assess pass"
$CLI assess "$PROMISE_ID" pass --json > /dev/null
# Give agent time to process ASSESS and commit
wait_for_commit "$REPO_A" 2 30
pass

# ---- 8. Verify file in repo-a, NOT in repo-b ----
step "verify test.txt in repo-a only"
[ -f "$REPO_A/test.txt" ] || { echo "FAIL: test.txt not found in repo-a"; exit 1; }
if [ -f "$REPO_B/test.txt" ]; then
  echo "FAIL: test.txt unexpectedly found in repo-b"
  exit 1
fi
pass

# ---- 9. Verify no promise from repo-b's agent ----
step "verify repo-b agent did not promise"
REPO_B_PROMISES=$($CLI status --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  let count = 0;
  const repoB = d.intents.find(i => i.intentId === '$INTENT_ID');
  if (repoB) {
    count = (repoB.promises || []).filter(p => p.agentId !== '$REPO_A_AGENT').length;
  }
  console.log(count);
")
[ "$REPO_B_PROMISES" -eq 0 ] || { echo "FAIL: repo-b agent made $REPO_B_PROMISES promise(s)"; exit 1; }
pass

echo ""
echo "=== PASS: Multi-agent self-selection verified ==="
