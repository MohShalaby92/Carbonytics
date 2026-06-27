#!/usr/bin/env bash
# One-shot manual production backup. (Scheduled backups are handled by the
# `backup` sidecar in docker-compose.prod.yml; this is for ad-hoc snapshots.)
#
# Produces a gzipped `mongodump --archive` consistent with the sidecar (so
# scripts/restore-data.sh restores either), plus best-effort Redis RDB + uploads
# snapshots. Auth-aware: it reads credentials from the running containers'
# environment, so no secrets are passed on the command line.
set -uo pipefail

TS="$(date -u +%Y%m%d_%H%M%S)"
DIR="./backups"
mkdir -p "$DIR"
MONGO_C="${MONGO_CONTAINER:-carbonytics-mongo}"
REDIS_C="${REDIS_CONTAINER:-carbonytics-redis}"
BACKEND_C="${BACKEND_CONTAINER:-carbonytics-backend}"
DB="${MONGO_APP_DB:-carbonytics_prod}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"

echo "[backup] mongo -> carbonytics_${DB}_${TS}.archive.gz"
docker exec "$MONGO_C" sh -c \
  "mongodump --db ${DB} --archive=/backup/carbonytics_${DB}_${TS}.archive.gz --gzip \
     --username \"\$MONGO_INITDB_ROOT_USERNAME\" \
     --password \"\$MONGO_INITDB_ROOT_PASSWORD\" \
     --authenticationDatabase admin"

echo "[backup] redis -> redis_${TS}.rdb.gz (best-effort)"
if docker exec "$REDIS_C" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning save' >/dev/null 2>&1 \
   && docker cp "$REDIS_C:/data/dump.rdb" "$DIR/redis_${TS}.rdb" 2>/dev/null; then
  gzip -f "$DIR/redis_${TS}.rdb"
else
  echo "  (redis snapshot skipped)"
fi

echo "[backup] uploads -> uploads_${TS}.tar.gz (best-effort)"
if docker cp "$BACKEND_C:/app/uploads" "$DIR/uploads_${TS}" 2>/dev/null; then
  tar -czf "$DIR/uploads_${TS}.tar.gz" -C "$DIR" "uploads_${TS}" && rm -rf "$DIR/uploads_${TS}"
else
  echo "  (uploads snapshot skipped)"
fi

echo "[backup] pruning mongo archives older than ${RETENTION} days"
find "$DIR" -name 'carbonytics_*.archive.gz' -mtime +"$RETENTION" -delete 2>/dev/null || true
echo "[backup] done: $(ls -1 "$DIR"/carbonytics_*.archive.gz 2>/dev/null | wc -l) mongo archive(s) in $DIR"
