#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/headwaters-agent-pack-run.sh" baseline --output-dir tmp/headwaters-agent-pack-compare-baseline "$@"
"$SCRIPT_DIR/headwaters-agent-pack-run.sh" profiled --output-dir tmp/headwaters-agent-pack-compare-profiled "$@"
