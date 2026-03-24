#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="${DO_STATE_FILE:-$DEPLOY_DIR/.state/do-state.json}"
ENV_FILE="${DO_ENV_FILE:-$DEPLOY_DIR/.env.do}"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_bin jq
require_bin ssh

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "missing DigitalOcean state file: $STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DEPLOY_SSH_PRIVATE_KEY:?set DEPLOY_SSH_PRIVATE_KEY in $ENV_FILE}"

target_ip="$(jq -r '.targetIp' "$STATE_FILE")"
station_port="${HEADWATERS_STATION_PORT:-4010}"

ssh -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new "root@$target_ip" "STATION_PORT=$station_port /bin/bash -s" <<'EOF'
set -euo pipefail

main_pid="$(systemctl show -p MainPID --value headwaters)"
if [[ -z "$main_pid" || "$main_pid" == "0" ]]; then
  echo '{"status":"inactive"}'
  exit 0
fi

declare -a pids=("$main_pid")
index=0
while [[ $index -lt ${#pids[@]} ]]; do
  parent_pid="${pids[$index]}"
  while IFS= read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    pids+=("$child_pid")
  done < <(pgrep -P "$parent_pid" || true)
  index=$((index + 1))
done

process_list="$(printf '%s\n' "${pids[@]}" | awk '!seen[$0]++')"
process_csv="$(printf '%s\n' "$process_list" | paste -sd, -)"
node_children="$(printf '%s\n' "$process_list" | tail -n +2)"

fd_count="0"
while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  if [[ -d "/proc/$pid/fd" ]]; then
    count="$(find "/proc/$pid/fd" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
    fd_count=$((fd_count + count))
  fi
done < <(printf '%s\n' "$process_list")

tcp_connections="$(ss -tan "sport = :$STATION_PORT" | tail -n +2 | wc -l | tr -d ' ')"

rss_kb="$(ps -o rss= -p "$process_csv" | awk '{sum += $1} END {printf "%d", sum}')"
cpu_pct="$(ps -o %cpu= -p "$process_csv" | awk '{sum += $1} END {printf "%.1f", sum}')"
elapsed="$(ps -o etime= -p "$main_pid" | xargs)"
spaces_dir="/var/lib/headwaters/spaces"
space_count="0"
if [[ -d "$spaces_dir" ]]; then
  space_count="$(find "$spaces_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
fi

jq -n \
  --arg status "$(systemctl is-active headwaters)" \
  --arg mainPid "$main_pid" \
  --arg childPids "$node_children" \
  --arg processCount "$(printf '%s\n' "$process_list" | wc -l | tr -d ' ')" \
  --arg rssKb "$rss_kb" \
  --arg cpuPct "$cpu_pct" \
  --arg elapsed "$elapsed" \
  --arg fdCount "$fd_count" \
  --arg tcpConnections "$tcp_connections" \
  --arg spaceCount "$space_count" \
  '{
    status:$status,
    mainPid:($mainPid | tonumber),
    childPids:($childPids | split("\n") | map(select(length > 0))),
    processCount:($processCount | tonumber),
    rssKb:($rssKb | tonumber),
    cpuPct:$cpuPct,
    elapsed:$elapsed,
    fdCount:($fdCount | tonumber),
    tcpConnections:($tcpConnections | tonumber),
    spaceCount:($spaceCount | tonumber)
  }'
EOF
