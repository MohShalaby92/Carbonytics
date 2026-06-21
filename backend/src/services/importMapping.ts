/**
 * Import/Export column model — the SINGLE SOURCE OF TRUTH shared by the branded
 * template generator, the import pipeline (header mapping + row → engine input)
 * and the round-trip export. Pure (no DB / IO) so it is unit-testable.
 *
 * The columns mirror exactly what the calculator + `calculationEngine.calculate`
 * accept per activity line, so anything a user can compute in the UI they can
 * also import — and the export of a stored entry re-imports cleanly.
 */

export type ColumnGroup = 'required' | 'context' | 'factor' | 'quality' | 'method';

export interface ImportColumn {
  /** Canonical key used throughout the pipeline. */
  key: string;
  /** Friendly header shown in the template's Activity Data sheet. */
  header: string;
  /** Extra headers the importer also accepts (machine keys / synonyms). */
  aliases?: string[];
  group: ColumnGroup;
  width: number;
  /** Name of a validation list (see VALIDATION_LISTS or the dynamic ranges). */
  list?: string;
  /** Cell comment / inline guidance shown in the template. */
  note?: string;
}

/** Columns a user fills in. Order here is the column order in the template. */
export const IMPORT_COLUMNS: ImportColumn[] = [
  // ---- Required ----
  { key: 'category', header: 'Category', aliases: ['emission category', 'category name'], group: 'required', width: 30, list: 'Categories',
    note: 'Required. Pick from the dropdown (see the Categories sheet). Determines the scope and calculation method.' },
  { key: 'value', header: 'Value', aliases: ['amount', 'quantity', 'activity'], group: 'required', width: 14,
    note: 'Required. The activity quantity as a positive number (for Fugitive material balance you may leave this 0 — it is derived from the MB columns).' },
  { key: 'unit', header: 'Unit', aliases: ['units', 'uom'], group: 'required', width: 14, list: 'Units',
    note: 'Required. Unit of the value. Must be convertible to the factor (see the Units sheet) or the row fails loudly.' },
  { key: 'periodStart', header: 'Period Start', aliases: ['period_start', 'start', 'start date', 'from'], group: 'required', width: 15,
    note: 'Required. YYYY-MM-DD. Drives the reporting-year inventory.' },
  { key: 'periodEnd', header: 'Period End', aliases: ['period_end', 'end', 'end date', 'to'], group: 'required', width: 15,
    note: 'Required. YYYY-MM-DD. Must be after Period Start.' },

  // ---- Grouping / context ----
  { key: 'title', header: 'Title (groups rows)', aliases: ['group', 'batch', 'name'], group: 'context', width: 26,
    note: 'Optional. Rows that share a Title + period + facility merge into ONE calculation. Leave blank to keep this row on its own.' },
  { key: 'facility', header: 'Facility', aliases: ['site', 'entity'], group: 'context', width: 22, list: 'Facilities',
    note: 'Optional. Pick a facility / entity from the dropdown (see the Categories sheet legend).' },
  { key: 'notes', header: 'Notes', aliases: ['note', 'comment', 'description'], group: 'context', width: 30,
    note: 'Optional free text stored on the entry.' },

  // ---- Factor control ----
  { key: 'factorCode', header: 'Factor Code', aliases: ['factor_code', 'factor'], group: 'factor', width: 32,
    note: 'Optional. Copy a code from the Factor Library sheet to pin a specific factor. Leave blank to use the Egyptian-default factor.' },

  // ---- Quality ----
  { key: 'isEstimate', header: 'Is Estimate', aliases: ['estimate', 'estimated', 'is_estimate'], group: 'quality', width: 12, list: 'YesNo',
    note: 'Yes if this is a gap-filling estimate — it is flagged distinctly (quality low, DQ 5).' },
  { key: 'estimationMethod', header: 'Estimation Method', aliases: ['estimation_method', 'estimate method'], group: 'quality', width: 26,
    note: 'How the estimate was derived (recommended when Is Estimate = Yes).' },

  // ---- Method-specific (fill only when relevant to the category) ----
  { key: 'fuelType', header: 'Fuel Type', aliases: ['fuel_type', 'fuel'], group: 'method', width: 18,
    note: 'Combustion only — narrows factor selection (e.g. Diesel, Natural Gas).' },
  { key: 'vehicleType', header: 'Vehicle Type', aliases: ['vehicle_type', 'vehicle'], group: 'method', width: 18,
    note: 'Mobile only — narrows factor selection.' },
  { key: 'origin', header: 'Origin', aliases: ['from airport'], group: 'method', width: 14,
    note: 'Business Travel only — IATA code or city (used for flight distance lookup).' },
  { key: 'destination', header: 'Destination', aliases: ['to airport'], group: 'method', width: 14,
    note: 'Business Travel only.' },
  { key: 'distance', header: 'Distance (km)', aliases: ['distance_km', 'km'], group: 'method', width: 14,
    note: 'Business Travel only — distance in km (used when no route lookup is available).' },
  { key: 'travelMode', header: 'Travel Mode', aliases: ['travel_mode', 'mode'], group: 'method', width: 14, list: 'TravelModes',
    note: 'Business Travel only.' },
  { key: 'travelClass', header: 'Travel Class', aliases: ['travel_class', 'class', 'cabin'], group: 'method', width: 14, list: 'TravelClasses',
    note: 'Flights only — Business/First apply an uplift.' },
  { key: 'roundTrip', header: 'Round Trip', aliases: ['round_trip'], group: 'method', width: 12, list: 'YesNo',
    note: 'Business Travel only — doubles the distance.' },
  { key: 'currency', header: 'Currency', aliases: ['ccy'], group: 'method', width: 12, list: 'Currencies',
    note: 'Spend-based categories only — converts to EGP if not already EGP.' },
  { key: 'mbPurchases', header: 'MB Purchased (kg)', aliases: ['mb_purchases', 'refrigerant purchased'], group: 'method', width: 17,
    note: 'Fugitive material balance — refrigerant purchased / added during the period (kg).' },
  { key: 'mbInventoryStart', header: 'MB Inventory Start (kg)', aliases: ['mb_inventory_start'], group: 'method', width: 19,
    note: 'Fugitive material balance — inventory in storage at period start (kg).' },
  { key: 'mbInventoryEnd', header: 'MB Inventory End (kg)', aliases: ['mb_inventory_end'], group: 'method', width: 19,
    note: 'Fugitive material balance — inventory in storage at period end (kg).' },
  { key: 'mbCharged', header: 'MB Charged Into Equipment (kg)', aliases: ['mb_charged', 'charged into equipment'], group: 'method', width: 24,
    note: 'Fugitive material balance — charged into new equipment, not a leak (kg).' },
  { key: 'mbRecovered', header: 'MB Recovered (kg)', aliases: ['mb_recovered', 'recovered'], group: 'method', width: 18,
    note: 'Fugitive material balance — recovered / recycled / destroyed (kg).' },
];

