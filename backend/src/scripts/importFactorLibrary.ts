import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { config } from '../config/config';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';

/**
 * Import the DEFRA/DESNZ GHG conversion factors (FlatFormat workbook) into the
 * shared factor library.
 *
 * Policy decisions (do not change casually):
 * - Only rows with GHG/Unit === 'kg CO2e' are imported. The per-gas rows in
 *   this file are "kg CO2e OF CO2/CH4/N2O" — i.e. already GWP-weighted — so
 *   importing them as gas masses would double-apply GWPs (failure mode #4).
 *   Imported factors are therefore CO2e-denominated (engine: gwpApplied=embedded;
 *   DEFRA 2024 embeds AR5 GWPs).
 * - Each factor's denominator unit matches the target category's accepted units
 *   (values are rescaled, e.g. per-tonne → per-kg) so engine unit handling stays
 *   consistent.
 * - NON-DESTRUCTIVE + IDEMPOTENT: upserts by factorCode (DEFRA24_*) only; never
 *   touches Egyptian factors (region 'egypt'), org custom factors, or baseline
 *   defaults. Egyptian factors remain the primary default by selection policy.
 *
 * Usage: node dist/scripts/importFactorLibrary.js <path-to-flatformat.xlsx>
 */

interface Mapping {
  categoryName: string;
  l1: string;
  uoms: Record<string, { unitOut: string; scale: number }>;
  rowFilter?: (l2: string, l3: string, l4: string, ct: string) => boolean;
}

const MAPPINGS: Mapping[] = [
  {
    categoryName: 'Stationary Combustion',
    l1: 'Fuels',
    uoms: { 'litres': { unitOut: 'kg CO2e/L', scale: 1 }, 'kWh (Gross CV)': { unitOut: 'kg CO2e/kWh', scale: 1 } },
  },
  {
    categoryName: 'Fugitive Emissions',
    l1: 'Refrigerant & other',
    uoms: { 'kg': { unitOut: 'kg CO2e/kg', scale: 1 } },
  },
  {
    categoryName: 'Waste Generated in Operations',
    l1: 'Waste disposal',
    uoms: { 'tonnes': { unitOut: 'kg CO2e/kg', scale: 1 / 1000 } },
  },
  {
    // Owned/controlled fleet — distance-based (Scope 1). DEFRA per-vehicle-km
    // tailpipe factors for company cars/motorbikes. (Business travel reuses the
    // same physical factors but is Scope 3, mapped separately below.)
    categoryName: 'Mobile Combustion',
    l1: 'Passenger vehicles',
    uoms: { 'km': { unitOut: 'kg CO2e/km', scale: 1 } },
  },
  {
    // Owned/controlled vans & HGVs — distance-based (Scope 1), per vehicle-km.
    categoryName: 'Mobile Combustion',
    l1: 'Delivery vehicles',
    uoms: { 'km': { unitOut: 'kg CO2e/km', scale: 1 } },
  },
  {
    categoryName: 'Business Travel',
    l1: 'Business travel- air',
    uoms: { 'passenger.km': { unitOut: 'kg CO2e/km', scale: 1 } },
    // Radiative-forcing-inclusive figures are the conservative default (ISO
    // conservativeness principle).
    rowFilter: (_l2, _l3, _l4, ct) => /with rf/i.test(ct),
  },
  {
    categoryName: 'Business Travel',
    l1: 'Business travel- land',
    uoms: { 'passenger.km': { unitOut: 'kg CO2e/km', scale: 1 }, 'km': { unitOut: 'kg CO2e/km', scale: 1 } },
    rowFilter: (l2, l3) =>
      ['Rail', 'Bus', 'Taxis'].includes(l2) || (l2 === 'Cars (by size)' && /average/i.test(l3)),
  },
  {
    categoryName: 'Upstream Transport',
    l1: 'Freighting goods',
    uoms: { 'tonne.km': { unitOut: 'kg CO2e/tkm', scale: 1 } },
    rowFilter: (l2, l3, l4, ct) => /average|all\b/i.test([l3, l4, ct].join(' ')),
  },
  {
    categoryName: 'Downstream Transport',
    l1: 'Freighting goods',
    uoms: { 'tonne.km': { unitOut: 'kg CO2e/tkm', scale: 1 } },
    rowFilter: (l2, l3, l4, ct) => /average|all\b/i.test([l3, l4, ct].join(' ')),
  },
  {
    categoryName: 'Fuel & Energy Related',
    l1: 'WTT- fuels',
    uoms: { 'kWh (Gross CV)': { unitOut: 'kg CO2e/kWh', scale: 1 }, 'litres': { unitOut: 'kg CO2e/L', scale: 1 } },
  },
  {
    categoryName: 'Fuel & Energy Related',
    l1: 'Transmission and distribution',
    uoms: { 'kWh': { unitOut: 'kg CO2e/kWh', scale: 1 } },
  },
];

const slug = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);

