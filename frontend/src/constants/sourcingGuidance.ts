/**
 * Per-category data-sourcing guidance (§4.2 / §10): the "where does this data
 * live and what form should it be in" help shown inline in the calculator.
 *
 * This is METHODOLOGY guidance (GHG Protocol good practice) — it never contains
 * emission-factor values. It tells a preparer where to find the activity data,
 * the preferred form/units and the data-quality hierarchy, and the common
 * pitfalls (double-counting, period alignment, boundary errors) for the category.
 */

export interface SourcingGuidance {
  /** Where the activity data physically lives (systems / documents). */
  whereItLives: string;
  /** Preferred form/units and the primary→secondary data hierarchy. */
  preferredForm: string;
  /** Common mistakes to avoid for this category. */
  pitfalls: string;
  /** Optional Egypt-specific note. */
  egyptNote?: string;
}

/** Keyword-matched guidance entries (first match wins). */
const ENTRIES: { match: RegExp; guidance: SourcingGuidance }[] = [
  {
    match: /electric/i,
    guidance: {
      whereItLives:
        'Monthly utility invoices and meter readings from your electricity provider; for multi-site orgs, your energy-management or facilities system.',
      preferredForm:
        'Metered kWh for the reporting period (sum the monthly bills). Prefer actual meter reads over budget/estimated figures, and keep location-based (grid) separate from any supplier-specific contractual data for dual Scope 2 reporting.',
      pitfalls:
        'Don’t mix calendar and billing periods; don’t double-count on-site generation already in Scope 1; exclude electricity on-sold to tenants you don’t control.',
      egyptNote:
        'The Egyptian grid factor (EEHC / IEA) is the location-based default; a supplier-specific market rate only applies where a contractual instrument exists.',
    },
  },
  {
    match: /stationary|boiler|furnace/i,
    guidance: {
      whereItLives:
        'Fuel purchase invoices and delivery notes (diesel, natural gas, LPG), boiler/generator fuel logs, and natural-gas utility bills.',
      preferredForm:
        'Quantity of each fuel actually combusted in the period — litres, m³, kg or energy (mmBtu/GJ). Prefer metered/invoiced volumes; convert to energy only with the published heating value. Track each fuel separately.',
      pitfalls:
        'Use fuel burned, not purchased-and-stored; don’t convert volume↔energy with a guessed calorific value; keep biomass separate (its CO₂ is a biogenic memo, not in the scope total).',
    },
  },
  {
    match: /mobile|fleet|vehicle/i,
    guidance: {
      whereItLives:
        'Fuel cards and fuel-purchase records for owned/controlled vehicles, vehicle logs or telematics for distance, and the Fleet registry for per-vehicle factors.',
      preferredForm:
        'Fuel-based (litres of petrol/diesel) is the most accurate; distance-based (km by vehicle type) when fuel isn’t available. Pick the matching basis — a distance against a fuel factor will be rejected.',
      pitfalls:
        'Don’t include third-party logistics here (that’s Scope 3 transport); avoid double-counting reimbursed personal-car mileage already in commuting or business travel.',
    },
  },
  {
    match: /fugitive|refrigerant|f-gas/i,
    guidance: {
      whereItLives:
        'Refrigerant purchase/top-up invoices, maintenance and service records, the equipment inventory (nameplate charge) and F-gas logs.',
      preferredForm:
        'Mass of each refrigerant released — ideally via the material-balance method (purchases + Δinventory − charged into equipment − recovered). Identify the exact blend (e.g. R-410A) so the correct GWP is applied.',
      pitfalls:
        'Don’t count gas charged into new equipment as a leak; don’t treat recovered/reclaimed gas as emitted; match the blend precisely — refrigerant GWPs vary widely.',
    },
  },
  {
    match: /purchased goods|services|supply chain/i,
    guidance: {
      whereItLives:
        'Procurement/ERP spend by category, supplier invoices, and where available supplier-provided product carbon footprints (PCF / EPD).',
      preferredForm:
        'Supplier-specific (primary) data is best — kg CO₂e per unit purchased; otherwise activity data × an average factor; spend-based (currency) is the screening fallback. Move up the hierarchy for material categories.',
      pitfalls:
        'Spend-based rows can double-count fuel/electricity already in Scope 1/2 — strip those GL lines; deflate spend to the factor’s base year before applying a spend factor.',
    },
  },
  {
    match: /travel/i,
    guidance: {
      whereItLives:
        'Travel-management-company reports, the expense system, and airline/rail itineraries (distance, cabin class, round-trip).',
      preferredForm:
        'Distance by mode and class with a round-trip flag. Prefer actual itineraries over reimbursed-spend estimates. Air travel may include a radiative-forcing uplift per your stated policy.',
      pitfalls:
        'Don’t double-count personal-car mileage also claimed under commuting; be consistent about whether radiative forcing is included across years.',
    },
  },
  {
    match: /commut/i,
    guidance: {
      whereItLives:
        'A representative employee survey (mode, distance, days in office) plus HR headcount and location data.',
      preferredForm:
        'Distance by mode from the survey, scaled to working days; include home-working days as appropriate. Prefer a current survey over blanket assumptions.',
      pitfalls:
        'Don’t double-count mileage reimbursed as business travel; document the survey method and response rate for the auditor.',
    },
  },
  {
    match: /transport|distribution|freight|logistic/i,
    guidance: {
      whereItLives:
        'Freight / 3PL invoices and shipping records (weight, distance, mode) and your logistics platform.',
      preferredForm:
        'Tonne-kilometres by mode (road/rail/sea/air), or carrier fuel data where available. Prefer actual shipped weights and routed distances.',
      pitfalls:
        'Avoid overlap with your own Mobile Combustion; don’t mix great-circle and routed distances inconsistently across shipments.',
    },
  },
  {
    match: /waste/i,
    guidance: {
      whereItLives:
        'Waste-contractor manifests and invoices (tonnes by stream and disposal route) and facility waste logs.',
      preferredForm:
        'Mass by material and treatment route (landfill, recycling, incineration, composting). Prefer weighbridge/contractor tonnages over estimates.',
      pitfalls:
        'Match material × route to the right factor; don’t book avoided emissions from recycling as a reduction in the inventory.',
    },
  },
  {
    match: /steam|heat|cooling|district/i,
    guidance: {
      whereItLives:
        'District-energy / utility invoices and meters for purchased steam, hot water or chilled water.',
      preferredForm:
        'Metered energy delivered (kWh / GJ) for the period; use the supplier’s efficiency/factor where provided.',
      pitfalls:
        'Don’t double-count fuel you also burn on-site (Scope 1); keep location-based and supplier-specific figures separate.',
    },
  },
  {
    match: /fera|fuel.*energy|well-to-tank|t&d|transmission/i,
    guidance: {
      whereItLives:
        'Derived from the Scope 1 fuel and Scope 2 electricity quantities you already collected (well-to-tank + grid T&D losses).',
      preferredForm:
        'Apply WTT factors to your fuel/electricity activity and grid T&D-loss factors to purchased electricity — reuse the same activity data, don’t re-survey.',
      pitfalls:
        'Don’t re-count the combustion itself (that’s Scope 1/2); T&D losses apply only to delivered grid electricity.',
    },
  },
];

const GENERIC: SourcingGuidance = {
  whereItLives:
    'The primary records for this activity — invoices, meters, contractor reports, or your ERP/operational systems — for the exact reporting period.',
  preferredForm:
    'Measured activity data in the category’s base unit for the period. Prefer primary/supplier-specific data; fall back to averages only when necessary, and flag any gap-filled value as an estimate.',
  pitfalls:
    'Align the period exactly, avoid double-counting across scopes/categories, and keep the source document for the audit trail (attach it under Compliance → Evidence).',
};

/** Resolve the sourcing guidance for a category by its name. */
export function getSourcingGuidance(categoryName?: string): SourcingGuidance {
  if (!categoryName) return GENERIC;
  const hit = ENTRIES.find((e) => e.match.test(categoryName));
  return hit ? hit.guidance : GENERIC;
}
