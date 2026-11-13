#!/usr/bin/env bash
# Builds the backend jar for the local E2E stack inside a maven:3.9-eclipse-temurin-25 container.
# Works on a COPY of backend/ (src + pom.xml) so nothing in the repo changes. The untracked
# application-local.yml is removed from the copy: the E2E stack passes its own throwaway settings as env vars.
#
# Usage: bash frontend/e2e/stack/build-backend.sh            (work dir: frontend/e2e/.work/backend)
#        E2E_WORK_DIR=/some/dir bash .../build-backend.sh
# Output: <work dir>/target/booking-backend-*.jar
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
W="${E2E_WORK_DIR:-$REPO/frontend/e2e/.work/backend}"
mkdir -p "$W"
rm -rf "$W/src"
cp -r "$REPO/backend/src" "$REPO/backend/pom.xml" "$W/"
rm -f "$W/src/main/resources/application-local.yml"
M2="${M2_DIR:-$HOME/.m2}"
mkdir -p "$M2"
to_docker_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(to_docker_path "$W")":/work -v "$(to_docker_path "$M2")":/m2 -w /work \
  maven:3.9-eclipse-temurin-25 mvn -B -q -Dmaven.repo.local=/m2/repository package -DskipTests > "$W/build.log" 2>&1 \
  || { echo "backend build failed, see $W/build.log"; tail -30 "$W/build.log"; exit 1; }
ls "$W"/target/*.jar | grep -v original
