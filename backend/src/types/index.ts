import mongoose from 'mongoose';
import { Request } from 'express';
import { Document, Types } from 'mongoose';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  organizationId: Types.ObjectId;
  role: 'admin' | 'manager' | 'user' | 'viewer' | 'verifier';
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  industry: string;
  country: string;
  size: 'micro' | 'small' | 'medium' | 'large';
  consolidationApproach?: 'equity_share' | 'financial_control' | 'operational_control';
  settings: {
    currency: string;
    timezone: string;
    language: string;
    gwpSet?: 'AR4' | 'AR5' | 'AR6';
  };
  exclusions?: Array<{
    source: string;
    scope?: 1 | 2 | 3;
    categoryId?: Types.ObjectId; // optional explicit link to a category
    justification: string;
    estimatedEmissions?: number; // kg CO2e per year
    createdAt?: Date;
  }>;
  // Relevance screening: categories judged relevant to the inventory.
  // Completeness is measured against this set. Empty = not yet screened.
  relevantCategories?: Types.ObjectId[];
  denominators?: Array<{
    year: number;
    metric: 'production' | 'revenue' | 'employees' | 'floor_area' | 'custom';
    label?: string; // human label, mainly for metric=custom
    value: number;
    unit: string;
  }>;
  targets?: Array<{
    name: string;
    description?: string;
    baselineYear: number;
    baselineEmissions: number; // kg CO2e in the baseline year
    targetYear: number;
    targetReduction: number; // percent vs baseline (100 = net zero)
  }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmissionCategory extends Document {
  _id: Types.ObjectId;
  scope: 1 | 2 | 3;
  category: string;
  subcategory?: string;
  description: string;
  clarification?: string;
  allowedUnits?: Array<{
    unit: string;
    description: string;
    conversionToBase: number;
  }>;
  baseUnit: string;
  unit: string;
  priority: 'high' | 'medium' | 'low';
  industry?: string[];
  industries?: string[];
  egyptianContext?: {
    relevance: 'high' | 'medium' | 'low';
    localFactors?: string;
    considerations?: string;
  };
  calculationMethod: 'direct' | 'activity_based' | 'spend_based' | 'hybrid';
  requiredInputs?: Array<{
    field: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
  isActive: boolean;
  displayOrder?: number;
  icon?: string;
  color?: string;
}

export interface IEmissionFactor extends Document {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  factorCode?: string;
  factor: number;
  description?: string;
  unit: string;
  source: string;
  sourceUrl?: string;
  sourceDocument?: string;
  region: 'egypt' | 'global';
  country?: string;
  year: number;
  validFrom?: Date;
  validTo?: Date;
  fuelType?: string;
  vehicleType?: string;
  materialType?: string;
  co2?: number;
  ch4?: number;
  n2o?: number;
  otherGhg?: number;
  qualityRating?: string;
  uncertainty?: number;
  isActive: boolean;
  organizationId?: Types.ObjectId; // set for org-scoped custom factors
  supplierId?: Types.ObjectId; // set when the factor came from a specific supplier
  supplierName?: string; // denormalized for display/provenance
  metadata?: Record<string, any>;
  egyptianData?: {
    adjustmentFactor?: number;
  };
  tags?: string[];
  isDefault?: boolean;
  version?: string;
}

export interface IIndustryBenchmark extends mongoose.Document {
  industry: string;
  region: string;
  organizationSize: 'small' | 'medium' | 'large';
  year: number;
  currency: string;
  
  emissions: {
    scope1: BenchmarkStats;
    scope2: BenchmarkStats;
    scope3: BenchmarkStats;
    total: BenchmarkStats;
  };

  intensity: {
    perEmployee: BenchmarkStats;
    perRevenue: BenchmarkStats;
    perSquareMeter?: BenchmarkStats;
  };

  topCategories: Array<{
    categoryId: mongoose.Types.ObjectId;
    categoryName: string;
    scope: number;
    avgEmissions: number;
    percentageOfTotal: number;
    importance: 'critical' | 'high' | 'medium' | 'low';
  }>;

  reductionOpportunities: Array<{
    category: string;
    description: string;
    potentialReductionMin: number;
    potentialReductionMax: number;
    implementationCost: 'low' | 'medium' | 'high';
    paybackPeriod: string;
    complexity: 'low' | 'medium' | 'high';
    applicability: number;
  }>;

  bestPractices: Array<{
    title: string;
    description: string;
    category: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
  }>;

  metadata: {
    sampleSize: number;
    dataQuality: 'high' | 'medium' | 'low';
    lastUpdated: Date;
    source: string;
    notes?: string;
  };

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BenchmarkStats {
  min: number;
  percentile25: number;
  median: number;
  percentile75: number;
  max: number;
  average: number;
}

/**
 * Reporting-year inventory: groups an organization's calculations for one
 * reporting year under a lifecycle (Draft → Review → Published/Locked). One
 * inventory per (organization, reporting year). Publishing freezes the
 * whole-year figures and the GWP set, locks the member calculations, and
 * (optionally) designates the base year for recalculation tracking.
 */
export interface IInventory extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  reportingYear: number;
  period: { start: Date; end: Date };
  status: 'draft' | 'review' | 'published';
  // Frozen at publish: the GWP-100 set the published figures were computed
  // under, so historical years don't shift when the org later switches sets.
  gwpSet?: 'AR4' | 'AR5' | 'AR6';
  // Exactly one inventory per org may be the base year (controller-enforced).
  isBaseYear: boolean;
  // GHG Protocol base-year recalculation significance threshold (percent).
  recalcThresholdPercent: number;
  // Frozen whole-year figures captured at publish (the "frozen results").
  frozenTotals?: { scope1: number; scope2: number; scope3: number; total: number };
  frozenCompletenessPercent?: number;
  publishedAt?: Date;
  publishedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICalculation extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  facilityId?: Types.ObjectId;
  // Reporting-year inventory this calculation belongs to (one per org+year).
  inventoryId?: Types.ObjectId;
  title: string;
  description?: string;
  period: {
    start: Date;
    end: Date;
  };
  emissions: {
    scope1: number;
    scope2: number;
    scope3: number;
    total: number;
  };
  data: ICalculationEntry[];
  status: 'draft' | 'completed' | 'verified' | 'locked';
  verification?: {
    verified: boolean;
    verifiedBy?: string;
    verifiedAt?: Date;
    comment?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ICalculationEntry {
  categoryId: Types.ObjectId;
  value: number;
  unit: string;
  factor: number;
  emissions: number;
  quality?: 'high' | 'medium' | 'low';
  notes?: string;
  // Calculation provenance (audit lineage)
  factorId?: Types.ObjectId;
  factorName?: string;
  factorSource?: string;
  factorYear?: number;
  gwpSet?: string; // GWP set in force when computed (e.g. 'AR6')
  gwpApplied?: 'per-gas' | 'embedded'; // whether GWPs were applied or already embedded in a CO2e factor
  method?: string; // calculation method (activity_based / spend_based / supplier-specific / ...)
  // Supplier provenance (entries computed with a supplier-linked factor)
  supplierId?: Types.ObjectId;
  supplierName?: string;
  // Scope 2 dual reporting (electricity entries only)
  scope2Location?: number; // location-based figure (grid average), kg CO2e
  scope2Market?: number; // market-based figure, kg CO2e
  scope2MarketMethod?: string; // which rung of the market-based hierarchy was used
  // Gap-filling / estimation flags (estimates must be distinguishable)
  isEstimate?: boolean;
  estimationMethod?: string; // e.g. 'same-period-prior-year +10% conservativeness'
  // PCAF-style data-quality score: 1 (best, supplier-specific measured) … 5 (rough estimate)
  dqScore?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