export const REQUIRED_KEYS = ['category', 'value', 'unit', 'periodStart', 'periodEnd'];

/** Short fixed validation lists rendered inline in the template. */
export const VALIDATION_LISTS: Record<string, string[]> = {
  YesNo: ['Yes', 'No'],
  TravelModes: ['Flight', 'Car', 'Rail', 'Bus', 'Taxi', 'Ferry'],
  TravelClasses: ['Economy', 'Business', 'First'],
  Currencies: ['EGP', 'USD', 'EUR', 'GBP'],
};

/** Group → header fill colour (argb) for the template's banded headers. */
export const GROUP_FILL: Record<ColumnGroup, string> = {
  required: 'FF1F945E', // brand green — must fill
  context: 'FF4E5D70', // slate
  factor: 'FF2F6F8F', // teal-blue
  quality: 'FF9A6A1F', // amber
  method: 'FF6B7280', // grey — fill only if relevant
};

/** Normalize a header for tolerant matching: lowercase, drop non-alphanumerics. */
export function normalizeHeader(h: any): string {
  return String(h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Precomputed normalized header → canonical key (header + every alias).
const KEY_BY_NORMALIZED: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of IMPORT_COLUMNS) {
    m.set(normalizeHeader(c.header), c.key);
    m.set(normalizeHeader(c.key), c.key);
    for (const a of c.aliases || []) m.set(normalizeHeader(a), c.key);
  }
  return m;
})();

