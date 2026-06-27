import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { config } from '../config/config';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';

/**
 * Curated imports for the IPCC EFDB exports and the GHG Protocol
 * cross-sector tool workbook. Same policy as the DEFRA/EPA importers:
 * exact unit conversions only, idempotent upserts, non-destructive,
 * Egyptian factors remain the primary default.
 *
 *   node dist/scripts/importEfdbGhgp.js efdb <EFDB_output.xlsx> [sourceLabel]
 *   node dist/scripts/importEfdbGhgp.js ghgp <CrossSectorTools.xlsx>
 *
 * EFDB slice: IPCC 2006 *default* combustion factors (Unit kg/TJ, categories
 * 1A1/1A2/1A4) grouped per (category, fuel) with TRUE per-gas masses,
 * converted kg/TJ -> kg/kWh (1 TJ = 277,777.778 kWh, exact). Vintage is
 * recorded as 2006, so the engine's staleness warnings apply honestly.
 *
 * GHGP slices (values are CO2-only where the tool provides CO2-only — named
 * and flagged accordingly, never padded with invented CH4/N2O):
 *   - Mobile Combustion fuel use (kg CO2/L)
 *   - Stationary Combustion liquid fuels (kg CO2/litre)
 *   - Country grid electricity (tCO2/MWh == kg CO2/kWh, latest year per country)
 */

const TJ_TO_KWH = 277777.7778;
const AR6 = { ch4: 29.8, n2o: 273 };
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
const norm = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();

