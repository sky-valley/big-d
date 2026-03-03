#!/bin/bash
set -euo pipefail

# E2E test for the self-modifying agent loop.
# Tests the CLI commands and promise protocol flow.
# Does NOT start the agent (requires ANTHROPIC_API_KEY and real LLM calls).

# Use npx tsx directly to avoid npm run prefix in stdout
CLI="npx tsx src/loop/cli.ts"

echo "=== Loop E2E Test ==="

# 1. Initialize
echo "Step 1: init"
$CLI init --json
echo "  OK"

# 2. Post an intent
echo "Step 2: intent"
INTENT_OUTPUT=$($CLI intent "add a /health endpoint that returns { status: ok }" --json)
PROMISE_ID=$(echo "$INTENT_OUTPUT" | grep -o '"promiseId":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Intent posted: $PROMISE_ID"
[ -n "$PROMISE_ID" ] || { echo "FAIL: no promiseId in output"; exit 1; }

# 3. Check status — should show PENDING
echo "Step 3: status (expect PENDING)"
STATUS_OUTPUT=$($CLI status --json)
STATE=$(echo "$STATUS_OUTPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = data.promises.find(p => p.promiseId === '$PROMISE_ID');
  console.log(p ? p.state : 'NOT_FOUND');
")
echo "  State: $STATE"
[ "$STATE" = "PENDING" ] || { echo "FAIL: expected PENDING, got $STATE"; exit 1; }

# 4. Simulate agent PROMISE (manual post via PromiseLog)
echo "Step 4: simulate PROMISE"
node --import tsx -e "
  import { PromiseLog } from './src/loop/promise-log.ts';
  import { createPromise } from './src/itp/protocol.ts';
  const log = new PromiseLog();
  const msg = createPromise('agent', '$PROMISE_ID', 'Will add /health route');
  log.post(msg);
  log.close();
  console.log('  Agent promised');
"

# 5. Check status — should show PROMISED
echo "Step 5: status (expect PROMISED)"
STATUS_OUTPUT=$($CLI status --json)
STATE=$(echo "$STATUS_OUTPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = data.promises.find(p => p.promiseId === '$PROMISE_ID');
  console.log(p ? p.state : 'NOT_FOUND');
")
echo "  State: $STATE"
[ "$STATE" = "PROMISED" ] || { echo "FAIL: expected PROMISED, got $STATE"; exit 1; }

# 6. ACCEPT the promise
echo "Step 6: accept"
$CLI accept "$PROMISE_ID" --json
echo "  OK"

# 7. Check status — should show ACCEPTED
echo "Step 7: status (expect ACCEPTED)"
STATUS_OUTPUT=$($CLI status --json)
STATE=$(echo "$STATUS_OUTPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = data.promises.find(p => p.promiseId === '$PROMISE_ID');
  console.log(p ? p.state : 'NOT_FOUND');
")
echo "  State: $STATE"
[ "$STATE" = "ACCEPTED" ] || { echo "FAIL: expected ACCEPTED, got $STATE"; exit 1; }

# 8. Simulate COMPLETE
echo "Step 8: simulate COMPLETE"
node --import tsx -e "
  import { PromiseLog } from './src/loop/promise-log.ts';
  import { createComplete } from './src/itp/protocol.ts';
  const log = new PromiseLog();
  const msg = createComplete('agent', '$PROMISE_ID', 'Added /health endpoint', ['src/health.ts']);
  log.post(msg);
  log.close();
  console.log('  Agent completed');
"

# 9. Check status — should show COMPLETED
echo "Step 9: status (expect COMPLETED)"
STATUS_OUTPUT=$($CLI status --json)
STATE=$(echo "$STATUS_OUTPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = data.promises.find(p => p.promiseId === '$PROMISE_ID');
  console.log(p ? p.state : 'NOT_FOUND');
")
echo "  State: $STATE"
[ "$STATE" = "COMPLETED" ] || { echo "FAIL: expected COMPLETED, got $STATE"; exit 1; }

# 10. ASSESS pass
echo "Step 10: assess pass"
$CLI assess "$PROMISE_ID" pass --json
echo "  OK"

# 11. Check status — should show FULFILLED
echo "Step 11: status (expect FULFILLED)"
STATUS_OUTPUT=$($CLI status --json)
STATE=$(echo "$STATUS_OUTPUT" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  const p = data.promises.find(p => p.promiseId === '$PROMISE_ID');
  console.log(p ? p.state : 'NOT_FOUND');
")
echo "  State: $STATE"
[ "$STATE" = "FULFILLED" ] || { echo "FAIL: expected FULFILLED, got $STATE"; exit 1; }

echo ""
echo "=== PASS: All protocol transitions verified ==="
