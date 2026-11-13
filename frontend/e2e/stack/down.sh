#!/usr/bin/env bash
# Stops the local E2E stack: the UI server and the two audit containers. Leaves the built files in e2e/.dist.
set -u
source "$(dirname "$0")/env.sh"
if [ -f "$E2E_RUN_DIR/ui-server.pid" ]; then
  kill "$(cat "$E2E_RUN_DIR/ui-server.pid")" 2>/dev/null || true
  rm -f "$E2E_RUN_DIR/ui-server.pid"
fi
# Only our own containers, by exact name. Never the owner's booking-* containers.
for c in "$E2E_API_CONTAINER" "$E2E_DB_CONTAINER"; do
  docker rm -f "$c" >/dev/null 2>&1 && echo "removed $c" || true
done
