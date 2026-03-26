#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVALS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PRESET="${1:-}"
if [[ -z "$PRESET" ]]; then
  echo "Usage: $0 <preset> [extra-args...]" >&2
  exit 1
fi
shift

ARGS=()

case "$PRESET" in
  baseline)
    ARGS=(
      --agents codex,claude
      --trials 1
      --observation-ms 8000
      --output-dir tmp/headwaters-agent-pack-baseline
    )
    ;;
  profiled)
    ARGS=(
      --agents codex,claude,claude,codex
      --trials 1
      --observation-ms 8000
      --profile-mode builtin
      --output-dir tmp/headwaters-agent-pack-profiled
    )
    ;;
  smoke)
    ARGS=(
      --agents scripted-headwaters
      --trials 1
      --observation-ms 0
      --timeout-ms 60000
      --idle-timeout-ms 30000
      --output-dir tmp/headwaters-agent-pack-smoke
    )
    ;;
  observatory)
    ARGS=(
      --agents codex,claude
      --trials 1
      --observation-ms 8000
      --with-observatory
      --output-dir tmp/headwaters-agent-pack-observatory
    )
    ;;
  *)
    echo "Unknown preset '$PRESET'. Supported: baseline, profiled, smoke, observatory" >&2
    exit 1
    ;;
esac

cd "$EVALS_DIR"
exec node --experimental-strip-types scripts/headwaters-agent-pack-eval.ts "${ARGS[@]}" "$@"
