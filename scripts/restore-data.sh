#!/usr/bin/env bash
# Restore a Carbonytics MongoDB backup (a gzipped `mongodump --archive` produced
# by the backup sidecar or scripts/backup-production.sh). Runs mongorestore
# inside the running mongo container using the root credentials already present
# in that container's environment (env_file).
#
# Usage:   ./scripts/restore-data.sh [backups/carbonytics_*.archive.gz]
#          (no arg -> restores the most recent archive in ./backups)
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-carbonytics-mongo}"
ARCHIVE="${1:-$(ls -1t ./backups/carbonytics_*.archive.gz 2>/dev/null | head -1 || true)}"

if [ -z "${ARCHIVE:-}" ] || [ ! -f "$ARCHIVE" ]; then
  echo "No backup archive found."
  echo "Usage: $0 [path/to/carbonytics_*.archive.gz]"
  echo "Available:"
  ls -1 ./backups/carbonytics_*.archive.gz 2>/dev/null || echo "  (none)"
  exit 1
fi
BASENAME="$(basename "$ARCHIVE")"

echo "WARNING: this restores (with --drop) from '$BASENAME' into container '$CONTAINER'."
read -r -p "Continue? (y/N): " ans
case "$ans" in y|Y) ;; *) echo "cancelled"; exit 1 ;; esac

# /backup inside the container is the host ./backups directory.
docker exec "$CONTAINER" sh -c \
  "mongorestore --archive=/backup/${BASENAME} --gzip --drop \
     --username \"\$MONGO_INITDB_ROOT_USERNAME\" \
     --password \"\$MONGO_INITDB_ROOT_PASSWORD\" \
     --authenticationDatabase admin"

echo "Restore complete from ${BASENAME}."