/** Resolve one header cell to a canonical key (or null if unrecognized). */
export function resolveHeaderKey(header: any): string | null {
  return KEY_BY_NORMALIZED.get(normalizeHeader(header)) ?? null;
}

/**
 * Map a raw row (header → cell string) to canonical keys. Unknown headers are
 * ignored; recognized output-only export columns simply don't map to an input.
 */
export function mapRowToCanonical(row: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [header, val] of Object.entries(row)) {
    const key = resolveHeaderKey(header);
    if (!key) continue;
    const s = val == null ? '' : String(val).trim();
    if (s !== '') out[key] = s;
  }
  return out;
}

/** "Scope 2 — Purchased Electricity" → "Purchased Electricity". */
export function stripScopePrefix(name: string): string {
  return String(name ?? '').replace(/^\s*scope\s*\d+\s*[-—–:]\s*/i, '').trim();
}

export function parseBoolean(v: any): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

export function parseNumberOrUndefined(v: any): number | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : undefined;
}

/**
 * Build the metadata object the engine consumes from a canonicalized row.
 * Only includes keys that are present, and only assembles `materialBalance`
 * when at least one MB component is given (and the category is Fugitive — the
 * engine guards on that anyway).
 */
export function buildMetadataFromRow(c: Record<string, string>): Record<string, any> {
  const md: Record<string, any> = {};
  if (c.fuelType) md.fuelType = c.fuelType;
  if (c.vehicleType) md.vehicleType = c.vehicleType;
  if (c.origin) md.origin = c.origin;
  if (c.destination) md.destination = c.destination;
  const dist = parseNumberOrUndefined(c.distance);
  if (dist !== undefined) md.distance = dist;
  if (c.travelMode) md.travelMode = c.travelMode;
  if (c.travelClass) md.travelClass = c.travelClass;
  if (c.roundTrip) md.roundTrip = parseBoolean(c.roundTrip);
  if (c.currency) md.currency = c.currency;

  const mb = {
    purchases: parseNumberOrUndefined(c.mbPurchases),
    inventoryStart: parseNumberOrUndefined(c.mbInventoryStart),
    inventoryEnd: parseNumberOrUndefined(c.mbInventoryEnd),
    chargedIntoEquipment: parseNumberOrUndefined(c.mbCharged),
    recovered: parseNumberOrUndefined(c.mbRecovered),
  };
  if (Object.values(mb).some((v) => v !== undefined)) {
    md.materialBalance = {
      purchases: mb.purchases ?? 0,
      inventoryStart: mb.inventoryStart ?? 0,
      inventoryEnd: mb.inventoryEnd ?? 0,
      chargedIntoEquipment: mb.chargedIntoEquipment ?? 0,
      recovered: mb.recovered ?? 0,
    };
  }
  return md;
}

/**
 * Grouping key per the product decision: rows sharing (Title + period +
 * facility) merge into one multi-entry Calculation; a blank Title makes the row
 * its own group (keyed by row index so it never merges with anything else).
 */
export function groupKey(
  c: Record<string, string>,
  rowIndex: number,
  facilityId?: string
): string {
  const title = (c.title || '').trim();
  if (!title) return `__row_${rowIndex}`;
  return [title.toLowerCase(), c.periodStart || '', c.periodEnd || '', facilityId || ''].join('|');
}

/**
 * Duplicate-detection key: an entry is a likely duplicate of existing data when
 * it shares category + period + facility + value (value rounded to 4dp). Used to
 * FLAG rows in the preview — never to silently drop them.
 */
export function duplicateKey(parts: {
  categoryId: string;
  periodStart: string;
  periodEnd: string;
  facilityId?: string;
  value: number;
}): string {
  return [
    String(parts.categoryId),
    String(parts.periodStart || '').slice(0, 10),
    String(parts.periodEnd || '').slice(0, 10),
    parts.facilityId || '',
    Math.round((parts.value || 0) * 10000) / 10000,
  ].join('|');
}
