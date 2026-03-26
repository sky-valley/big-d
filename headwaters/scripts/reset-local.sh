#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HEADWATERS_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

HOST="${HEADWATERS_HOST:-127.0.0.1}"
HTTP_PORT="${HEADWATERS_PORT:-8090}"
COMMONS_PORT="${HEADWATERS_COMMONS_PORT:-4010}"
DATA_DIR="${HEADWATERS_DATA_DIR:-$HEADWATERS_DIR/.headwaters}"
AGENT_WORKSPACE="${HEADWATERS_AGENT_WORKSPACE:-$HEADWATERS_DIR/tmp/headwaters-agent}"

kill_listeners() {
  local port
  for port in "$HTTP_PORT" "$COMMONS_PORT"; do
    if command -v lsof >/dev/null 2>&1; then
      local pids
      pids="$(lsof -ti "tcp:$port" || true)"
      if [[ -n "$pids" ]]; then
        echo "stopping processes on tcp:$port"
        kill $pids >/dev/null 2>&1 || true
      fi
    fi
  done
}

kill_headwaters_processes() {
  local patterns=(
    "headwaters/src/main.ts"
    "headwaters/src/steward-main.ts"
  )
  local pattern
  for pattern in "${patterns[@]}"; do
    if command -v pgrep >/dev/null 2>&1; then
      local pids
      pids="$(pgrep -f "$pattern" || true)"
      if [[ -n "$pids" ]]; then
        echo "stopping $pattern"
        kill $pids >/dev/null 2>&1 || true
      fi
    fi
  done
}

echo "resetting local Headwaters state"
echo "  host=$HOST"
echo "  http_port=$HTTP_PORT"
echo "  commons_port=$COMMONS_PORT"
echo "  data_dir=$DATA_DIR"
echo "  agent_workspace=$AGENT_WORKSPACE"

kill_listeners
kill_headwaters_processes
sleep 1

rm -rf "$DATA_DIR"
rm -rf "$AGENT_WORKSPACE"

mkdir -p "$(dirname "$DATA_DIR")"
mkdir -p "$(dirname "$AGENT_WORKSPACE")"

cd "$HEADWATERS_DIR"
exec npm run server
