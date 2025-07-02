import mongoose, { Schema } from 'mongoose';
import { IEmissionCategory } from '../types';

const emissionCategorySchema = new Schema<IEmissionCategory>({
  scope: {
    type: Number,
    required: [true, 'Scope is required'],
    enum: [1, 2, 3],
    index: true,
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true,
  },
  subcategory: {
    type: String,
    trim: true,
    sparse: true, // Allow multiple null values
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
  },
  clarification: {
    type: String,
    trim: true,
  },
  // Units this category accepts
  allowedUnits: [{
    unit: String,
    description: String,
    conversionToBase: Number, // Conversion factor to base unit
  }],
  baseUnit: {
    type: String,
    required: [true, 'Base unit is required'],
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
    index: true,
  },
  // Industries where this category is relevant
  industries: [{
    type: String,
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
  }],
  // Egyptian market considerations
  egyptianContext: {
    relevance: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    localFactors: String,
    considerations: String,
  },
  // Calculation requirements
  calculationMethod: {
    type: String,
    enum: ['direct', 'activity_based', 'spend_based', 'hybrid'],
    required: true,
  },
  requiredInputs: [{
    field: String,
    type: String, // 'number', 'text', 'date', 'select'
    required: Boolean,
    options: [String], // For select fields
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  // Metadata for UI rendering
  displayOrder: {
    type: Number,
    default: 0,
  },
  icon: String,
  color: String,
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

// Compound indexes for efficient queries
emissionCategorySchema.index({ scope: 1, category: 1 });
emissionCategorySchema.index({ scope: 1, priority: 1 });
emissionCategorySchema.index({ industries: 1, scope: 1 });
emissionCategorySchema.index({ 'egyptianContext.relevance': 1 });

export const EmissionCategory = mongoose.model<IEmissionCategory>('EmissionCategory', emissionCategorySchema);