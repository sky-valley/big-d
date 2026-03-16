#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-academy.intent.space}"
STATION_PORT="${2:-4443}"

echo "academy: https://$HOST"
curl -fsS "https://$HOST/" >/dev/null

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

echo "smoke test passed"
