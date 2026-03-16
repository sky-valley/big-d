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
station_port="${STATION_PORT:-4443}"
academy_http_port="${ACADEMY_HTTP_PORT:-8080}"
repo_root="$(cd "$DEPLOY_DIR/../.." && pwd)"

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

mkdir -p /srv/big-d /var/www/academy /etc/intent-space /var/lib/intent-space
EOF

echo "syncing repo artifacts"
rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env.do' \
  "$repo_root/academy/" "root@$target_ip:/srv/big-d/academy/"

rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude 'node_modules' \
  "$repo_root/intent-space/" "root@$target_ip:/srv/big-d/intent-space/"

rsync -az --delete \
  -e "ssh -i $DEPLOY_SSH_PRIVATE_KEY -o StrictHostKeyChecking=accept-new" \
  "$repo_root/itp/" "root@$target_ip:/srv/big-d/itp/"

echo "installing node deps remotely"
remote "cd /srv/big-d/intent-space && npm install"

echo "publishing academy site"
remote "bash /srv/big-d/academy/deploy/scripts/deploy-academy.sh /var/www/academy"

echo "installing configs"
scp -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new \
  "$repo_root/academy/deploy/Caddyfile" \
  "root@$target_ip:/etc/caddy/Caddyfile"

scp -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new \
  "$repo_root/academy/deploy/systemd/intent-space-station.service" \
  "root@$target_ip:/etc/systemd/system/intent-space-station.service"

scp -i "$DEPLOY_SSH_PRIVATE_KEY" -o StrictHostKeyChecking=accept-new \
  "$repo_root/academy/deploy/systemd/intent-space-tutor.service" \
  "root@$target_ip:/etc/systemd/system/intent-space-tutor.service"

remote "cat > /etc/intent-space/station.env <<EOF
DIFFER_INTENT_SPACE_DIR=/var/lib/intent-space
INTENT_SPACE_PORT=$station_port
INTENT_SPACE_HOST=0.0.0.0
EOF"

remote "cat > /etc/intent-space/tutor.env <<EOF
INTENT_SPACE_TUTOR_HOST=127.0.0.1
INTENT_SPACE_TUTOR_PORT=$station_port
EOF"

if [[ -n "${ACADEMY_HOSTNAME:-}" ]]; then
  remote "perl -0pi -e 's/academy\\.intent\\.space/${ACADEMY_HOSTNAME//\//\\/}/g' /etc/caddy/Caddyfile"
else
  remote "cat > /etc/caddy/Caddyfile <<EOF
:$academy_http_port {
	root * /var/www/academy
	file_server
	encode zstd gzip
	try_files {path} {path}/ /README.md
}
EOF"
fi

echo "opening firewall"
remote "ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow $academy_http_port/tcp && ufw allow $station_port/tcp && yes | ufw enable"

echo "starting services"
remote "systemctl daemon-reload && systemctl enable intent-space-station intent-space-tutor caddy && systemctl restart caddy intent-space-station intent-space-tutor"

echo "bootstrap complete"
echo "  target_ip=$target_ip"
if [[ -n "${ACADEMY_HOSTNAME:-}" ]]; then
  echo "  academy_url=https://$ACADEMY_HOSTNAME/"
else
  echo "  academy_url=http://$target_ip:$academy_http_port/agent-setup.md"
fi
echo "  station_endpoint=tcp://$target_ip:$station_port"
