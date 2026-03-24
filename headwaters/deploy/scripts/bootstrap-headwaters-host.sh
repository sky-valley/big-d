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
require_bin scp
require_bin rsync

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
headwaters_http_port="${HEADWATERS_HTTP_PORT:-8090}"
headwaters_app_port="${HEADWATERS_APP_PORT:-18090}"
headwaters_station_port="${HEADWATERS_STATION_PORT:-4010}"
headwaters_max_spaces="${HEADWATERS_MAX_SPACES:-100}"
repo_root="$(cd "$DEPLOY_DIR/../.." && pwd)"

if [[ -n "${HEADWATERS_HOSTNAME:-}" ]]; then
  headwaters_public_origin="https://$HEADWATERS_HOSTNAME"
  headwaters_public_host="$HEADWATERS_HOSTNAME"
else
  headwaters_public_origin="http://$target_ip:$headwaters_http_port"
  headwaters_public_host="$target_ip"
fi

remote() {
  ssh -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new "root@$target_ip" "$@"
}

echo "bootstrapping host $target_ip"

remote <<'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git rsync jq ufw ca-certificates gnupg

mkdir -p /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list

if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
fi

apt-get update
apt-get install -y nodejs caddy

mkdir -p /srv/big-d /etc/headwaters /var/lib/headwaters
EOF

echo "syncing repo artifacts"
rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env.do' \
  "$repo_root/headwaters/" "root@$target_ip:/srv/big-d/headwaters/"

rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude 'node_modules' \
  "$repo_root/intent-space/" "root@$target_ip:/srv/big-d/intent-space/"

rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  "$repo_root/itp/" "root@$target_ip:/srv/big-d/itp/"

echo "installing node deps remotely"
remote "cd /srv/big-d/intent-space && npm install"

echo "installing configs"
scp -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new \
  "$repo_root/headwaters/deploy/Caddyfile" \
  "root@$target_ip:/etc/caddy/Caddyfile"

scp -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new \
  "$repo_root/headwaters/deploy/systemd/headwaters.service" \
  "root@$target_ip:/etc/systemd/system/headwaters.service"

remote "cat > /etc/headwaters/headwaters.env <<EOF
HEADWATERS_HOST=0.0.0.0
HEADWATERS_PORT=$headwaters_app_port
HEADWATERS_ORIGIN=$headwaters_public_origin
HEADWATERS_COMMONS_PORT=$headwaters_station_port
HEADWATERS_COMMONS_ENDPOINT=tcp://$headwaters_public_host:$headwaters_station_port
HEADWATERS_COMMONS_AUDIENCE=intent-space://headwaters/commons
HEADWATERS_DATA_DIR=/var/lib/headwaters
HEADWATERS_MAX_SPACES=$headwaters_max_spaces
INTENT_SPACE_AUTH_SECRET=${INTENT_SPACE_AUTH_SECRET:-intent-space-prod-secret}
EOF"

if [[ -n "${HEADWATERS_HOSTNAME:-}" ]]; then
  remote "perl -0pi -e 's/headwaters\\.example\\.com/${HEADWATERS_HOSTNAME//\//\\/}/g' /etc/caddy/Caddyfile"
else
  remote "cat > /etc/caddy/Caddyfile <<EOF
:$headwaters_http_port {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$headwaters_app_port
}
EOF"
fi

echo "opening firewall"
remote "ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow $headwaters_http_port/tcp && ufw allow $headwaters_station_port/tcp && yes | ufw enable"

echo "starting services"
remote "systemctl daemon-reload && systemctl enable headwaters caddy && systemctl restart headwaters caddy"

echo "bootstrap complete"
echo "  target_ip=$target_ip"
if [[ -n "${HEADWATERS_HOSTNAME:-}" ]]; then
  echo "  headwaters_url=https://$HEADWATERS_HOSTNAME/agent-setup.md"
else
  echo "  headwaters_url=http://$target_ip:$headwaters_http_port/agent-setup.md"
fi
echo "  station_endpoint=tcp://$headwaters_public_host:$headwaters_station_port"
