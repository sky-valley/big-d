#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Test isolation
export DIFFER_DB_DIR=$(mktemp -d)
SOCKET="${DIFFER_DB_DIR}/intent-space.sock"
PASS=0
FAIL=0
STEP=0

cleanup() {
  # Kill server if running
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$DIFFER_DB_DIR"
}
trap cleanup EXIT

step() { STEP=$((STEP + 1)); echo ""; echo "=== Test $STEP: $1 ==="; }
pass() { PASS=$((PASS + 1)); echo "  OK"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

send() {
  echo "$1" | socat - UNIX-CONNECT:"$SOCKET"
}

send_recv() {
  echo "$1" | socat -t1 - UNIX-CONNECT:"$SOCKET"
}

# ============ Start server ============

step "Server starts"
npx tsx src/main.ts &
SERVER_PID=$!
sleep 1

if kill -0 "$SERVER_PID" 2>/dev/null; then
  pass
else
  fail "Server didn't start"
  exit 1
fi

# ============ Test: connect receives service intents ============

step "Connect receives service intents"
RESULT=$(echo "" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"type":"INTENT"' && echo "$RESULT" | grep -q 'intent-space:persist'; then
  pass
else
  fail "Expected service intents on connect"
  echo "  Got: $RESULT"
fi

# ============ Test: post an intent and get echo ============

step "Post intent gets echo with seq"
INTENT='{"type":"INTENT","intentId":"test-1","senderId":"agent-1","timestamp":1000,"payload":{"content":"build auth"}}'
RESULT=$(echo "$INTENT" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"intentId":"test-1"' && echo "$RESULT" | grep -q '"seq"'; then
  pass
else
  fail "Expected echoed intent with seq"
  echo "  Got: $RESULT"
fi

# ============ Test: post with parentId ============

step "Post intent with parentId"
CHILD='{"type":"INTENT","intentId":"test-2","parentId":"test-1","senderId":"agent-2","timestamp":2000,"payload":{"content":"need OAuth2"}}'
RESULT=$(echo "$CHILD" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"intentId":"test-2"' && echo "$RESULT" | grep -q '"parentId":"test-1"'; then
  pass
else
  fail "Expected child intent echo"
  echo "  Got: $RESULT"
fi

# ============ Test: scan root space ============

step "Scan root space"
SCAN='{"type":"SCAN","spaceId":"root","since":0}'
RESULT=$(echo "$SCAN" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
# Should contain test-1 (parentId=root) but NOT test-2 (parentId=test-1)
if echo "$RESULT" | grep -q '"type":"SCAN_RESULT"' && echo "$RESULT" | grep -q '"test-1"' && ! echo "$RESULT" | grep -q '"intentId":"test-2"'; then
  pass
else
  fail "Root scan should contain test-1 but not test-2"
  echo "  Got: $RESULT"
fi

# ============ Test: scan sub-space ============

step "Scan sub-space (containment)"
SCAN_SUB='{"type":"SCAN","spaceId":"test-1","since":0}'
RESULT=$(echo "$SCAN_SUB" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"type":"SCAN_RESULT"' && echo "$RESULT" | grep -q '"test-2"'; then
  pass
else
  fail "Sub-space scan should contain test-2"
  echo "  Got: $RESULT"
fi

# ============ Test: scan with cursor ============

step "Scan with since cursor"
# Get the seq of test-1 first — scan root with since=0, then scan again with that seq
SCAN_CURSOR='{"type":"SCAN","spaceId":"root","since":100}'
RESULT=$(echo "$SCAN_CURSOR" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"messages":\[\]'; then
  pass
else
  fail "Scan past latest seq should return empty"
  echo "  Got: $RESULT"
fi

# ============ Test: idempotent post ============

step "Idempotent post (duplicate intentId)"
DUPE='{"type":"INTENT","intentId":"test-1","senderId":"agent-1","timestamp":1000,"payload":{"content":"build auth"}}'
RESULT=$(echo "$DUPE" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
# Should succeed (not error) and return the original seq
if echo "$RESULT" | grep -q '"intentId":"test-1"' && echo "$RESULT" | grep -q '"seq"'; then
  pass
else
  fail "Duplicate post should succeed idempotently"
  echo "  Got: $RESULT"
fi

# ============ Test: projected PROMISE ============

step "Projected PROMISE is accepted"
PROMISE='{"type":"PROMISE","promiseId":"p-1","intentId":"test-1","parentId":"test-1","senderId":"agent-1","timestamp":3000,"payload":{"content":"I will build auth"}}'
RESULT=$(echo "$PROMISE" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"type":"PROMISE"' && echo "$RESULT" | grep -q '"promiseId":"p-1"' && echo "$RESULT" | grep -q '"seq"'; then
  pass
else
  fail "Projected PROMISE should be accepted"
  echo "  Got: $RESULT"
fi

# ============ Test: reject INTENT without intentId ============

step "Reject INTENT without intentId"
BAD='{"type":"INTENT","senderId":"agent-1","timestamp":3000,"payload":{"content":"oops"}}'
RESULT=$(echo "$BAD" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"type":"ERROR"'; then
  pass
else
  fail "Should reject INTENT without intentId"
  echo "  Got: $RESULT"
fi

# ============ Test: invalid JSON ============

step "Invalid JSON"
RESULT=$(echo "not json at all" | socat -t1 - UNIX-CONNECT:"$SOCKET" 2>/dev/null || true)
if echo "$RESULT" | grep -q '"type":"ERROR"' && echo "$RESULT" | grep -q 'Invalid JSON'; then
  pass
else
  fail "Should return ERROR for invalid JSON"
  echo "  Got: $RESULT"
fi

# ============ Summary ============

echo ""
echo "================================"
echo "  $PASS passed, $FAIL failed (of $STEP)"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
