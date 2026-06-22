/**
 * Shared calculation-entry builder. Turns a `calculationEngine.calculate`
 * result + a row's flags into the exact `Calculation.data[]` entry shape that
 * gets persisted — pinning the immutable factor version in force at save time.
 *
 * Extracted from the calculator's `saveCalculation` controller so the CSV/XLSX
 * importer produces BYTE-IDENTICAL entries (same provenance, same version pin,
 * same estimate handling). This is the guarantee behind "every imported data
 * point lands on the correct emission/calculation exactly as the calculator
 * would have produced it".
 */
import { getCurrentVersion } from './factorVersioning';
import { CalculationResult } from './calculationEngine';

export interface EntryFlags {
  categoryId: string;
  isEstimate?: boolean;
  estimationMethod?: string;
  notes?: string;
}

export async function buildEntryFromComputed(
  computed: CalculationResult,
  flags: EntryFlags
): Promise<Record<string, any>> {
  // Pin the immutable factor version (§3) so a locked inventory recomputes
  // deterministically even after the live factor changes.
  const pinnedVersion = computed.factor.id ? await getCurrentVersion(computed.factor.id) : null;

  // Gap-filled values stay distinguishable: estimates force quality low and the
  // worst PCAF score; the method used is stored verbatim.
  const isEstimate = flags.isEstimate === true;

  // Round-trip provenance: snapshot the method-specific activity inputs (carried
  // on the engine result's metadata) so an export of this entry re-imports to the
  // exact same number. Fugitive material-balance inputs are stored separately.
  const md: any = computed.calculation.metadata || {};
  const activityInput: Record<string, any> = {};
  if (md.fuelType) activityInput.fuelType = String(md.fuelType);
  if (md.vehicleType) activityInput.vehicleType = String(md.vehicleType);
  if (md.origin) activityInput.origin = String(md.origin);
  if (md.destination) activityInput.destination = String(md.destination);
  if (typeof md.distance === 'number') activityInput.distance = md.distance;
  if (md.travelMode) activityInput.travelMode = String(md.travelMode);
  if (md.travelClass) activityInput.travelClass = String(md.travelClass);
  if (md.roundTrip !== undefined) activityInput.roundTrip = !!md.roundTrip;
  if (md.currency) activityInput.currency = String(md.currency);

  return {
    categoryId: flags.categoryId,
    value: computed.calculation.value,
    unit: computed.calculation.unit,
    factor: computed.factor.value,
    emissions: computed.calculation.emissions,
    quality: isEstimate ? ('low' as const) : computed.quality?.rating,
    dqScore: isEstimate ? 5 : computed.quality?.dqScore,
    isEstimate,
    ...(isEstimate && flags.estimationMethod
      ? { estimationMethod: String(flags.estimationMethod) }
      : {}),
    // Provenance: enough to reconstruct how this number was produced.
    factorId: computed.factor.id,
    factorName: computed.factor.name,
    factorSource: computed.factor.source,
    factorYear: computed.factor.year,
    ...(pinnedVersion
      ? { factorVersion: pinnedVersion.version, factorVersionId: pinnedVersion._id }
      : {}),
    gwpSet: computed.provenance?.gwpSet,
    gwpApplied: computed.provenance?.gwpApplied,
    method: computed.calculation.metadata?.calculationMethod,
    // Supplier provenance (factor came from a specific supplier).
    ...(computed.factor.supplierId
      ? { supplierId: computed.factor.supplierId, supplierName: computed.factor.supplierName }
      : {}),
    // Scope 2 dual figures (purchased electricity only).
    scope2Location: computed.scope2Dual?.locationBased,
    scope2Market: computed.scope2Dual?.marketBased,
    scope2MarketMethod: computed.scope2Dual?.marketMethod,
    // Biogenic CO2 (biomass) — stored separately; never added to the scope total.
    ...(computed.biogenicCO2 ? { biogenicCO2: computed.biogenicCO2 } : {}),
    // Per-gas masses (kg) when the per-gas path ran.
    ...(computed.provenance?.gasBreakdown
      ? {
          gasBreakdown: {
            co2: computed.provenance.gasBreakdown.co2,
            ch4: computed.provenance.gasBreakdown.ch4,
            n2o: computed.provenance.gasBreakdown.n2o,
          },
        }
      : {}),
    // Fugitive material-balance provenance (component masses + released kg).
    ...(computed.materialBalance
      ? { materialBalance: { releasedKg: computed.materialBalance.releasedKg, ...computed.materialBalance.components } }
      : {}),
    // Method-specific activity inputs for a clean export → re-import round-trip.
    ...(Object.keys(activityInput).length ? { activityInput } : {}),
    notes: flags.notes,
  };
}
