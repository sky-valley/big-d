#!/bin/bash
# Test runner — protocol tests always, e2e tests only with ANTHROPIC_API_KEY.
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env if present (for ANTHROPIC_API_KEY)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "=== Protocol Tests (no LLM) ==="
echo ""
bash scripts/test-protocol.sh
echo ""
bash scripts/test-negative.sh

echo ""
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "=== E2E Tests SKIPPED (ANTHROPIC_API_KEY not set) ==="
  echo ""
  echo "=== ALL PROTOCOL TESTS PASS ==="
  exit 0
fi

echo "=== E2E Tests (real LLM calls) ==="
echo ""
bash scripts/test-e2e-self-mode.sh
echo ""
bash scripts/test-e2e-external-mode.sh
echo ""
bash scripts/test-e2e-multi-agent.sh
echo ""
bash scripts/test-e2e-revise.sh

echo ""
echo "=== ALL TESTS PASS ==="
