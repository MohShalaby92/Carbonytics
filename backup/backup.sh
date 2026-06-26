#!/usr/bin/env bash
# Carbonytics scheduled MongoDB backup sidecar.
#
# Runs on the stock mongo image (which already bundles mongodump, matching the
# server version). Performs one dump immediately on start -- so a fresh stack has
# a backup within seconds and the mechanism is easy to verify -- then repeats
# every BACKUP_INTERVAL seconds. Each run writes a single gzipped
# `mongodump --archive` to /backup (host ./backups) and prunes archives older
# than BACKUP_RETENTION_DAYS. Restore with scripts/restore-data.sh.
set -uo pipefail

: "${MONGO_INITDB_ROOT_USERNAME:?root username required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?root password required}"
DB="${MONGO_APP_DB:-carbonytics_prod}"
HOST="${BACKUP_MONGO_HOST:-mongo:27017}"
INTERVAL="${BACKUP_INTERVAL:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
DEST="/backup"

mkdir -p "$DEST"

run_backup() {
  local ts archive
  ts="$(date -u +%Y%m%d_%H%M%S)"
  archive="${DEST}/carbonytics_${DB}_${ts}.archive.gz"
  echo "[backup] $(date -u +%FT%TZ) dumping ${DB} from ${HOST} -> $(basename "$archive")"
  if mongodump --host "$HOST" \
       --username "$MONGO_INITDB_ROOT_USERNAME" \
       --password "$MONGO_INITDB_ROOT_PASSWORD" \
       --authenticationDatabase admin \
       --db "$DB" --archive="$archive" --gzip; then
    echo "[backup] ok: $(du -h "$archive" | cut -f1)"
  else
    echo "[backup] ERROR: mongodump failed" >&2
    rm -f "$archive"
  fi
  echo "[backup] pruning archives older than ${RETENTION} days"
  find "$DEST" -name 'carbonytics_*.archive.gz' -mtime +"$RETENTION" -delete 2>/dev/null || true
  echo "[backup] retained: $(ls -1 "$DEST"/carbonytics_*.archive.gz 2>/dev/null | wc -l) archive(s)"
}

echo "[backup] starting; interval=${INTERVAL}s retention=${RETENTION}d db=${DB}"
while true; do
  run_backup
  sleep "$INTERVAL"
done
