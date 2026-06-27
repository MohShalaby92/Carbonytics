import mongoose from 'mongoose';
import { config } from '../config/config';
import { Organization } from '../models/Organization';
import { Calculation } from '../models/Calculation';
import { ensureInventory, midpointYear } from '../services/inventoryService';

/**
 * One-time, idempotent migration: bucket every existing calculation into a
 * default Draft inventory per (organization, reporting year), where the
 * reporting year is the period-midpoint year (the same rule the intensity
 * metrics use). Calculations that are already linked are skipped.
 *
 * The inventoryId back-fill is written with the NATIVE driver
 * (Calculation.collection.updateOne) on purpose: it bypasses the Mongoose
 * immutability guard so already-locked calculations can be linked too. This is a
 * structural back-fill of a new grouping key, NOT a restatement of any emissions
 * figure (the guard exists to stop the latter). Re-running it is safe.
 *
 * Usage: node dist/scripts/migrateInventories.js
 */
async function run(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const organizations = await Organization.find().select('_id name').lean();
  console.log(`Scanning ${organizations.length} organization(s)...`);

  let inventoriesCreated = 0;
  let calculationsLinked = 0;
  let calculationsAlreadyLinked = 0;

  for (const org of organizations as any[]) {
    const orgId = org._id.toString();
    const calcs = await Calculation.find({ organizationId: org._id })
      .select('_id period inventoryId')
      .lean();
    if (calcs.length === 0) continue;

    // Cache the inventory per year so we create at most one per (org, year).
    const invByYear = new Map<number, any>();

    for (const calc of calcs as any[]) {
      if (calc.inventoryId) {
        calculationsAlreadyLinked++;
        continue;
      }
      const year = midpointYear(calc.period.start, calc.period.end);
      let inv = invByYear.get(year);
      if (!inv) {
        const before = await mongoose.connection
          .collection('inventories')
          .findOne({ organizationId: org._id, reportingYear: year });
        inv = await ensureInventory(orgId, year);
        if (!before) inventoriesCreated++;
        invByYear.set(year, inv);
      }
      // Native driver: structural back-fill that bypasses the lock guard.
      await Calculation.collection.updateOne(
        { _id: calc._id },
        { $set: { inventoryId: inv._id } }
      );
      calculationsLinked++;
    }

    if (invByYear.size > 0) {
      console.log(
        `  ${org.name}: ${invByYear.size} reporting year(s) [${[...invByYear.keys()]
          .sort()
          .join(', ')}]`
      );
    }
  }

  console.log('Inventory migration complete:');
  console.log(`  inventories created:        ${inventoriesCreated}`);
  console.log(`  calculations linked:        ${calculationsLinked}`);
  console.log(`  calculations already linked: ${calculationsAlreadyLinked}`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
