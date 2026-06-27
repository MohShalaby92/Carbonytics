import crypto from 'crypto';
import { EmissionFactor } from '../models/EmissionFactor';
import { EmissionFactorVersion } from '../models/EmissionFactorVersion';
import { IEmissionFactorVersion } from '../types';
import { logger } from '../utils/logger';

/**
 * Factor version-history service (§3) — the single choke point that records an
 * immutable snapshot of an emission factor whenever its value-bearing content
 * changes. Used on factor create, on the versioned edit endpoint, and by the
 * backfill/import migration. Deduplicates by content hash so re-running an
 * idempotent import (or saving a factor with no real change) does NOT inflate
 * the version number.
 */

/** The value-bearing fields a recompute depends on, in a stable shape. */
export interface CanonicalFactor {
  name: string;
  factor: number;
  unit: string;
  co2: number;
  ch4: number;
  n2o: number;
  otherGhg: number;
  source: string;
  sourceUrl: string;
  sourceDocument: string;
  region: string;
  country: string;
  year: number;
  validFrom: string;
  validTo: string;
  license: string;
  qualityRating: string;
  uncertainty: number | null;
  organizationId: string;
  supplierId: string;
  supplierName: string;
  biogenic: boolean;
}

const num = (v: any, dflt = 0): number =>
  typeof v === 'number' && isFinite(v) ? v : dflt;
const str = (v: any): string => (v === undefined || v === null ? '' : String(v));
const dateStr = (v: any): string => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
};

/**
 * Project a (possibly lean) factor document onto the canonical value-bearing
 * fields. Volatile import bookkeeping in `metadata` is intentionally excluded —
 * only `metadata.biogenic` affects computation, so only it is hashed; a re-import
 * that merely refreshes column text won't churn the version.
 */
export function canonicalFactor(factor: any): CanonicalFactor {
  return {
    name: str(factor.name),
    factor: num(factor.factor),
    unit: str(factor.unit),
    co2: num(factor.co2),
    ch4: num(factor.ch4),
    n2o: num(factor.n2o),
    otherGhg: num(factor.otherGhg),
    source: str(factor.source),
    sourceUrl: str(factor.sourceUrl),
    sourceDocument: str(factor.sourceDocument),
    region: str(factor.region) || 'global',
    country: str(factor.country),
    year: num(factor.year),
    validFrom: dateStr(factor.validFrom),
    validTo: dateStr(factor.validTo),
    license: str(factor.license),
    qualityRating: str(factor.qualityRating),
    uncertainty: typeof factor.uncertainty === 'number' ? factor.uncertainty : null,
    organizationId: str(factor.organizationId),
    supplierId: str(factor.supplierId),
    supplierName: str(factor.supplierName),
    biogenic: factor.metadata?.biogenic === true,
  };
}

/** Stable sha256 over the canonical fields (key order is fixed by the literal). */
export function computeFactorHash(factor: any): string {
  const c = canonicalFactor(factor);
  const ordered = [
    c.name, c.factor, c.unit, c.co2, c.ch4, c.n2o, c.otherGhg,
    c.source, c.sourceUrl, c.sourceDocument, c.region, c.country, c.year,
    c.validFrom, c.validTo, c.license, c.qualityRating, c.uncertainty,
    c.organizationId, c.supplierId, c.supplierName, c.biogenic,
  ];
  return crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

/**
 * Best-effort license inference from a factor source string, for backfilling
 * the license field of existing library factors. Conservative: only well-known
 * public datasets get a license; everything else stays blank (never fabricated).
 */
export function licenseForSource(source?: string): string | undefined {
  const s = (source || '').toLowerCase();
  if (s.includes('defra') || s.includes('desnz') || s.includes('beis'))
    return 'Open Government Licence v3.0';
  if (s.includes('epa') || s.includes('egrid')) return 'US Government Work (public domain)';
  if (s.includes('ipcc') || s.includes('efdb')) return 'IPCC EFDB — see IPCC terms of use';
  if (s.includes('ghg protocol') || s.includes('ghgp')) return 'GHG Protocol — see ghgprotocol.org terms';
  if (s.includes('iea')) return 'IEA — licensed (redistribution restricted)';
  return undefined;
}

export interface RecordVersionResult {
  version: IEmissionFactorVersion;
  created: boolean; // false when the content matched the latest version (no-op)
}

/**
 * Record a new immutable version for a factor IF its content changed since the
 * latest recorded version. Also keeps `EmissionFactor.currentVersion` pointed at
 * the latest version number. Idempotent: calling it repeatedly with unchanged
 * content returns the existing latest version and writes nothing.
 *
 * `factor` may be a Mongoose doc or a lean object; it must carry `_id` (or `id`).
 */
export async function recordFactorVersion(
  factor: any,
  opts: { recordedBy: string; changeReason?: string }
): Promise<RecordVersionResult> {
  const factorId = factor._id || factor.id;
  if (!factorId) throw new Error('recordFactorVersion: factor has no _id');

  const hash = computeFactorHash(factor);
  const latest = await EmissionFactorVersion.findOne({ factorId })
    .sort({ version: -1 })
    .lean();

  if (latest && latest.contentHash === hash) {
    return { version: latest as unknown as IEmissionFactorVersion, created: false };
  }

  const nextVersion = (latest?.version || 0) + 1;
  const c = canonicalFactor(factor);
  let created: IEmissionFactorVersion;
  try {
    created = await EmissionFactorVersion.create({
      factorId,
      factorCode: factor.factorCode,
      version: nextVersion,
      name: c.name,
      factor: c.factor,
      unit: c.unit,
      co2: c.co2,
      ch4: c.ch4,
      n2o: c.n2o,
      otherGhg: c.otherGhg,
      source: c.source,
      sourceUrl: factor.sourceUrl,
      sourceDocument: factor.sourceDocument,
      region: c.region,
      country: factor.country,
      year: c.year,
      validFrom: factor.validFrom,
      validTo: factor.validTo,
      license: factor.license,
      qualityRating: factor.qualityRating,
      uncertainty: factor.uncertainty,
      metadata: factor.metadata || {},
      organizationId: factor.organizationId,
      supplierId: factor.supplierId,
      supplierName: factor.supplierName,
      contentHash: hash,
      recordedBy: opts.recordedBy,
      changeReason: opts.changeReason,
    });
  } catch (err: any) {
    // Unique (factorId, version) race: another writer just recorded this version.
    if (err?.code === 11000) {
      const raced = await EmissionFactorVersion.findOne({ factorId })
        .sort({ version: -1 })
        .lean();
      if (raced) return { version: raced as unknown as IEmissionFactorVersion, created: false };
    }
    throw err;
  }

  // Keep the live factor's convenience pointer in sync (best-effort).
  try {
    await EmissionFactor.updateOne({ _id: factorId }, { $set: { currentVersion: nextVersion } });
  } catch (e) {
    logger.warn(`recordFactorVersion: failed to bump currentVersion for ${factorId}`, e);
  }

  return { version: created, created: true };
}

/** Latest immutable version for a factor (null if none recorded yet). */
export async function getCurrentVersion(
  factorId: string
): Promise<IEmissionFactorVersion | null> {
  return EmissionFactorVersion.findOne({ factorId }).sort({ version: -1 }).lean() as any;
}

/** A specific recorded version of a factor. */
export async function getVersionByNumber(
  factorId: string,
  version: number
): Promise<IEmissionFactorVersion | null> {
  return EmissionFactorVersion.findOne({ factorId, version }).lean() as any;
}
