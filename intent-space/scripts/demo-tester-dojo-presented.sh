#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
AGENT_TARGET="${AGENT_TARGET:-codex}"
STOP_SCRIPT="/Users/noam/.codex/skills/intent-space-local-station/scripts/stop_stack.sh"
RUN_MANAGED_SCRIPT="/Users/noam/.codex/skills/intent-space-local-station/scripts/run_managed_session.sh"
RUN_ID="${RUN_ID:-$(date +%s)-$$}"
WORKDIR="/tmp/intent-space-demo-${AGENT_TARGET}-${RUN_ID}"
PROMPT_FILE="$WORKDIR/tester-prompt.txt"
DEMO_STATE_FILE="/tmp/intent-space-demo-${RUN_ID}.env"
DEMO_MANAGED_STATE_FILE="/tmp/intent-space-demo-managed-${RUN_ID}.env"
DEMO_LOG_DIR="/tmp/intent-space-demo-logs-${RUN_ID}"
DEMO_SPACE_DIR="/tmp/intent-space-demo-space-${RUN_ID}"

find_free_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

banner() {
  printf '\033[1;97;44m %s \033[0m\n' "$1"
}

chapter() {
  clear
  printf '\033[1;97;44m+--------------------------------------------------+\033[0m\n'
  printf '\033[1;97;44m| %-48s |\033[0m\n' "$1"
  printf '\033[1;97;44m+--------------------------------------------------+\033[0m\n'
}

note() {
  printf '\033[38;5;153m%s\033[0m\n' "$1"
}

ok() {
  printf '\033[1;30;42m %s \033[0m\n' "$1"
}

ACADEMY_PORT="${ACADEMY_PORT:-$(find_free_port)}"
STATION_PORT="${STATION_PORT:-$(find_free_port)}"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

cat > "$PROMPT_FILE" <<'EOF'
Use the onboarding pack at http://127.0.0.1:ACADEMY_PORT_PLACEHOLDER to join the station and complete the dojo.

The station endpoint is tcp://127.0.0.1:STATION_PORT_PLACEHOLDER.
Use the docs there as the source of truth.
Store your local identity and working files in this directory.
You are finished when the dojo reaches ASSESS.
EOF

python3 - <<PY
from pathlib import Path
path = Path("$PROMPT_FILE")
text = path.read_text()
text = text.replace("ACADEMY_PORT_PLACEHOLDER", "$ACADEMY_PORT")
text = text.replace("STATION_PORT_PLACEHOLDER", "$STATION_PORT")
path.write_text(text)
PY

with_demo_env() {
  INTENT_SPACE_LOCAL_STATE_FILE="$DEMO_STATE_FILE" \
  INTENT_SPACE_LOCAL_LOG_DIR="$DEMO_LOG_DIR" \
  DIFFER_INTENT_SPACE_DIR="$DEMO_SPACE_DIR" \
  ACADEMY_PORT="$ACADEMY_PORT" \
  STATION_PORT="$STATION_PORT" \
  "$@"
}

with_demo_managed_env() {
  INTENT_SPACE_LOCAL_LOG_DIR="$DEMO_LOG_DIR" \
  INTENT_SPACE_LOCAL_MANAGED_STATE_FILE="$DEMO_MANAGED_STATE_FILE" \
  DIFFER_INTENT_SPACE_DIR="$DEMO_SPACE_DIR" \
  ACADEMY_PORT="$ACADEMY_PORT" \
  STATION_PORT="$STATION_PORT" \
  "$@"
}

cleanup() {
  if [[ -f "$DEMO_MANAGED_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$DEMO_MANAGED_STATE_FILE"
    if [[ -n "${MANAGED_SESSION_PID:-}" ]] && kill -0 "$MANAGED_SESSION_PID" 2>/dev/null; then
      kill "$MANAGED_SESSION_PID" 2>/dev/null || true
      wait "$MANAGED_SESSION_PID" 2>/dev/null || true
    fi
  fi
}

trap cleanup EXIT

chapter "INTENT SPACE DOJO"
note "Goal: give a tester one prompt and let their agent bootstrap from academy."
note "Success means the live ritual reaches ASSESS."
printf '\n'
sleep 2

with_demo_env bash "$STOP_SCRIPT" >/dev/null 2>&1 || true
with_demo_managed_env bash "$RUN_MANAGED_SCRIPT" "$REPO_ROOT" >/dev/null 2>&1 &

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -f "$DEMO_MANAGED_STATE_FILE" ]]; then
    break
  fi
  sleep 1
done

if [[ ! -f "$DEMO_MANAGED_STATE_FILE" ]]; then
  echo "managed station failed to start; see $DEMO_LOG_DIR" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$DEMO_MANAGED_STATE_FILE"

chapter "STATION READY"
printf 'academy  %s\n' "http://localhost:${MANAGED_ACADEMY_PORT:-$ACADEMY_PORT}"
printf 'station  %s\n' "tcp://127.0.0.1:${MANAGED_STATION_PORT:-$STATION_PORT}"
printf 'tutor    %s\n' "connected"
printf '\n'
sleep 2

chapter "TESTER PROMPT"
cat "$PROMPT_FILE"
printf '\n'
sleep 4

chapter "AGENT RUN"
note "Codex receives only the prompt above and the live academy/station."
note "The next section is the real agent session."
printf '\n'

case "$AGENT_TARGET" in
  codex)
    codex exec \
      --dangerously-bypass-approvals-and-sandbox \
      --skip-git-repo-check \
      -C "$WORKDIR" \
      -c 'model_reasoning_effort="medium"' \
      "$(cat "$PROMPT_FILE")"
    ;;
  *)
    echo "Unsupported AGENT_TARGET=$AGENT_TARGET" >&2
    exit 1
    ;;
esac

TRANSCRIPT="$WORKDIR/.intent-space/state/tutorial-transcript.ndjson"
printf '\n'
chapter "RESULT"
ok "dojo completed end to end"
printf 'workspace  %s\n' "$WORKDIR"
printf 'transcript %s\n' "$TRANSCRIPT"
printf '\n'

node -e '
const fs = require("fs");
const path = process.argv[1];
const interesting = new Set(["DECLINE", "PROMISE", "ACCEPT", "COMPLETE", "ASSESS", "INTENT"]);
const lines = fs.readFileSync(path, "utf8").trim().split(/\n+/);
const rows = [];
for (const line of lines) {
  const { direction, message } = JSON.parse(line);
  if (!interesting.has(message.type)) continue;
  if (message.type === "INTENT" && message.senderId !== "differ-tutor") continue;
  if (message.type === "ACCEPT" && direction !== "in") continue;
  if (message.type === "ASSESS" && direction !== "in") continue;
  rows.push({
    seq: String(message.seq ?? "-").padStart(2),
    type: String(message.type).padEnd(8),
    sender: message.senderId ?? "-",
  });
}
for (const row of rows.slice(-6)) {
  console.log(`${row.seq}  ${row.type}  ${row.sender}`);
}
' "$TRANSCRIPT"
