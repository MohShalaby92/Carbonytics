import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { config } from '../config/config';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';

/**
 * Import EPA GHG Emission Factors Hub (2025) — Table 10 (Business Travel /
 * Employee Commuting, per-mile, TRUE per-gas masses: kg CO2, g CH4, g N2O).
 *
 * Unlike DEFRA's CO2e-of-gas rows, these are actual gas masses, so they are
 * stored in the per-gas fields (co2/ch4/n2o, converted to kg per km) and the
 * engine applies the organization's GWP set at calculation time. The `factor`
 * field stores an AR6-computed CO2e for display; runtime always recomputes
 * from the per-gas values. Mile → km conversion is exact (1.609344).
 *
 * Idempotent (upsert by EPA25_* factorCode) and non-destructive.
 *
 * Usage: node dist/scripts/importEpaHub.js <path-to-epa-hub.xlsx>
 */

const MILE_KM = 1.609344;
const AR6 = { ch4: 29.8, n2o: 273 };

async function run(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node dist/scripts/importEpaHub.js <epa-hub.xlsx>');
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const wb = XLSX.readFile(file);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  // Locate Table 10, then its header row ('Vehicle Type').
  let t10 = -1;
  for (let i = 0; i < rows.length; i++) {
    if (/Table 10/i.test(rows[i].map((c) => String(c)).join(' '))) { t10 = i; break; }
  }
  if (t10 < 0) throw new Error('Table 10 not found');
  let hr = -1;
  for (let i = t10; i < t10 + 6; i++) {
    if (rows[i].some((c) => String(c).trim() === 'Vehicle Type')) { hr = i; break; }
  }
  if (hr < 0) throw new Error('Table 10 header row not found');
  const H = rows[hr].map((c) => String(c).trim());
  const iName = H.findIndex((h) => h === 'Vehicle Type');
  const iCO2 = H.findIndex((h) => /CO2 Factor/i.test(h));
  const iCH4 = H.findIndex((h) => /CH4 Factor/i.test(h));
  const iN2O = H.findIndex((h) => /N2O Factor/i.test(h));
  const iUnit = H.findIndex((h) => h === 'Units');

  const categories = await Promise.all([
    EmissionCategory.findOne({ category: 'Business Travel' }),
    EmissionCategory.findOne({ category: 'Employee Commuting' }),
  ]);
  if (!categories[0] || !categories[1]) throw new Error('Target categories missing');

  const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
  const ops: any[] = [];
  let count = 0;

  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[iName] || '').trim();
    if (!name || /^(Source|Notes)/i.test(name)) break; // end of table
    const co2Mile = parseFloat(String(r[iCO2]));
    const ch4Mile = parseFloat(String(r[iCH4]));
    const n2oMile = parseFloat(String(r[iN2O]));
    const unit = String(r[iUnit] || '').trim();
    if (!isFinite(co2Mile)) continue;

    // kg gas per km (CH4/N2O arrive in grams).
    const co2 = co2Mile / MILE_KM;
    const ch4 = (isFinite(ch4Mile) ? ch4Mile : 0) / 1000 / MILE_KM;
    const n2o = (isFinite(n2oMile) ? n2oMile : 0) / 1000 / MILE_KM;
    const co2eAr6 = co2 + ch4 * AR6.ch4 + n2o * AR6.n2o;
    // Strip the trailing footnote letter EPA appends to some names ("Passenger Car A").
    const cleanName = name.replace(/\s+[A-E]$/, '');

    for (const cat of categories) {
      const code = `EPA25_${slug(cat!.category)}__${slug(cleanName)}`;
      ops.push({
        updateOne: {
          filter: { factorCode: code },
          update: {
            $set: {
              categoryId: cat!._id,
              name: `EPA 2025 (US): ${cleanName} (per km, ${unit.replace('-mile', '')})`,
              factor: Math.round(co2eAr6 * 1e6) / 1e6,
              unit: 'kg CO2e/km',
              co2: Math.round(co2 * 1e8) / 1e8,
              ch4: Math.round(ch4 * 1e10) / 1e10,
              n2o: Math.round(n2o * 1e10) / 1e10,
              source: 'EPA GHG Emission Factors Hub 2025',
              sourceDocument: 'EPA Hub Jan 2025, Table 10 (per-gas masses, converted mile->km)',
              region: 'global',
              country: 'US',
              year: 2025,
              qualityRating: 'high',
              isActive: true,
              isDefault: false,
              metadata: { epaUnits: unit, perGas: true, note: 'Engine applies org GWP set to per-gas values; factor field is AR6 display value' },
            },
          },
          upsert: true,
        },
      });
      count++;
    }
  }

  if (ops.length === 0) throw new Error('No Table 10 rows parsed');
  const result = await EmissionFactor.bulkWrite(ops, { ordered: false });
  console.log(`EPA Table 10: ${count} factor entries (${count / 2} modes x 2 categories)`);
  console.log(`upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error('Import failed:', e.message); process.exit(1); });
