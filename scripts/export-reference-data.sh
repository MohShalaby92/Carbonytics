#!/usr/bin/env bash
# Export the verified REFERENCE DATA (emission categories + factor library +
# factor-version history) from the LOCAL dev stack into seed/ archives, to ship to
# the review VM. This is PII-free: only the three reference collections are dumped
# (no orgs, users, calculations or evidence).
#
# Run on the dev machine with the dev stack up. Then copy seed/ to the VM and run
# scripts/import-reference-data.sh there.
#
# Usage:  bash scripts/export-reference-data.sh [dev-mongo-container] [dev-db]
#         defaults: carbonytics-mongo-1  carbonytics
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_CONTAINER="${1:-carbonytics-mongo-1}"
SRC_DB="${2:-carbonytics}"
mkdir -p seed

for C in emissioncategories emissionfactors emissionfactorversions; do
  docker exec "$SRC_CONTAINER" mongodump --db="$SRC_DB" --collection="$C" --archive --gzip > "seed/$C.archive.gz"
  echo "exported $C ($(wc -c < "seed/$C.archive.gz") bytes) -> seed/$C.archive.gz"
done

echo
echo "Done. Ship the archives to the VM, e.g.:"
echo "  scp -r seed/ user@<vm>:/path/to/Carbonytics/seed/"
echo "then on the VM:  bash scripts/import-reference-data.sh"
