#!/bin/bash
# Creates a least-privilege application user for Carbonytics.
#
# The official mongo image runs every file in /docker-entrypoint-initdb.d ONCE,
# on first boot only (when /data/db is empty), AFTER it has created the root user
# from MONGO_INITDB_ROOT_USERNAME/PASSWORD and enabled authentication. We use the
# root credentials here to create an app user that has readWrite on the app DB
# ONLY -- the backend connects as this user, never as root.
#
# If you enable auth on an EXISTING data volume (init scripts won't re-run), run
# this script's mongosh block manually once with the root credentials.
set -euo pipefail

: "${MONGO_INITDB_ROOT_USERNAME:?root username required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?root password required}"
: "${MONGO_APP_USERNAME:?app username required}"
: "${MONGO_APP_PASSWORD:?app password required}"
: "${MONGO_APP_DB:=carbonytics_prod}"

echo "[init] ensuring least-privilege app user '${MONGO_APP_USERNAME}' on db '${MONGO_APP_DB}'"

mongosh --quiet \
  -u "${MONGO_INITDB_ROOT_USERNAME}" \
  -p "${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase admin <<EOJS
const appDb = db.getSiblingDB("${MONGO_APP_DB}");
if (appDb.getUser("${MONGO_APP_USERNAME}")) {
  print("[init] app user already exists; leaving as-is");
} else {
  appDb.createUser({
    user: "${MONGO_APP_USERNAME}",
    pwd: "${MONGO_APP_PASSWORD}",
    roles: [{ role: "readWrite", db: "${MONGO_APP_DB}" }],
  });
  print("[init] app user created with readWrite on ${MONGO_APP_DB}");
}
EOJS

# Monitoring user for the Prometheus mongodb_exporter: clusterMonitor on admin
# (serverStatus/replSetGetStatus/etc.) plus read on the app db. Created only when
# MONGO_EXPORTER_USERNAME/PASSWORD are supplied, so monitoring stays optional.
if [ -n "${MONGO_EXPORTER_USERNAME:-}" ] && [ -n "${MONGO_EXPORTER_PASSWORD:-}" ]; then
  echo "[init] ensuring monitoring user '${MONGO_EXPORTER_USERNAME}'"
  mongosh --quiet \
    -u "${MONGO_INITDB_ROOT_USERNAME}" \
    -p "${MONGO_INITDB_ROOT_PASSWORD}" \
    --authenticationDatabase admin <<EOJS
const admin = db.getSiblingDB("admin");
if (admin.getUser("${MONGO_EXPORTER_USERNAME}")) {
  print("[init] monitoring user already exists; leaving as-is");
} else {
  admin.createUser({
    user: "${MONGO_EXPORTER_USERNAME}",
    pwd: "${MONGO_EXPORTER_PASSWORD}",
    roles: [
      { role: "clusterMonitor", db: "admin" },
      { role: "read", db: "${MONGO_APP_DB}" },
    ],
  });
  print("[init] monitoring user created (clusterMonitor + read)");
}
EOJS
fi

echo "[init] done"
