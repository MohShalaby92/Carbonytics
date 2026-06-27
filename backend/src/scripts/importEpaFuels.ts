import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { config } from '../config/config';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';

/**
 * Import EPA GHG Emission Factors Hub (2025) fuel/electricity tables that were
 * blocked on imperial / energy-basis unit handling (gap analysis §2.1/§2.2):
 *
 *   - Table 1 Stationary Combustion — TRUE per-gas masses on BOTH bases:
 *       per mmBtu (HHV energy basis) and per physical unit (short ton | scf |
 *       gallon, by fuel group). Both stored; the engine's factor-denominator
 *       conversion lets users enter energy (mmBtu/kWh/GJ/therm) or physical
 *       (short ton/kg/t, gallon/L, scf/m³) data.
 *   - Table 7 Steam & Heat — per mmBtu, per-gas → Purchased Heat + Steam.
 *   - Table 6 Electricity (eGRID) — total-output per-gas, lb/MWh → kg/kWh,
 *       US subregions → Purchased Electricity (Egyptian grid stays the default).
 *   - Table 2 Mobile Combustion CO2 — CO2-only per gallon/scf → Mobile
 *       Combustion (CH4/N2O depend on vehicle/model year, EPA Tables 3-5, and
 *       are NOT invented here).
 *
 * Per-gas masses go in co2/ch4/n2o (CH4/N2O grams → kg); the engine applies the
 * organization's GWP set at runtime. The `factor` field is an AR6 display CO2e.
 * Biomass fuels are flagged biogenic (metadata + name); the calculation engine
 * reads the flag to split biogenic CO2 out of the scope total into a separate
 * memo item (§35, failure mode #7 closed) — biomass CH4/N2O stay in Scope 1.
 *
 * Also (idempotently) widens the relevant categories' allowedUnits so the
 * calculator offers the imperial/energy entry units.
 *
 * Idempotent (upsert by EPA25F_* factorCode) and non-destructive: never touches
 * Egyptian factors, org customs, baselines, DEFRA/EFDB/GHGP imports or Table 10.
 *
 * Usage: node dist/scripts/importEpaFuels.js <path-to-epa-hub.xlsx>
 */

const AR6 = { ch4: 29.8, n2o: 273 }; // display CO2e only; runtime recomputes per org GWP set
const LB_KG = 0.45359237; // pounds → kilograms (eGRID lb/MWh → kg/MWh)

const slug = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const num = (v: any) => parseFloat(String(v).replace(/,/g, ''));
const isNum = (v: any) => isFinite(num(v));
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
const r10 = (x: number) => Math.round(x * 1e10) / 1e10;
const co2e = (co2: number, ch4: number, n2o: number) =>
  Math.round((co2 + ch4 * AR6.ch4 + n2o * AR6.n2o) * 1e6) / 1e6;

interface FactorDoc {
  factorCode: string;
  categoryId: any;
  name: string;
  factor: number;
  unit: string;
  co2: number;
  ch4: number;
  n2o: number;
  source: string;
  sourceDocument: string;
  region: string;
  country: string;
  year: number;
  qualityRating: string;
  isActive: boolean;
  isDefault: boolean;
  metadata: any;
}

function pushFactor(ops: any[], f: FactorDoc): void {
  ops.push({
    updateOne: {
      filter: { factorCode: f.factorCode },
      update: { $set: f },
      upsert: true,
    },
  });
}

/** Widen a category's allowedUnits with any of the given units it is missing. */
async function ensureAllowedUnits(
  categoryName: string,
  units: Array<{ unit: string; description: string }>
): Promise<void> {
  const cat: any = await EmissionCategory.findOne({ category: categoryName });
  if (!cat) {
    console.warn(`  ! category not found for allowedUnits: ${categoryName}`);
    return;
  }
  const have = new Set((cat.allowedUnits || []).map((u: any) => u.unit));
  const toAdd = units
    .filter((u) => !have.has(u.unit))
    .map((u) => ({ unit: u.unit, description: u.description, conversionToBase: 1 }));
  if (toAdd.length === 0) return;
  cat.allowedUnits = [...(cat.allowedUnits || []), ...toAdd];
  await cat.save();
  console.log(`  + ${categoryName}: added units ${toAdd.map((u) => u.unit).join(', ')}`);
}

