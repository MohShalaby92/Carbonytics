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
  role: 'admin' | 'manager' | 'user';
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
  settings: {
    currency: string;
    timezone: string;
    language: string;
  };
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

export interface ICalculation extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
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
  status: 'draft' | 'completed' | 'verified';
  createdAt: Date;
  updatedAt: Date;
}

export interface ICalculationEntry {
  categoryId: Types.ObjectId;
  value: number;
  unit: string;
  factor: number;
  emissions: number;
  notes?: string;
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
