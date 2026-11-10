#!/usr/bin/env bash
# Restore the reference-data archives (seed/*.archive.gz, produced by
# export-reference-data.sh) into the REVIEW stack's authenticated MongoDB, then
# clear the API response cache so the freshly-seeded library is visible at once.
#
# Idempotent: deletes only the SHARED docs (organizationId null/absent) of the
# three reference collections, then restores the seed. Reviewers' org-private
# custom factors + the versions their calculations pin are left untouched.
# Run on the VM from the repo root, with the review stack up and .env.review filled in.
#
# Usage:  bash scripts/import-reference-data.sh [review-mongo-container] [review-redis-container]
#         defaults: carbonytics-review-mongo  carbonytics-review-redis
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
set -a; . ./.env.review; set +a

MONGO_CONTAINER="${1:-carbonytics-review-mongo}"
REDIS_CONTAINER="${2:-carbonytics-review-redis}"
APP_DB="${MONGO_APP_DB:-carbonytics_prod}"

COLLECTIONS=(emissioncategories emissionfactors emissionfactorversions)
for C in "${COLLECTIONS[@]}"; do
  [ -f "seed/$C.archive.gz" ] || { echo "missing seed/$C.archive.gz — run export-reference-data.sh on the dev machine first"; exit 1; }
done

for C in "${COLLECTIONS[@]}"; do
  docker exec "$MONGO_CONTAINER" \
    mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin "$APP_DB" \
      --eval "print('$C: removed ' + db.$C.deleteMany({ organizationId: null }).deletedCount + ' shared docs')"
  docker exec -i "$MONGO_CONTAINER" \
    mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin --nsFrom='carbonytics.*' --nsTo="${APP_DB}.*" \
      --gzip --archive < "seed/$C.archive.gz"
  echo "restored $C"
done

# The factor/category list endpoints are cached in Redis (CACHE_TTL). FLUSHALL is
# renamed for hardening, so delete only the API cache keys (cache:*); refresh
# tokens are left intact.
echo "clearing API response cache (cache:*) ..."
docker exec "$REDIS_CONTAINER" sh -c \
  "redis-cli -a '$REDIS_PASSWORD' --no-auth-warning --scan --pattern 'cache:*' | while read k; do redis-cli -a '$REDIS_PASSWORD' --no-auth-warning DEL \"\$k\" >/dev/null; done" || true

echo "Done — the reference library is live on the review instance."