async function run(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node dist/scripts/importFactorLibrary.js <flatformat.xlsx>');
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames.find((n) => /factor/i.test(n)) || wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Locate the header row ("Scope" column present).
  let hr = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some((c) => String(c).trim() === 'Scope')) { hr = i; break; }
  }
  if (hr < 0) throw new Error('Header row not found — unexpected file layout');
  const H = rows[hr].map((c) => String(c).trim());
  const idx = (n: string) => H.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const iL1 = idx('Level 1'), iL2 = idx('Level 2'), iL3 = idx('Level 3'), iL4 = idx('Level 4');
  const iCT = idx('Column Text'), iUOM = idx('UOM'), iGHG = idx('GHG/Unit');
  const iVal = H.findIndex((h) => /conversion factor/i.test(h));
  const yearMatch = H[iVal].match(/(20\d\d)/);
  const vintage = yearMatch ? parseInt(yearMatch[1], 10) : 2024;

  const categories = new Map<string, any>();
  for (const m of MAPPINGS) {
    if (!categories.has(m.categoryName)) {
      const cat = await EmissionCategory.findOne({ category: m.categoryName });
      if (!cat) console.warn(`SKIP mapping — category not found: ${m.categoryName}`);
      categories.set(m.categoryName, cat);
    }
  }

  const ops: any[] = [];
  const counts: Record<string, number> = {};
  const seenCodes = new Set<string>();

  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[iGHG]).trim() !== 'kg CO2e') continue;
    const l1 = String(r[iL1]).trim();
    const uom = String(r[iUOM]).trim();
    const value = parseFloat(String(r[iVal]));
    if (!isFinite(value) || value < 0) continue;

    for (const m of MAPPINGS) {
      if (m.l1 !== l1 || !m.uoms[uom]) continue;
      const cat = categories.get(m.categoryName);
      if (!cat) continue;
      const l2 = String(r[iL2]).trim(), l3 = String(r[iL3]).trim(), l4 = String(r[iL4]).trim(), ct = String(r[iCT]).trim();
      if (m.rowFilter && !m.rowFilter(l2, l3, l4, ct)) continue;

      const label = [l2, l3, l4, ct].filter(Boolean).join(' — ');
      const { unitOut, scale } = m.uoms[uom];
      let code = `DEFRA24_${slug(m.categoryName)}__${slug(`${label}_${uom}`)}`;
      if (seenCodes.has(code)) continue; // first occurrence wins
      seenCodes.add(code);

      ops.push({
        updateOne: {
          filter: { factorCode: code },
          update: {
            $set: {
              categoryId: cat._id,
              name: `DEFRA 2024: ${label} (per ${unitOut.split('/')[1]})`,
              factor: Math.round(value * scale * 1e6) / 1e6,
              unit: unitOut,
              source: 'DEFRA 2024',
              sourceDocument: 'UK DESNZ/DEFRA GHG Conversion Factors 2024, FlatFormat v1.1',
              region: 'global',
              country: 'GB',
              year: vintage,
              qualityRating: 'high',
              isActive: true,
              isDefault: false,
              metadata: { l1, l2, l3, l4, columnText: ct, uom, gwpBasis: 'AR5 (embedded in CO2e value by publisher)' },
            },
          },
          upsert: true,
        },
      });
      counts[m.categoryName] = (counts[m.categoryName] || 0) + 1;
      // No break: a row may legitimately map to several categories
      // (e.g. freight factors apply to both upstream and downstream transport).
    }
  }

  if (ops.length === 0) throw new Error('No rows matched the curated mappings — check the file');
  const result = await EmissionFactor.bulkWrite(ops, { ordered: false });
  console.log(`Imported/updated ${ops.length} DEFRA 2024 factors`);
  console.log('By category: ' + JSON.stringify(counts));
  console.log(`upserted=${result.upsertedCount} modified=${result.modifiedCount} matched=${result.matchedCount}`);

  // Mobile Combustion now holds distance-based factors (kg CO2e/km), so the
  // calculator must offer 'km' (and 'miles'). Distance units carry NO
  // conversionToBase ON PURPOSE: the engine converts a distance input only
  // against a distance-denominated factor (the factor's own denominator path,
  // which runs first); a km/miles input against an L/gallon FUEL factor must
  // FAIL LOUD rather than be silently treated as a volume (failure mode #5).
  // (The seed previously gave km/miles conversionToBase 1 / 1.60934 — a latent
  // volume-vs-distance bug that was dormant until distance factors existed.)
  const mobile = await EmissionCategory.findOne({ category: 'Mobile Combustion' });
  if (mobile) {
    const units = (mobile.allowedUnits || []).map((u: any) => {
      const o: any = { unit: u.unit, description: u.description };
      if (u.unit !== 'km' && u.unit !== 'miles' && u.conversionToBase !== undefined) {
        o.conversionToBase = u.conversionToBase;
      }
      return o;
    });
    if (!units.some((u: any) => u.unit === 'km')) {
      units.push({ unit: 'km', description: 'Distance travelled (vehicle-km, distance-based method)' });
    }
    if (!units.some((u: any) => u.unit === 'miles')) {
      units.push({ unit: 'miles', description: 'Distance travelled (vehicle-miles)' });
    }
    mobile.allowedUnits = units as any;
    mobile.markModified('allowedUnits');
    await mobile.save();
    console.log('  ~ Mobile Combustion: distance units km/miles normalized (no conversionToBase)');
  }
  await mongoose.disconnect();
}

run().catch((e) => { console.error('Import failed:', e.message); process.exit(1); });