function tableBounds(rows: any[][]): Record<number, [number, number]> {
  const starts: Array<[number, number]> = [];
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].map((c) => String(c).trim()).filter(Boolean).join(' ');
    const m = j.match(/^Table\s+(\d+)/i);
    if (m) starts.push([parseInt(m[1], 10), i]);
  }
  const bounds: Record<number, [number, number]> = {};
  for (let k = 0; k < starts.length; k++) {
    const [tbl, start] = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1][1] : rows.length;
    bounds[tbl] = [start, end];
  }
  return bounds;
}

async function run(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node dist/scripts/importEpaFuels.js <epa-hub.xlsx>');
    process.exit(1);
  }

  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const wb = XLSX.readFile(file);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const bounds = tableBounds(rows);

  console.log('Ensuring imperial/energy entry units on categories...');
  await ensureAllowedUnits('Stationary Combustion', [
    { unit: 'mmBtu', description: 'Million BTU (energy, HHV)' },
    { unit: 'GJ', description: 'Gigajoules (energy)' },
    { unit: 'therm', description: 'Therms (energy)' },
    { unit: 'short ton', description: 'US short ton (2000 lb)' },
    { unit: 'gallon', description: 'US gallon' },
    { unit: 'scf', description: 'Standard cubic feet' },
  ]);
  await ensureAllowedUnits('Mobile Combustion', [
    { unit: 'gallon', description: 'US gallon' },
    { unit: 'scf', description: 'Standard cubic feet' },
  ]);
  await ensureAllowedUnits('Purchased Heat', [
    { unit: 'mmBtu', description: 'Million BTU (energy, HHV)' },
    { unit: 'GJ', description: 'Gigajoules (energy)' },
  ]);
  await ensureAllowedUnits('Purchased Steam', [
    { unit: 'mmBtu', description: 'Million BTU (energy, HHV)' },
  ]);

  const [stationary, mobile, heat, steam, electricity] = await Promise.all([
    EmissionCategory.findOne({ category: 'Stationary Combustion' }),
    EmissionCategory.findOne({ category: 'Mobile Combustion' }),
    EmissionCategory.findOne({ category: 'Purchased Heat' }),
    EmissionCategory.findOne({ category: 'Purchased Steam' }),
    EmissionCategory.findOne({ category: 'Purchased Electricity' }),
  ]);

  const ops: any[] = [];
  const counts = { t1mmbtu: 0, t1phys: 0, t7: 0, t6: 0, t2: 0 };

  // ---- Table 1: Stationary Combustion (cols 2..9) ----
  if (stationary && bounds[1]) {
    const [s, e] = bounds[1];
    let phys: string | null = null; // current physical unit (short ton | scf | gallon)
    let group = ''; // current fuel-group sub-header
    for (let i = s; i < e; i++) {
      const r = rows[i];
      const c2 = String(r[2] || '').trim();
      const heatHdr = String(r[3] || '').trim();
      const unitMatch = heatHdr.match(/mmBtu per\s+(.+)$/i);
      if (unitMatch) {
        phys = unitMatch[1].trim().toLowerCase();
        continue; // unit sub-header row
      }
      if (!c2) continue;
      if (c2 === 'Fuel Type') continue; // text header
      if (!isNum(r[4])) {
        group = c2; // fuel-group sub-header (Coal and Coke, Natural Gas, Biomass Fuels - ...)
        continue;
      }
      const biogenic = /biomass/i.test(group);
      const fuel = c2.replace(/\s+/g, ' ').trim();
      const bioTag = biogenic ? ' (biomass — biogenic CO2)' : '';

      // Per-mmBtu (HHV energy basis) — always present.
      const co2m = num(r[4]);
      const ch4m = isNum(r[5]) ? num(r[5]) / 1000 : 0; // g → kg
      const n2om = isNum(r[6]) ? num(r[6]) / 1000 : 0;
      const heatContent = isNum(r[3]) ? num(r[3]) : undefined; // mmBtu per physical unit
      pushFactor(ops, {
        factorCode: `EPA25F_STAT_${slug(fuel)}_MMBTU`,
        categoryId: stationary._id,
        name: `EPA 2025 (US): ${fuel} (per mmBtu, HHV)${bioTag}`,
        factor: co2e(co2m, ch4m, n2om),
        unit: 'kg CO2e/mmBtu',
        co2: r8(co2m),
        ch4: r10(ch4m),
        n2o: r10(n2om),
        source: 'EPA GHG Emission Factors Hub 2025',
        sourceDocument: 'EPA Hub 2025, Table 1 Stationary Combustion (per-gas, HHV energy basis)',
        region: 'global',
        country: 'US',
        year: 2025,
        qualityRating: 'high',
        isActive: true,
        isDefault: false,
        metadata: { epaTable: 1, perGas: true, basis: 'mmBtu', biogenic, heatContentMmbtuPerUnit: heatContent, note: 'Engine applies org GWP set to per-gas values; factor field is AR6 display CO2e' },
      });
      counts.t1mmbtu++;

      // Per physical unit (short ton | scf | gallon) — when the columns are present.
      if (phys && isNum(r[7])) {
        const co2p = num(r[7]);
        const ch4p = isNum(r[8]) ? num(r[8]) / 1000 : 0;
        const n2op = isNum(r[9]) ? num(r[9]) / 1000 : 0;
        pushFactor(ops, {
          factorCode: `EPA25F_STAT_${slug(fuel)}_${slug(phys)}`,
          categoryId: stationary._id,
          name: `EPA 2025 (US): ${fuel} (per ${phys})${bioTag}`,
          factor: co2e(co2p, ch4p, n2op),
          unit: `kg CO2e/${phys}`,
          co2: r8(co2p),
          ch4: r10(ch4p),
          n2o: r10(n2op),
          source: 'EPA GHG Emission Factors Hub 2025',
          sourceDocument: 'EPA Hub 2025, Table 1 Stationary Combustion (per-gas, physical basis)',
          region: 'global',
          country: 'US',
          year: 2025,
          qualityRating: 'high',
          isActive: true,
          isDefault: false,
          metadata: { epaTable: 1, perGas: true, basis: phys, biogenic, heatContentMmbtuPerUnit: heatContent, note: 'Per-gas physical-unit factor; engine applies org GWP set' },
        });
        counts.t1phys++;
      }
    }
  }

  // ---- Table 7: Steam and Heat (per mmBtu) → Purchased Heat + Purchased Steam ----
  if (bounds[7]) {
    const [s, e] = bounds[7];
    for (let i = s; i < e; i++) {
      const r = rows[i];
      if (String(r[2] || '').trim() !== 'Steam and Heat' || !isNum(r[3])) continue;
      const co2 = num(r[3]);
      const ch4 = isNum(r[4]) ? num(r[4]) / 1000 : 0;
      const n2o = isNum(r[5]) ? num(r[5]) / 1000 : 0;
      for (const cat of [heat, steam]) {
        if (!cat) continue;
        pushFactor(ops, {
          factorCode: `EPA25F_STEAMHEAT_${slug((cat as any).category)}_MMBTU`,
          categoryId: (cat as any)._id,
          name: 'EPA 2025 (US): Purchased Steam & Heat (per mmBtu)',
          factor: co2e(co2, ch4, n2o),
          unit: 'kg CO2e/mmBtu',
          co2: r8(co2),
          ch4: r10(ch4),
          n2o: r10(n2o),
          source: 'EPA GHG Emission Factors Hub 2025',
          sourceDocument: 'EPA Hub 2025, Table 7 Steam and Heat (per-gas; assumes natural gas at 80% thermal efficiency)',
          region: 'global',
          country: 'US',
          year: 2025,
          qualityRating: 'high',
          isActive: true,
          isDefault: false,
          metadata: { epaTable: 7, perGas: true, basis: 'mmBtu', note: 'Per mmBtu of steam/heat purchased (NG at 80% efficiency)' },
        });
        counts.t7++;
      }
      break;
    }
  }

  // ---- Table 6: Electricity (eGRID) total-output, lb/MWh → kg/kWh ----
  if (electricity && bounds[6]) {
    const [s, e] = bounds[6];
    for (let i = s; i < e; i++) {
      const r = rows[i];
      const acro = String(r[2] || '').trim();
      const name = String(r[3] || '').trim();
      if (!acro || !name || !isNum(r[4])) continue;
      if (/acronym/i.test(acro)) continue; // header
      const co2 = num(r[4]) * LB_KG / 1000; // lb/MWh → kg/kWh
      const ch4 = (isNum(r[5]) ? num(r[5]) : 0) * LB_KG / 1000;
      const n2o = (isNum(r[6]) ? num(r[6]) : 0) * LB_KG / 1000;
      const loss = isNum(r[10]) ? num(r[10]) : undefined;
      pushFactor(ops, {
        factorCode: `EPA25F_EGRID_${slug(acro)}`,
        categoryId: electricity._id,
        name: `EPA eGRID 2025 (US): ${name} (${acro}) electricity`,
        factor: co2e(co2, ch4, n2o),
        unit: 'kg CO2e/kWh',
        co2: r8(co2),
        ch4: r10(ch4),
        n2o: r10(n2o),
        source: 'EPA GHG Emission Factors Hub 2025 (eGRID)',
        sourceDocument: 'EPA Hub 2025, Table 6 Electricity — eGRID total output factors (lb/MWh → kg/kWh)',
        region: 'global',
        country: 'US',
        year: 2025,
        qualityRating: 'high',
        isActive: true,
        isDefault: false,
        metadata: { epaTable: 6, perGas: true, basis: 'kWh', egridSubregion: acro, gridGrossLossPercent: loss, note: 'Total output emission factors; Egyptian grid remains the platform default' },
      });
      counts.t6++;
    }
  }

  // ---- Table 2: Mobile Combustion CO2 (CO2-only) per gallon/scf ----
  if (mobile && bounds[2]) {
    const [s, e] = bounds[2];
    for (let i = s; i < e; i++) {
      const r = rows[i];
      const fuel = String(r[2] || '').trim();
      const unit = String(r[4] || '').trim().toLowerCase();
      if (!fuel || fuel === 'Fuel Type' || !isNum(r[3]) || !unit) continue;
      const co2 = num(r[3]);
      pushFactor(ops, {
        factorCode: `EPA25F_MOBCO2_${slug(fuel)}`,
        categoryId: mobile._id,
        name: `EPA 2025 (US): ${fuel} (mobile, CO2-only, per ${unit})`,
        factor: co2e(co2, 0, 0),
        unit: `kg CO2e/${unit}`,
        co2: r8(co2),
        ch4: 0,
        n2o: 0,
        source: 'EPA GHG Emission Factors Hub 2025',
        sourceDocument: 'EPA Hub 2025, Table 2 Mobile Combustion CO2 (CO2-only)',
        region: 'global',
        country: 'US',
        year: 2025,
        qualityRating: 'medium',
        isActive: true,
        isDefault: false,
        metadata: { epaTable: 2, perGas: true, co2Only: true, basis: unit, note: 'CO2-only; CH4/N2O depend on vehicle type and model year (EPA Tables 3-5) and are not included' },
      });
      counts.t2++;
    }
  }

  if (ops.length === 0) throw new Error('No EPA fuel rows parsed — check the workbook layout');
  const result = await EmissionFactor.bulkWrite(ops, { ordered: false });
  console.log('EPA fuel tables imported:');
  console.log(`  Table 1 Stationary: ${counts.t1mmbtu} per-mmBtu + ${counts.t1phys} per-physical`);
  console.log(`  Table 7 Steam/Heat: ${counts.t7} (Heat + Steam)`);
  console.log(`  Table 6 eGRID:      ${counts.t6} US subregions`);
  console.log(`  Table 2 Mobile CO2: ${counts.t2} (CO2-only)`);
  console.log(`  total upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Import failed:', e.message);
  process.exit(1);
});
