#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACADEMY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="${1:-/var/www/academy}"

mkdir -p "$TARGET_DIR"
rsync -a --delete \
  --exclude 'deploy/' \
  "$ACADEMY_DIR"/ "$TARGET_DIR"/

echo "academy deployed to $TARGET_DIR"
