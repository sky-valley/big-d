#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$DEPLOY_DIR/.state"
ENV_FILE="${DO_ENV_FILE:-$DEPLOY_DIR/.env.do}"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_bin curl
require_bin jq

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DIGITALOCEAN_TOKEN:?set DIGITALOCEAN_TOKEN in $ENV_FILE}"
: "${DIGITALOCEAN_REGION:?set DIGITALOCEAN_REGION in $ENV_FILE}"
: "${DIGITALOCEAN_SIZE:?set DIGITALOCEAN_SIZE in $ENV_FILE}"
: "${DEPLOY_SSH_PUBLIC_KEY:?set DEPLOY_SSH_PUBLIC_KEY in $ENV_FILE}"

DROPLET_IMAGE="${DROPLET_IMAGE:-ubuntu-24-04-x64}"
DROPLET_NAME="${DROPLET_NAME:-intent-space-dojo}"
USE_RESERVED_IP="${DIGITALOCEAN_USE_RESERVED_IP:-true}"

mkdir -p "$STATE_DIR"

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "https://api.digitalocean.com/v2$path" \
      -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -fsS -X "$method" "https://api.digitalocean.com/v2$path" \
      -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
  fi
}

SSH_KEY_NAME="${DROPLET_NAME}-deploy-key"
SSH_PUBLIC_KEY_CONTENT="$(cat "$DEPLOY_SSH_PUBLIC_KEY")"

existing_key_json="$(api GET "/account/keys" | jq --arg name "$SSH_KEY_NAME" '.ssh_keys[] | select(.name == $name)' | head -n 1)"
if [[ -n "$existing_key_json" ]]; then
  ssh_key_id="$(printf '%s' "$existing_key_json" | jq -r '.id')"
else
  ssh_key_id="$(api POST "/account/keys" "$(jq -n --arg name "$SSH_KEY_NAME" --arg pk "$SSH_PUBLIC_KEY_CONTENT" '{name:$name, public_key:$pk}')" | jq -r '.ssh_key.id')"
fi

existing_droplet_json="$(api GET "/droplets?tag_name=$DROPLET_NAME" | jq --arg name "$DROPLET_NAME" '.droplets[] | select(.name == $name)' | head -n 1)"
if [[ -n "$existing_droplet_json" ]]; then
  droplet_id="$(printf '%s' "$existing_droplet_json" | jq -r '.id')"
else
  droplet_id="$(api POST "/droplets" "$(jq -n \
    --arg name "$DROPLET_NAME" \
    --arg region "$DIGITALOCEAN_REGION" \
    --arg size "$DIGITALOCEAN_SIZE" \
    --arg image "$DROPLET_IMAGE" \
    --argjson ssh_key_id "$ssh_key_id" \
    '{name:$name, region:$region, size:$size, image:$image, ssh_keys:[$ssh_key_id], tags:[$name], backups:false, monitoring:true}')" | jq -r '.droplet.id')"
fi

echo "waiting for droplet $droplet_id to become active..."
for _ in {1..60}; do
  droplet_json="$(api GET "/droplets/$droplet_id" | jq '.droplet')"
  droplet_status="$(printf '%s' "$droplet_json" | jq -r '.status')"
  if [[ "$droplet_status" == "active" ]]; then
    break
  fi
  sleep 5
done

droplet_json="$(api GET "/droplets/$droplet_id" | jq '.droplet')"
public_ip="$(printf '%s' "$droplet_json" | jq -r '.networks.v4[] | select(.type == "public") | .ip_address' | head -n 1)"

reserved_ip=""
if [[ "$USE_RESERVED_IP" == "true" ]]; then
  existing_reserved_json="$(api GET "/reserved_ips" | jq --arg ip "$public_ip" '.reserved_ips[] | select(.droplet.id? != null and .droplet.id == '"$droplet_id"')' | head -n 1)"
  if [[ -n "$existing_reserved_json" ]]; then
    reserved_ip="$(printf '%s' "$existing_reserved_json" | jq -r '.ip')"
  else
    reserved_ip="$(api POST "/reserved_ips" "$(jq -n --arg region "$DIGITALOCEAN_REGION" '{region:$region}')" | jq -r '.reserved_ip.ip')"
    api POST "/reserved_ips/$reserved_ip/actions" "$(jq -n --argjson droplet_id "$droplet_id" '{type:"assign", droplet_id:$droplet_id}')" >/dev/null
  fi
fi

target_ip="${reserved_ip:-$public_ip}"

jq -n \
  --arg droplet_name "$DROPLET_NAME" \
  --argjson droplet_id "$droplet_id" \
  --arg public_ip "$public_ip" \
  --arg reserved_ip "$reserved_ip" \
  --arg target_ip "$target_ip" \
  --arg region "$DIGITALOCEAN_REGION" \
  --arg size "$DIGITALOCEAN_SIZE" \
  --arg ssh_key_name "$SSH_KEY_NAME" \
  --argjson ssh_key_id "$ssh_key_id" \
  '{
    dropletName:$droplet_name,
    dropletId:$droplet_id,
    publicIp:$public_ip,
    reservedIp:($reserved_ip | select(length > 0)),
    targetIp:$target_ip,
    region:$region,
    size:$size,
    sshKeyName:$ssh_key_name,
    sshKeyId:$ssh_key_id
  }' > "$STATE_DIR/do-state.json"

echo "droplet ready"
echo "  droplet_id=$droplet_id"
echo "  target_ip=$target_ip"
echo "  state=$STATE_DIR/do-state.json"
