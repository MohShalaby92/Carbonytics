import mongoose, { Schema } from 'mongoose';
import { IOrganization } from '../types';

const organizationSchema = new Schema<IOrganization>({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxlength: [200, 'Organization name cannot exceed 200 characters'],
  },
  industry: {
    type: String,
    required: [true, 'Industry is required'],
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
      'Other',
    ],
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    default: 'Egypt',
  },
  size: {
    type: String,
    enum: ['micro', 'small', 'medium', 'large'],
    required: [true, 'Organization size is required'],
  },
  // GHG Protocol organizational boundary: the consolidation approach is chosen
  // once, recorded, and applied consistently across reporting periods.
  consolidationApproach: {
    type: String,
    enum: ['equity_share', 'financial_control', 'operational_control'],
    default: 'operational_control',
  },
  settings: {
    currency: {
      type: String,
      default: 'EGP',
    },
    timezone: {
      type: String,
      default: 'Africa/Cairo',
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'ar'],
    },
    // GWP-100 value set applied to per-gas factors (see data/gwpSets.ts).
    // Selectable because different reporting regimes mandate different sets.
    gwpSet: {
      type: String,
      enum: ['AR4', 'AR5', 'AR6'],
      default: 'AR6',
    },
  },
  // Documented exclusions register (GHG Protocol completeness/transparency):
  // every excluded source/category needs a justification and a materiality
  // estimate — auditors request this list first.
  exclusions: [
    new Schema(
      {
        source: { type: String, required: true, trim: true },
        scope: { type: Number, enum: [1, 2, 3], required: false },
        justification: { type: String, required: true, trim: true },
        // Rough annual materiality estimate in kg CO2e (optional but encouraged).
        estimatedEmissions: { type: Number, min: 0 },
        createdAt: { type: Date, default: Date.now },
      },
      { _id: false }
    ),
  ],
  // Emission reduction targets shown on the dashboard.
  targets: [
    new Schema(
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        baselineYear: { type: Number, required: true, min: 2000 },
        // Baseline annual emissions in kg CO2e for the baseline year.
        baselineEmissions: { type: Number, required: true, min: 0 },
        targetYear: { type: Number, required: true, min: 2000 },
        // Reduction goal vs baseline, in percent (100 = net zero).
        targetReduction: { type: Number, required: true, min: 1, max: 100 },
      },
      { _id: false }
    ),
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret: any) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

// Indexes
organizationSchema.index({ name: 1 });
organizationSchema.index({ industry: 1 });
organizationSchema.index({ country: 1 });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
