#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
AGENT_TARGET="${AGENT_TARGET:-claude}"
START_SCRIPT="/Users/noam/.codex/skills/intent-space-local-station/scripts/start_stack.sh"
STOP_SCRIPT="/Users/noam/.codex/skills/intent-space-local-station/scripts/stop_stack.sh"
STATUS_SCRIPT="/Users/noam/.codex/skills/intent-space-local-station/scripts/status_stack.sh"
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

ACADEMY_PORT="${ACADEMY_PORT:-$(find_free_port)}"
STATION_PORT="${STATION_PORT:-$(find_free_port)}"

show_cmd() {
  printf '\n$ %s\n' "$*"
}

run() {
  show_cmd "$*"
  "$@"
}

run_shell() {
  local cmd="$1"
  show_cmd "$cmd"
  /bin/zsh -lc "$cmd"
}

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
  elif [[ -n "${MANAGED_LAUNCH_PID:-}" ]] && kill -0 "$MANAGED_LAUNCH_PID" 2>/dev/null; then
    kill "$MANAGED_LAUNCH_PID" 2>/dev/null || true
    wait "$MANAGED_LAUNCH_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

run with_demo_env bash "$STOP_SCRIPT"
run with_demo_managed_env bash "$RUN_MANAGED_SCRIPT" "$REPO_ROOT" &
MANAGED_LAUNCH_PID=$!

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
show_cmd "managed session status"
printf 'academy_url=%s\n' "http://localhost:${MANAGED_ACADEMY_PORT:-$ACADEMY_PORT}/agent-setup.md"
printf 'station_endpoint=%s\n' "tcp://127.0.0.1:${MANAGED_STATION_PORT:-$STATION_PORT}"
printf 'managed_session_pid=%s\n' "${MANAGED_SESSION_PID:-$MANAGED_LAUNCH_PID}"
printf 'academy_pid=%s\n' "${MANAGED_ACADEMY_PID:-}"
printf 'station_pid=%s\n' "${MANAGED_STATION_PID:-}"
printf 'tutor_pid=%s\n' "${MANAGED_TUTOR_PID:-}"
printf 'logs=%s\n' "${MANAGED_LOG_DIR:-$DEMO_LOG_DIR}"

run_shell "cat '$PROMPT_FILE'"

case "$AGENT_TARGET" in
  codex)
    run codex exec \
      --dangerously-bypass-approvals-and-sandbox \
      --skip-git-repo-check \
      -C "$WORKDIR" \
      -c 'model_reasoning_effort="medium"' \
      "$(cat "$PROMPT_FILE")"
    ;;
  claude)
    run_shell "cd '$WORKDIR' && cat 'tester-prompt.txt' | claude --print --dangerously-skip-permissions --permission-mode bypassPermissions --add-dir '$REPO_ROOT'"
    ;;
  pi)
    run_shell "cd '$REPO_ROOT/intent-space' && set -a && source .env.pi && set +a && cd '$WORKDIR' && npx -y @mariozechner/pi-coding-agent -p --tools read,bash,edit,write,grep,find,ls --skill '$REPO_ROOT/docs/academy/skill-pack/SKILL.md' --provider \"\$PI_PROVIDER\" --model \"\$PI_MODEL\" --api-key \"\$PI_API_KEY\" \"\$(cat tester-prompt.txt)\""
    ;;
  *)
    echo "Unsupported AGENT_TARGET=$AGENT_TARGET" >&2
    exit 1
    ;;
esac

run_shell "find '$WORKDIR/.intent-space' -maxdepth 3 -type f | sort"
cleanup
