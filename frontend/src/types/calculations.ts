export interface CalculationEntry {
    id?: string;
    categoryId: string;
    value: number;
    unit: string;
    factor: number;
    emissions: number;
    notes?: string;
    timestamp?: string;
    metadata?: Record<string, any>;
  }
  
  export interface CalculationSession {
    id?: string;
    title: string;
    description?: string;
    period: {
      start: string;
      end: string;
    };
    calculations: CalculationEntry[];
    emissions: {
      scope1: number;
      scope2: number;
      scope3: number;
      total: number;
    };
    status: 'draft' | 'completed' | 'verified';
    createdAt?: string;
    updatedAt?: string;
  }
  
  export interface CalculationResult {
    calculation: CalculationEntry;
    factor: {
      id: string;
      name: string;
      value: number;
      unit: string;
      source: string;
      year: number;
      region: string;
      uncertainty?: number;
    };
    category: {
      id: string;
      name: string;
      scope: number;
    };
    // Data-quality assessment from the calculation engine.
    quality?: {
      rating: 'high' | 'medium' | 'low';
      dqScore?: number; // PCAF-style 1 (best) … 5 (worst)
      confidence?: number;
      notes?: string[];
    };
    // Methodology provenance: which GWP set was in force and whether GWPs were
    // applied per gas or already embedded in a CO2e-denominated factor.
    provenance?: {
      gwpSet?: string;
      gwpApplied?: 'per-gas' | 'embedded';
      // Per-gas masses (kg) + CO2e when computed via the per-gas path.
      gasBreakdown?: { co2: number; ch4: number; n2o: number; co2e: number; biogenicCO2?: number };
    };
    // Scope 2 dual reporting (purchased electricity): both figures per the
    // GHG Protocol Scope 2 Guidance.
    scope2Dual?: {
      locationBased: number;
      marketBased: number;
      marketMethod: string;
    };
    // Biogenic CO2 (kg) from biomass combustion — memo item, EXCLUDED from
    // calculation.emissions (the scope total) per the GHG Protocol.
    biogenicCO2?: number;
  }
  