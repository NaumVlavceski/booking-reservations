#!/usr/bin/env bash
# Brings up the local E2E stack (see Docs/testing/README.md, "Frontend"):
#   1. audit-fe-db   throwaway postgres:16 on 127.0.0.1:45433 (empty; Flyway migrates it)
#   2. audit-fe-api  the backend jar (built by build-backend.sh) in maven:3.9-eclipse-temurin-25 on 127.0.0.1:18081,
#                    profile "local" (mail off, codes logged), throwaway secrets generated here, high rate limits
#   3. e2e/.dist     a production build of the frontend (API on the same origin, demo on)
#   4. seed          owners A and B (+ 1,000 reservations for the performance owner)
# The UI server (ui-server.mjs on 127.0.0.1:4180) is started by Playwright's webServer, or by hand:
#   node e2e/stack/ui-server.mjs
# Options: SKIP_BUILD=1 (reuse jar and dist), REBUILD_JAR=1.
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$E2E_RUN_DIR"

# --- 1. database ---
if ! docker ps --format '{{.Names}}' | grep -qx "$E2E_DB_CONTAINER"; then
  docker rm -f "$E2E_DB_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$E2E_DB_CONTAINER" -e POSTGRES_DB=$E2E_DB_NAME -e POSTGRES_USER=$E2E_DB_USER \
    -e POSTGRES_PASSWORD=$E2E_DB_PASSWORD -p 127.0.0.1:$E2E_DB_PORT:5432 postgres:16 >/dev/null
fi
for i in $(seq 1 60); do
  docker exec "$E2E_DB_CONTAINER" pg_isready -U $E2E_DB_USER -d $E2E_DB_NAME >/dev/null 2>&1 && break; sleep 1
done

# --- 2. backend ---
JAR="$(ls "$E2E_WORK_DIR"/target/*.jar 2>/dev/null | grep -v original | head -1 || true)"
if [ -z "$JAR" ] || [ "${REBUILD_JAR:-0}" = 1 ]; then
  E2E_WORK_DIR="$E2E_WORK_DIR" bash "$HERE/build-backend.sh"
  JAR="$(ls "$E2E_WORK_DIR"/target/*.jar | grep -v original | head -1)"
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$E2E_API_CONTAINER"; then
  docker rm -f "$E2E_API_CONTAINER" >/dev/null 2>&1 || true
  rnd() { node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"; }
  # Throwaway secrets, generated per start and never written to disk.
  MSYS_NO_PATHCONV=1 docker run -d --name "$E2E_API_CONTAINER" \
    -p 127.0.0.1:$E2E_API_PORT:8080 \
    -v "$(to_docker_path "$(dirname "$JAR")")":/app:ro \
    -e SPRING_PROFILES_ACTIVE=local \
    -e SPRING_DATASOURCE_URL="jdbc:postgresql://host.docker.internal:$E2E_DB_PORT/$E2E_DB_NAME" \
    -e SPRING_DATASOURCE_USERNAME=$E2E_DB_USER -e SPRING_DATASOURCE_PASSWORD=$E2E_DB_PASSWORD \
    -e SPRING_FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/fresh-install \
    -e APP_JWT_SECRET="$(rnd)" -e EMAIL_CODE_SECRET="$(rnd)" \
    -e APP_JWT_IDLE_TIMEOUT_MS=604800000 -e APP_JWT_ABSOLUTE_TIMEOUT_MS=2592000000 -e APP_JWT_RENEW_THRESHOLD_RATIO=0.5 \
    -e MAIL_ENABLED=false -e APP_DEMO_ENABLED=true -e APP_DOCS_ENABLED=false \
    -e PUBLIC_API_URL="http://127.0.0.1:$E2E_UI_PORT" -e APP_FRONTEND_URL="http://127.0.0.1:$E2E_UI_PORT" \
    -e AUTH_IP_LIMIT_PER_HOUR=100000 -e AUTH_RESET_IP_LIMIT_PER_HOUR=1000 \
    -e APP_RATELIMIT_REGISTERPERIP_MAX=1000 -e APP_RATELIMIT_LOGINFAILURESPERIP_MAX=1000 \
    -e APP_RATELIMIT_DEMOPERIP_MAX=1000 -e APP_RATELIMIT_RESENDPERIP_MAX=1000 \
    -e APP_RATELIMIT_CONTACTPERIP_MAX=1000 -e APP_RATELIMIT_DATAEXPORT_MAX=1000 \
    maven:3.9-eclipse-temurin-25 java -jar "/app/$(basename "$JAR")" >/dev/null
fi
echo -n "waiting for the API"
for i in $(seq 1 120); do
  if curl -fs "http://127.0.0.1:$E2E_API_PORT/actuator/health" >/dev/null 2>&1; then echo " up"; break; fi
  echo -n "."; sleep 1
  if [ "$i" = 120 ]; then echo; docker logs --tail 50 "$E2E_API_CONTAINER"; exit 1; fi
done

# --- 3. frontend production build (same-origin API) ---
if [ "${SKIP_BUILD:-0}" != 1 ] || [ ! -f "$E2E_DIST/index.html" ]; then
  # VITE_API_URL is the UI server's own origin rather than "" because Windows drops empty environment variables,
  # and then the value in frontend/.env would win. The build is checked below.
  # VITE_ALLOW_LOCAL_API=1: vite.config.ts refuses production builds that call this machine (SEC-02) unless told so.
  (cd "$FRONTEND" && VITE_API_URL="http://127.0.0.1:$E2E_UI_PORT" VITE_ALLOW_LOCAL_API=1 VITE_DEMO_ENABLED=true \
     npx vite build --outDir e2e/.dist --emptyOutDir --logLevel warn)
  grep -rq "http://127.0.0.1:$E2E_UI_PORT" "$E2E_DIST/assets" || { echo "build does not use the local API origin"; exit 1; }
  if grep -rqE "https?://api\.roomtrack\.app" "$E2E_DIST/assets"; then echo "build points at production API, refusing"; exit 1; fi
fi

# --- 4. seed ---
(cd "$FRONTEND" && node e2e/stack/seed.ts)
echo "stack ready: UI http://127.0.0.1:$E2E_UI_PORT (start with: node e2e/stack/ui-server.mjs, or let Playwright do it)"
