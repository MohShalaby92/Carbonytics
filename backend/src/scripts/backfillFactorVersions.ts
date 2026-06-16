import mongoose from 'mongoose';
import { config } from '../config/config';
import { EmissionFactor } from '../models/EmissionFactor';
import { recordFactorVersion, licenseForSource } from '../services/factorVersioning';

/**
 * Idempotent migration for §3 (factor library as versioned reference data):
 * record an immutable v1 snapshot for every emission factor that has no version
 * yet, and best-effort backfill the `license` field from the factor's source.
 *
 * Re-running is safe and is in fact the intended workflow AFTER importing a new
 * annual factor set: the importer overwrites factor values in place (bulkWrite
 * upsert, which bypasses Mongoose hooks), then this script records a NEW version
 * for any factor whose content actually changed (deduplicated by content hash),
 * so locked inventories pinned to an older version still recompute deterministically.
 *
 * Usage: node dist/scripts/backfillFactorVersions.js
 */
async function run(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const factors = await EmissionFactor.find().lean();
  console.log(`Scanning ${factors.length} emission factor(s)...`);

  let versionsCreated = 0;
  let unchanged = 0;
  let licensesBackfilled = 0;

  for (const f of factors as any[]) {
    // Backfill a license from the source where we can, BEFORE snapshotting, so
    // v1 carries it. Conservative: only well-known public datasets (never fabricated).
    if (!f.license) {
      const inferred = licenseForSource(f.source);
      if (inferred) {
        await EmissionFactor.updateOne({ _id: f._id }, { $set: { license: inferred } });
        f.license = inferred;
        licensesBackfilled++;
      }
    }

    const { created } = await recordFactorVersion(f, {
      recordedBy: 'backfill',
      changeReason: 'Initial version (backfill of existing library)',
    });
    if (created) versionsCreated++;
    else unchanged++;
  }

  console.log('Factor version backfill complete:');
  console.log(`  versions recorded:   ${versionsCreated}`);
  console.log(`  already up to date:  ${unchanged}`);
  console.log(`  licenses backfilled: ${licensesBackfilled}`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