async function importEfdb(file: string, sourceLabel: string): Promise<void> {
  const wb = XLSX.readFile(file);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const H = rows[0].map(norm);
  const col = (re: RegExp) => H.findIndex((h) => re.test(h));
  const iCat = col(/^IPCC 2006/i), iGas = col(/^Gas$/i), iF96 = col(/^Fuel 1996/i), iF06 = col(/^Fuel 2006/i);
  const iRef = col(/^Technical Reference/i), iVal = col(/^Value$/i), iUnit = col(/^Unit$/i);

  const GAS: Record<string, 'co2' | 'ch4' | 'n2o'> = {
    'CARBON DIOXIDE': 'co2', 'METHANE': 'ch4', 'NITROUS OXIDE': 'n2o',
  };

  // (categoryLeaf|fuel) -> per-gas first-default values
  const groups = new Map<string, { catLabel: string; fuel: string; co2?: number; ch4?: number; n2o?: number }>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (norm(r[iUnit]).toUpperCase() !== 'KG/TJ') continue;
    const gas = GAS[norm(r[iGas]).toUpperCase()];
    if (!gas) continue;
    // IPCC 2006 notation is dotted ('1.A.1 - Energy Industries'); normalize
    // dots away so both 1996-style and 2006-style codes match.
    const cat = norm(r[iCat]).replace(/\./g, '');
    if (!/^1A[124]/.test(cat)) continue; // stationary-ish combustion only
    // Canonical guideline defaults: the Description text varies by gas, but
    // the Technical Reference consistently cites the 2006 IPCC Guidelines.
    if (!/2006 IPCC Guidelines/i.test(norm(r[iRef]))) continue;
    const fuel = norm(r[iF06]) || norm(r[iF96]);
    if (!fuel) continue;
    const value = parseFloat(String(r[iVal]));
    if (!isFinite(value) || value < 0) continue;

    const catLeaf = cat.split(' - ')[0].trim(); // e.g. 1A1
    const key = `${catLeaf}|${fuel}`;
    if (!groups.has(key)) groups.set(key, { catLabel: catLeaf, fuel });
    const g = groups.get(key)!;
    if (g[gas] === undefined) g[gas] = value; // first default wins
  }

  const category = await EmissionCategory.findOne({ category: 'Stationary Combustion' });
  if (!category) throw new Error('Stationary Combustion category missing');

  const ops: any[] = [];
  for (const g of groups.values()) {
    if (g.co2 === undefined) continue; // CO2 is mandatory for a usable factor
    const co2 = g.co2 / TJ_TO_KWH;
    const ch4 = (g.ch4 ?? 0) / TJ_TO_KWH;
    const n2o = (g.n2o ?? 0) / TJ_TO_KWH;
    const co2e = co2 + ch4 * AR6.ch4 + n2o * AR6.n2o;
    const code = `IPCCEFDB_${slug(sourceLabel)}__${slug(`${g.catLabel}_${g.fuel}`)}`;
    ops.push({
      updateOne: {
        filter: { factorCode: code },
        update: {
          $set: {
            categoryId: category._id,
            name: `IPCC 2006 defaults: ${g.fuel} — ${g.catLabel} (per kWh)`,
            factor: Math.round(co2e * 1e8) / 1e8,
            unit: 'kg CO2e/kWh',
            co2: Math.round(co2 * 1e10) / 1e10,
            ch4: Math.round(ch4 * 1e12) / 1e12,
            n2o: Math.round(n2o * 1e12) / 1e12,
            source: `IPCC EFDB (${sourceLabel})`,
            sourceDocument: 'IPCC Emission Factor Database export; kg/TJ defaults converted to kg/kWh (exact)',
            region: 'global',
            year: 2006,
            qualityRating: 'medium',
            isActive: true,
            isDefault: false,
            metadata: {
              ipccCategory: g.catLabel, perGas: true,
              gases: { co2: g.co2 !== undefined, ch4: g.ch4 !== undefined, n2o: g.n2o !== undefined },
              note: 'Engine applies org GWP set to per-gas values; vintage 2006 triggers honest staleness warnings',
            },
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length === 0) { console.log(`EFDB(${sourceLabel}): no matching default rows — nothing imported`); return; }
  const res = await EmissionFactor.bulkWrite(ops, { ordered: false });
  console.log(`EFDB(${sourceLabel}): ${ops.length} factors (upserted=${res.upsertedCount} modified=${res.modifiedCount})`);
}

async function importGhgp(file: string): Promise<void> {
  const wb = XLSX.readFile(file);
  const ops: any[] = [];
  const counts: Record<string, number> = {};
  const push = (catDoc: any, code: string, doc: any, bucket: string) => {
    ops.push({ updateOne: { filter: { factorCode: code }, update: { $set: { categoryId: catDoc._id, region: 'global', isActive: true, isDefault: false, ...doc } }, upsert: true } });
    counts[bucket] = (counts[bucket] || 0) + 1;
  };
  const [mobile, stationary, electricity] = await Promise.all([
    EmissionCategory.findOne({ category: 'Mobile Combustion' }),
    EmissionCategory.findOne({ category: 'Stationary Combustion' }),
    EmissionCategory.findOne({ category: 'Purchased Electricity' }),
  ]);
  if (!mobile || !stationary || !electricity) throw new Error('Target categories missing');

  // --- Mobile Combustion - Fuel Use: Region | Fuel | Fossil CO2 EF | Biogenic | EF Unit
  {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Mobile Combustion - Fuel Use'], { header: 1, defval: '' });
    let hr = -1;
    for (let i = 0; i < Math.min(rows.length, 8); i++) if (rows[i].some((c) => norm(c) === 'Fossil CO2 EF')) { hr = i; break; }
    if (hr >= 0) {
      const H = rows[hr].map(norm);
      const iR = H.indexOf('Region'), iF = H.indexOf('Fuel'), iV = H.indexOf('Fossil CO2 EF'), iU = H.indexOf('EF Unit');
      for (let i = hr + 1; i < rows.length; i++) {
        const fuel = norm(rows[i][iF]); const v = parseFloat(String(rows[i][iV]));
        if (!fuel || !isFinite(v) || v < 0) { if (/^Table/i.test(norm(rows[i][1]))) break; continue; }
        if (!/^kg\/L$/i.test(norm(rows[i][iU]))) continue;
        const region = norm(rows[i][iR]).replace(/\d+$/, '') || 'Global';
        push(mobile, `GHGP_MOBILE__${slug(`${region}_${fuel}`)}`, {
          name: `GHGP/IPCC: ${fuel} (${region}) CO2-only (per L)`,
          factor: Math.round(v * 1e6) / 1e6, unit: 'kg CO2e/L', co2: Math.round(v * 1e6) / 1e6,
          source: 'GHG Protocol cross-sector tool V2.0', year: 2024, qualityRating: 'medium',
          sourceDocument: 'Emission Factors for Cross-Sector Tools V2.0 (Mar 2024), Mobile Combustion - Fuel Use',
          metadata: { co2Only: true, note: 'Fossil CO2 only; CH4/N2O not provided by source (~1-2% of combustion CO2e)' },
        }, 'mobile-fuel');
      }
    }
  }

  // --- Stationary Combustion: liquid fuels with kg CO2/litre (column 7)
  {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Stationary Combustion'], { header: 1, defval: '' });
    for (let i = 5; i < rows.length; i++) {
      const rowText = rows[i].map(norm).join(' ');
      if (/^Table 2/i.test(norm(rows[i][0])) || /Table 2\./i.test(rowText)) break;
      const fuel = norm(rows[i][1]); const v = parseFloat(String(rows[i][7]));
      if (!fuel || !isFinite(v) || v <= 0) continue;
      push(stationary, `GHGP_STATIONARY__${slug(fuel)}`, {
        name: `GHGP/IPCC 2006: ${fuel} CO2-only (per L)`,
        factor: Math.round(v * 1e6) / 1e6, unit: 'kg CO2e/L', co2: Math.round(v * 1e6) / 1e6,
        source: 'GHG Protocol cross-sector tool V2.0', year: 2024, qualityRating: 'medium',
        sourceDocument: 'Emission Factors for Cross-Sector Tools V2.0 (Mar 2024), Stationary Combustion Table 1',
        metadata: { co2Only: true, note: 'CO2 only; CH4/N2O not provided in the per-litre table' },
      }, 'stationary-liquid');
    }
  }

  // --- Country grid electricity: tCO2/MWh == kg CO2/kWh (exact); latest year per country
  {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Electricity CN, TW, BR, TH, UK'], { header: 1, defval: '' });
    let country = ''; const latest = new Map<string, { year: number; v: number }>();
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].map(norm).join(' ');
      // Table titles vary ('Chinese Electricity…' vs 'Electricity Emission
      // Factors for …'), but the sheet name fixes the order: CN, TW, BR, TH, UK.
      const m = line.match(/Table (\d+)\./i);
      if (m) {
        const order = ['China', 'Taiwan', 'Brazil', 'Thailand', 'UK'];
        country = order[parseInt(m[1], 10) - 1] || '';
        continue;
      }
      if (!country) continue;
      // Table layouts drift between countries: find a year cell anywhere in
      // the first few columns, then the first positive number after it.
      let year = 0, v = NaN;
      for (let c = 0; c <= 4 && !year; c++) {
        const y = parseInt(norm(rows[i][c]), 10);
        if (y >= 2000 && y <= 2035 && String(y).length === 4) {
          year = y;
          for (let c2 = c + 1; c2 <= c + 3; c2++) {
            const cand = parseFloat(String(rows[i][c2]));
            if (isFinite(cand) && cand > 0 && cand < 5) { v = cand; break; }
          }
        }
      }
      if (year && isFinite(v)) {
        const cur = latest.get(country);
        if (!cur || year > cur.year) latest.set(country, { year, v });
      }
    }
    for (const [c, { year, v }] of latest) {
      push(electricity, `GHGP_GRID__${slug(c)}`, {
        name: `GHGP: ${c} grid electricity ${year} CO2-only (per kWh)`,
        factor: Math.round(v * 1e6) / 1e6, unit: 'kg CO2e/kWh', co2: Math.round(v * 1e6) / 1e6,
        source: 'GHG Protocol cross-sector tool V2.0', year, qualityRating: 'medium',
        sourceDocument: 'Emission Factors for Cross-Sector Tools V2.0 (Mar 2024), national grid tables (tCO2/MWh)',
        metadata: { co2Only: true, country: c },
      }, 'grid');
    }
  }

  if (ops.length === 0) throw new Error('GHGP: nothing parsed — check workbook layout');
  const res = await EmissionFactor.bulkWrite(ops, { ordered: false });
  console.log(`GHGP cross-sector: ${ops.length} factors ${JSON.stringify(counts)} (upserted=${res.upsertedCount} modified=${res.modifiedCount})`);
}

async function run(): Promise<void> {
  const [mode, file, label] = process.argv.slice(2);
  if (!mode || !file) {
    console.error('Usage: node dist/scripts/importEfdbGhgp.js <efdb|ghgp> <file.xlsx> [sourceLabel]');
    process.exit(1);
  }
  await mongoose.connect(config.MONGODB_URI);
  if (mode === 'efdb') await importEfdb(file, label || 'Global');
  else if (mode === 'ghgp') await importGhgp(file);
  else throw new Error(`Unknown mode: ${mode}`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error('Import failed:', e.message); process.exit(1); });
