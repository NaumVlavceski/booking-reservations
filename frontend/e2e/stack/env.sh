# Shared settings for the local E2E stack (sourced by up.sh / down.sh). Everything is local and throwaway.
# The guard in playwright.config.ts refuses any URL that points at roomtrack.app.
E2E_PREFIX="${E2E_PREFIX:-audit-fe-}"
E2E_DB_CONTAINER="${E2E_PREFIX}db"
E2E_API_CONTAINER="${E2E_PREFIX}api"
E2E_DB_PORT="${E2E_DB_PORT:-45433}"
E2E_API_PORT="${E2E_API_PORT:-18081}"
E2E_UI_PORT="${E2E_UI_PORT:-4180}"
E2E_DB_NAME=roomtrack_e2e
E2E_DB_USER=e2e
# Test value for a throwaway container bound to 127.0.0.1 only.
E2E_DB_PASSWORD=e2e-throwaway
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$FRONTEND/.." && pwd)"
E2E_WORK_DIR="${E2E_WORK_DIR:-$FRONTEND/e2e/.work/backend}"
E2E_DIST="$FRONTEND/e2e/.dist"
E2E_RUN_DIR="$FRONTEND/e2e/.work/run"
to_docker_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
