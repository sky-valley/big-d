#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEADWATERS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

HOST="${1:-127.0.0.1}"
STATION_PORT="${2:-4010}"
HEADWATERS_URL="${3:-http://$HOST:8090}"
WORKSPACE="${4:-/tmp/headwaters-smoke}"
RUN_HAPPY="${RUN_HAPPY:-true}"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_bin curl
require_bin python3

echo "headwaters: $HEADWATERS_URL"
curl -fsS "$HEADWATERS_URL/.well-known/welcome.md" >/dev/null
curl -fsS "$HEADWATERS_URL/tos" >/dev/null
curl -fsS "$HEADWATERS_URL/agent-setup.md" >/dev/null
curl -fsS "$HEADWATERS_URL/skill-pack/sdk/promise_runtime.py" >/dev/null
curl -fsS "$HEADWATERS_URL/skill-pack/sdk/intent_space_sdk.py" >/dev/null
echo "http onboarding ok"

echo "station: tcp://$HOST:$STATION_PORT"
python3 - "$HOST" "$STATION_PORT" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

with socket.create_connection((host, port), timeout=5):
    pass

print("tcp connect ok")
PY

if [[ "$RUN_HAPPY" != "true" ]]; then
  echo "smoke test passed"
  exit 0
fi

rm -rf "$WORKSPACE"
mkdir -p "$WORKSPACE"

echo "running end-to-end happy path"
(
  cd "$HEADWATERS_DIR"
  python3 scripts/headwaters-agent.py \
    --headwaters-url "$HEADWATERS_URL" \
    --host "$HOST" \
    --port "$STATION_PORT" \
    --workspace "$WORKSPACE"
)

python3 - "$WORKSPACE" <<'PY'
import json
import sys
from pathlib import Path

workspace = Path(sys.argv[1])
finish = workspace / ".intent-space" / "state" / "session-finish.json"
home_intent = workspace / ".intent-space" / "state" / "headwaters-home-intent.json"
home_scan = workspace / ".intent-space" / "state" / "headwaters-home-scan.json"

if not finish.exists():
    raise SystemExit(f"missing session artifact: {finish}")
if not home_intent.exists():
    raise SystemExit(f"missing home intent artifact: {home_intent}")
if not home_scan.exists():
    raise SystemExit(f"missing home scan artifact: {home_scan}")

finish_payload = json.loads(finish.read_text())
scan_payload = json.loads(home_scan.read_text())

current = finish_payload.get("currentConnection", {})
audience = current.get("audience")
if not isinstance(audience, str) or "/spaces/" not in audience:
    raise SystemExit("expected final snapshot to be bound to a dedicated spawned-space audience")

messages = scan_payload.get("messages")
if not isinstance(messages, list) or not messages:
    raise SystemExit("expected non-empty home scan messages")

print("happy path ok")
PY

echo "smoke test passed"
