#!/usr/bin/env bash
set -euo pipefail

# Headless onboarding regression test for Spacebase1
# Tests both onboarding paths with both Claude Code and Codex
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
    # Claude Code headless: -p flag, allow Bash and Read tools
    timeout 180 $CLAUDE -p "$prompt" \
      --allowedTools "Bash(read_only:true),Read,Glob,Grep,WebFetch" \
      --output-format json \
      > "$outfile" 2>&1 || true
  elif [ "$agent" = "codex" ]; then
    # Codex headless: exec subcommand
    timeout 180 $CODEX exec "$prompt" \
      --json \
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
CLAIM_PROMPT=$(echo "$SPACE_HTML" | sed -n 's/.*<pre>\(.*\)<\/pre>.*/\1/p' | head -1)

# Decode HTML entities
CLAIM_PROMPT=$(echo "$CLAIM_PROMPT" | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&#39;/'"'"'/g')

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

PATH2_PROMPT="Read ${ORIGIN}/agent-setup and set up a space in Spacebase1."

# ── Run all four tests ──────────────────────────────────────────────────────

echo "── Running headless agent tests ──"
echo ""

# Path 1: Claude Code with claim prompt
run_test "claude" "path1" "$CLAIM_PROMPT"

# Path 2: Claude Code with agent-setup
run_test "claude" "path2" "$PATH2_PROMPT"

# Path 1: Codex with claim prompt
run_test "codex" "path1" "$CLAIM_PROMPT"

# Path 2: Codex with agent-setup
run_test "codex" "path2" "$PATH2_PROMPT"

echo ""
echo "=== Results ==="
echo ""

# ── Evaluate results ────────────────────────────────────────────────────────

pass=0
fail=0

for label in claude-path1 claude-path2 codex-path1 codex-path2; do
  outfile="$RESULTS_DIR/${label}.txt"
  if [ ! -s "$outfile" ]; then
    echo "FAIL [$label]: empty output"
    fail=$((fail + 1))
    continue
  fi

  # Check for refusal patterns
  if grep -qi "I cannot\|I can't\|I'm not able\|injection\|suspicious\|I won't\|refuse\|harmful" "$outfile"; then
    echo "FAIL [$label]: agent refused (possible injection detection)"
    echo "  Refusal snippet: $(grep -oi "I cannot.*\|I can't.*\|injection.*\|suspicious.*" "$outfile" | head -1 | cut -c1-120)"
    fail=$((fail + 1))
  elif grep -qi "curl.*SKILL\.md\|mkdir.*spacebase1-onboard\|skill.*install" "$outfile"; then
    echo "PASS [$label]: agent recognized the skill install path"
    pass=$((pass + 1))
  elif grep -qi "error\|Error\|ERROR" "$outfile"; then
    echo "WARN [$label]: completed but with errors"
    echo "  Error snippet: $(grep -oi "error.*" "$outfile" | head -1 | cut -c1-120)"
    fail=$((fail + 1))
  else
    echo "INFO [$label]: completed, manual review needed"
    echo "  First 200 chars: $(head -c 200 "$outfile")"
    pass=$((pass + 1))
  fi
done

echo ""
echo "Results: $pass passed, $fail failed"
echo "Full output in: $RESULTS_DIR"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
