import mongoose, { Schema } from 'mongoose';
import { IEmissionFactor } from '../types';

const emissionFactorSchema = new Schema<IEmissionFactor>({
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'EmissionCategory',
    required: [true, 'Category is required'],
    index: true,
  },
  // Factor identification
  factorCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  name: {
    type: String,
    required: [true, 'Factor name is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  // Emission factor value
  factor: {
    type: Number,
    required: [true, 'Emission factor is required'],
    min: [0, 'Factor cannot be negative'],
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
  },
  // CO2 equivalent breakdown
  co2: { type: Number, default: 0 },
  ch4: { type: Number, default: 0 },
  n2o: { type: Number, default: 0 },
  otherGhg: { type: Number, default: 0 },
  // Source information
  source: {
    type: String,
    required: [true, 'Source is required'],
    trim: true,
    enum: [
      'DEFRA 2024',
      'IPCC 2006',
      'IPCC 2019',
      'EPA 2024',
      'IEA Egypt',
      'EEHC Egypt',
      'CAPMAS Egypt',
      'Custom',
      'Other',
    ],
  },
  sourceUrl: String,
  sourceDocument: String,
  // Geographic scope
  region: {
    type: String,
    enum: ['egypt', 'mena', 'global', 'eu', 'us'],
    default: 'global',
    index: true,
  },
  country: {
    type: String,
    default: 'EG', // ISO country code
  },
  // Temporal information
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2000, 'Year must be after 2000'],
    max: [new Date().getFullYear() + 1, 'Year cannot be too far in future'],
    index: true,
  },
  validFrom: Date,
  validTo: Date,
  // Quality and uncertainty
  uncertainty: {
    type: Number,
    min: 0,
    max: 100, // Percentage
  },
  qualityRating: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  },
  // Categories and tags
  fuelType: String, // For combustion factors
  vehicleType: String, // For transport factors
  materialType: String, // For material factors
  tags: [String],
  // Egyptian specific data
  egyptianData: {
    isLocalFactor: { type: Boolean, default: false },
    localSource: String,
    adjustmentFactor: Number, // Adjustment for local conditions
    notes: String,
  },
  // Status and versioning
  isActive: {
    type: Boolean,
    default: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  version: {
    type: String,
    default: '1.0',
  },
  // Additional metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
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

// Indexes for efficient queries
emissionFactorSchema.index({ categoryId: 1, region: 1, year: -1 });
emissionFactorSchema.index({ factorCode: 1 });
emissionFactorSchema.index({ source: 1, year: -1 });
emissionFactorSchema.index({ region: 1, isActive: 1 });
emissionFactorSchema.index({ 'egyptianData.isLocalFactor': 1 });

export const EmissionFactor = mongoose.model<IEmissionFactor>('EmissionFactor', emissionFactorSchema);
