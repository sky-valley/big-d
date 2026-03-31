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
DEFAULT_OUTPUT_DIR=""

case "$PRESET" in
  baseline)
    ARGS=(
      --agents codex,claude
      --trials 1
      --observation-ms 8000
    )
    DEFAULT_OUTPUT_DIR="tmp/headwaters-agent-pack-baseline"
    ;;
  profiled)
    ARGS=(
      --agents codex,claude,claude,codex
      --trials 1
      --observation-ms 8000
      --profile-mode builtin
    )
    DEFAULT_OUTPUT_DIR="tmp/headwaters-agent-pack-profiled"
    ;;
  smoke)
    ARGS=(
      --agents scripted-headwaters
      --trials 1
      --observation-ms 0
      --timeout-ms 60000
      --idle-timeout-ms 30000
    )
    DEFAULT_OUTPUT_DIR="tmp/headwaters-agent-pack-smoke"
    ;;
  observatory)
    ARGS=(
      --agents codex,claude
      --trials 1
      --observation-ms 8000
      --with-observatory
    )
    DEFAULT_OUTPUT_DIR="tmp/headwaters-agent-pack-observatory"
    ;;
  *)
    echo "Unknown preset '$PRESET'. Supported: baseline, profiled, smoke, observatory" >&2
    exit 1
    ;;
esac

has_explicit_output_dir=false
for arg in "$@"; do
  if [[ "$arg" == "--output-dir" ]]; then
    has_explicit_output_dir=true
    break
  fi
done

if [[ "$has_explicit_output_dir" == false ]]; then
  next_output_dir="$DEFAULT_OUTPUT_DIR"
  suffix=2
  while [[ -e "$EVALS_DIR/$next_output_dir" ]]; do
    next_output_dir="${DEFAULT_OUTPUT_DIR}-${suffix}"
    suffix=$((suffix + 1))
  done
  ARGS+=(--output-dir "$next_output_dir")
fi

cd "$EVALS_DIR"
exec node --experimental-strip-types scripts/headwaters-agent-pack-eval.ts "${ARGS[@]}" "$@"
