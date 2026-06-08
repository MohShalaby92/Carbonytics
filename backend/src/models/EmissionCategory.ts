import mongoose, { Schema } from 'mongoose';
import { IEmissionCategory } from '../types';

// Sub-schema for a single required input (a form-field definition).
// `typeKey: '$type'` keeps a real field literally named `type` (the input's data
// type) instead of letting Mongoose treat it as the SchemaType keyword — without
// this, `requiredInputs` collapses to `[String]` and persisting the input objects
// fails (this broke seeding).
const requiredInputSchema = new Schema(
  {
    field: String,
    type: String, // 'number' | 'text' | 'date' | 'select'
    required: Boolean,
    options: [String], // for select fields
  },
  { _id: false, typeKey: '$type' }
);

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
  // Industries where this category is relevant. This is a loose relevance-tagging
  // vocabulary that intentionally exceeds the organization industry list (e.g.
  // 'Logistics', 'All Industries'), so it is NOT constrained to a fixed enum.
  // (See note: align org/category/benchmark industry vocabularies in a later pass.)
  industries: [{ type: String, trim: true }],
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
  requiredInputs: [requiredInputSchema],
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
    transform: function(doc, ret: any) {
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