import mongoose, { Schema } from 'mongoose';

interface IIndustryBenchmark extends mongoose.Document {
  industry: string;
  region: string;
  organizationSize: 'small' | 'medium' | 'large';
  year: number;
  currency: string;
  
  // Emission benchmarks (kg CO2e)
  emissions: {
    scope1: {
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
    scope2: {
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
    scope3: {
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
    total: {
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
  };

  // Intensity benchmarks (kg CO2e per unit)
  intensity: {
    perEmployee: {
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
    perRevenue: { // kg CO2e per currency unit
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
    perSquareMeter?: { // kg CO2e per m2 (for facility-based industries)
      min: number;
      percentile25: number;
      median: number;
      percentile75: number;
      max: number;
      average: number;
    };
  };

  // Top emission categories for this industry
  topCategories: Array<{
    categoryId: mongoose.Types.ObjectId;
    categoryName: string;
    scope: number;
    avgEmissions: number;
    percentageOfTotal: number;
    importance: 'critical' | 'high' | 'medium' | 'low';
  }>;

  // Reduction opportunities specific to industry
  reductionOpportunities: Array<{
    category: string;
    description: string;
    potentialReductionMin: number; // percentage
    potentialReductionMax: number; // percentage
    implementationCost: 'low' | 'medium' | 'high';
    paybackPeriod: string; // e.g., "1-2 years"
    complexity: 'low' | 'medium' | 'high';
    applicability: number; // percentage of organizations it applies to
  }>;

  // Best practices for this industry
  bestPractices: Array<{
    title: string;
    description: string;
    category: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
  }>;

  // Sample size and data quality
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

const industryBenchmarkSchema = new Schema<IIndustryBenchmark>({
  industry: {
    type: String,
    required: true,
    enum: [
      'Technology/Software',
      'Manufacturing',
      'Financial Services',
      'Healthcare',
      'Education',
      'Retail/E-commerce',
      'Construction',
      'Transportation',
      'Energy/Utilities',
      'Tourism/Hospitality',
      'Agriculture',
      'Oil & Gas',
      'Cement',
      'Steel & Metals',
      'Chemical & Petrochemical',
      'Other',
    ],
  },
  region: {
    type: String,
    required: true,
    enum: ['egypt', 'mena', 'global', 'eu', 'us'],
    default: 'global',
  },
  organizationSize: {
    type: String,
    enum: ['small', 'medium', 'large'],
    required: true,
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: new Date().getFullYear(),
  },
  currency: {
    type: String,
    default: 'USD',
  },
  
  // Emission benchmarks
  emissions: {
    scope1: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
    scope2: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
    scope3: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
    total: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
  },

  // Intensity benchmarks
  intensity: {
    perEmployee: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
    perRevenue: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
    perSquareMeter: {
      min: { type: Number, default: 0 },
      percentile25: { type: Number, default: 0 },
      median: { type: Number, default: 0 },
      percentile75: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
    },
  },

  topCategories: [{
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'EmissionCategory',
      required: true,
    },
    categoryName: { type: String, required: true },
    scope: { type: Number, required: true, enum: [1, 2, 3] },
    avgEmissions: { type: Number, required: true },
    percentageOfTotal: { type: Number, required: true },
    importance: { 
      type: String, 
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium'
    },
  }],

  reductionOpportunities: [{
    category: { type: String, required: true },
    description: { type: String, required: true },
    potentialReductionMin: { type: Number, required: true },
    potentialReductionMax: { type: Number, required: true },
    implementationCost: { 
      type: String, 
      enum: ['low', 'medium', 'high'],
      required: true 
    },
    paybackPeriod: { type: String, required: true },
    complexity: { 
      type: String, 
      enum: ['low', 'medium', 'high'],
      required: true 
    },
    applicability: { type: Number, required: true, min: 0, max: 100 },
  }],

  bestPractices: [{
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    impact: { 
      type: String, 
      enum: ['low', 'medium', 'high'],
      required: true 
    },
    effort: { 
      type: String, 
      enum: ['low', 'medium', 'high'],
      required: true 
    },
  }],

  metadata: {
    sampleSize: { type: Number, required: true },
    dataQuality: { 
      type: String, 
      enum: ['high', 'medium', 'low'],
      required: true 
    },
    lastUpdated: { type: Date, default: Date.now },
    source: { type: String, required: true },
    notes: String,
  },

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

// Indexes
industryBenchmarkSchema.index({ industry: 1, region: 1, organizationSize: 1 });
industryBenchmarkSchema.index({ year: -1 });
industryBenchmarkSchema.index({ isActive: 1 });

export const IndustryBenchmark = mongoose.model<IIndustryBenchmark>('IndustryBenchmark', industryBenchmarkSchema);
