#!/usr/bin/env bash
set -euo pipefail

# Headless onboarding regression test for Spacebase1
# Tests both onboarding paths with both Claude Code and Codex
#
# Success requires the agent to actually provision/claim and bind a space.
# The harness checks for concrete completion artifacts: a bound space id
# with matching declaredSpaceId and currentSpaceId.
#
# Usage: ./scripts/test-onboarding-headless.sh [origin]
# Default origin: http://localhost:8787

ORIGIN="${1:-http://localhost:8787}"
CLAUDE="npx @anthropic-ai/claude-code"
CODEX="/opt/homebrew/bin/codex"
RESULTS_DIR="$(mktemp -d)/spacebase1-onboarding-results"
mkdir -p "$RESULTS_DIR"

echo "=== Spacebase1 Headless Onboarding Test ==="
echo "Origin: $ORIGIN"
echo "Results: $RESULTS_DIR"
echo ""

# ── Helper ──────────────────────────────────────────────────────────────────

run_test() {
  local agent="$1"    # "claude" or "codex"
  local path="$2"     # "path1" or "path2"
  local prompt="$3"
  local label="${agent}-${path}"
  local outfile="$RESULTS_DIR/${label}.txt"

  echo "[$label] Starting..."

  if [ "$agent" = "claude" ]; then
    # Claude Code headless: -p flag, full tool access for real onboarding
    timeout 300 $CLAUDE -p "$prompt" \
      --allowedTools "Bash,Read,Write,Glob,Grep,WebFetch" \
      > "$outfile" 2>&1 || true
  elif [ "$agent" = "codex" ]; then
    # Codex headless: exec with full-auto for real onboarding
    timeout 300 $CODEX exec --full-auto \
      -o "$RESULTS_DIR/${label}-last-message.txt" \
      "$prompt" \
      > "$outfile" 2>&1 || true
  fi

  echo "[$label] Done → $outfile"
}

# ── Path 1: Human-led (create space, extract prompt, hand to agent) ─────────

echo "── Path 1: Human-led onboarding ──"
echo "Creating a prepared space..."

# Simulate the human pressing "Create Space" on the homepage
CREATE_RESPONSE=$(curl -s -D - -X POST "$ORIGIN/create-space" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "intendedAgentLabel=test-agent" \
  --max-redirs 0 2>&1)

# Follow the redirect to get the space page
REDIRECT_URL=$(echo "$CREATE_RESPONSE" | grep -i "^location:" | tr -d '\r' | awk '{print $2}')

if [ -z "$REDIRECT_URL" ]; then
  echo "ERROR: No redirect from /create-space"
  echo "$CREATE_RESPONSE"
  exit 1
fi

echo "Space created, fetching prompt from: $REDIRECT_URL"

# Get the page HTML and extract the claim prompt from the <pre> tag
SPACE_HTML=$(curl -sL "$REDIRECT_URL")
CLAIM_PROMPT=$(python3 -c "
import re, html, sys
m = re.search(r'<pre>(.*?)</pre>', sys.stdin.read(), re.DOTALL)
print(html.unescape(m.group(1)) if m else '')
" <<< "$SPACE_HTML")

if [ -z "$CLAIM_PROMPT" ]; then
  echo "ERROR: Could not extract claim prompt from space page"
  exit 1
fi

echo "Extracted claim prompt (first 200 chars):"
echo "${CLAIM_PROMPT:0:200}..."
echo ""

# Save raw prompt for inspection
echo "$CLAIM_PROMPT" > "$RESULTS_DIR/path1-claim-prompt.txt"

# ── Path 2 prompt ──────────────────────────────────────────────────────────

PATH2_PROMPT="Read ${ORIGIN}/agent-setup and set up a space in Spacebase1. The server is at ${ORIGIN}."

# ── Run all four tests ──────────────────────────────────────────────────────

echo "── Running headless agent tests ──"
echo ""

# Path 1: Claude Code with claim prompt
run_test "claude" "path1" "$(cat <<PROMPT
The following is a claim prompt from a human who prepared a Spacebase1 space for me.
Follow the instructions to claim and bind it. The server is at ${ORIGIN}.

${CLAIM_PROMPT}
PROMPT
)"

# Path 2: Claude Code with agent-setup
run_test "claude" "path2" "$PATH2_PROMPT"

# Path 1: Codex with claim prompt
run_test "codex" "path1" "$(cat <<PROMPT
The following is a claim prompt from a human who prepared a Spacebase1 space for me.
Follow the instructions to claim and bind it. The server is at ${ORIGIN}.

${CLAIM_PROMPT}
PROMPT
)"

# Path 2: Codex with agent-setup
run_test "codex" "path2" "$PATH2_PROMPT"

echo ""
echo "=== Results ==="
echo ""

# ── Evaluate results ────────────────────────────────────────────────────────
#
# A test passes only if the agent output contains evidence of a bound space:
# - A space id (space-{uuid} pattern)
# - Matching declaredSpaceId and currentSpaceId
# - Or explicit "claimed"/"bound" confirmation with a space id
#
# Pattern-matching for skill install strings is NOT sufficient.

pass=0
fail=0

for label in claude-path1 claude-path2 codex-path1 codex-path2; do
  outfile="$RESULTS_DIR/${label}.txt"
  lastmsg="$RESULTS_DIR/${label}-last-message.txt"

  # Merge output sources (codex writes last message separately)
  combined="$RESULTS_DIR/${label}-combined.txt"
  cat "$outfile" > "$combined" 2>/dev/null || true
  cat "$lastmsg" >> "$combined" 2>/dev/null || true

  if [ ! -s "$combined" ]; then
    echo "FAIL [$label]: empty output"
    fail=$((fail + 1))
    continue
  fi

  # Check for refusal patterns
  if grep -qi "I cannot\|I can't\|I'm not able\|injection\|suspicious\|I won't\|refuse\|harmful" "$combined"; then
    echo "FAIL [$label]: agent refused (possible injection detection)"
    echo "  Refusal snippet: $(grep -oi "I cannot.*\|I can't.*\|injection.*\|suspicious.*" "$combined" | head -1 | cut -c1-120)"
    fail=$((fail + 1))
    continue
  fi

  # Check for concrete completion: bound space with matching IDs
  has_space_id=$(grep -oE 'space-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$combined" | head -1)
  has_declared_match=$(grep -ci 'declaredSpaceId.*match\|declaredSpaceId.*=.*currentSpaceId\|both match\|binding confirmed\|bound.*successfully\|claimed.*bound\|status.*claimed' "$combined" || true)

  if [ -n "$has_space_id" ] && [ "$has_declared_match" -gt 0 ]; then
    echo "PASS [$label]: bound space $has_space_id with verified binding"
    pass=$((pass + 1))
  elif [ -n "$has_space_id" ]; then
    echo "WARN [$label]: space $has_space_id appeared but binding not confirmed"
    echo "  Review: $combined"
    fail=$((fail + 1))
  else
    echo "FAIL [$label]: no bound space found in output"
    echo "  First 300 chars: $(head -c 300 "$combined")"
    fail=$((fail + 1))
  fi
done

echo ""
echo "Results: $pass passed, $fail failed"
echo "Full output in: $RESULTS_DIR"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
