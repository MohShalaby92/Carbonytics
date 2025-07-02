import mongoose, { Schema } from 'mongoose';
import { ICalculation, ICalculationEntry } from '../types';

const calculationEntrySchema = new Schema<ICalculationEntry>({
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'EmissionCategory',
    required: [true, 'Category is required'],
  },
  value: {
    type: Number,
    required: [true, 'Value is required'],
    min: [0, 'Value cannot be negative'],
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
  },
  factor: {
    type: Number,
    required: [true, 'Factor is required'],
    min: [0, 'Factor cannot be negative'],
  },
  emissions: {
    type: Number,
    required: [true, 'Emissions is required'],
    min: [0, 'Emissions cannot be negative'],
  },
  notes: {
    type: String,
    trim: true,
  },
}, { _id: false });

const calculationSchema = new Schema<ICalculation>({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization is required'],
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
  },
  period: {
    start: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    end: {
      type: Date,
      required: [true, 'End date is required'],
      validate: {
        validator: function(this: ICalculation, value: Date): boolean {
          return value > this.period.start;
        },
        message: 'End date must be after start date',
      },
    },
  },
  emissions: {
    scope1: {
      type: Number,
      default: 0,
      min: [0, 'Scope 1 emissions cannot be negative'],
    },
    scope2: {
      type: Number,
      default: 0,
      min: [0, 'Scope 2 emissions cannot be negative'],
    },
    scope3: {
      type: Number,
      default: 0,
      min: [0, 'Scope 3 emissions cannot be negative'],
    },
    total: {
      type: Number,
      default: 0,
      min: [0, 'Total emissions cannot be negative'],
    },
  },
  data: [calculationEntrySchema],
  status: {
    type: String,
    enum: ['draft', 'completed', 'verified'],
    default: 'draft',
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

// Indexes
calculationSchema.index({ organizationId: 1 });
calculationSchema.index({ userId: 1 });
calculationSchema.index({ status: 1 });
calculationSchema.index({ 'period.start': 1, 'period.end': 1 });
calculationSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate totals
calculationSchema.pre('save', function(next) {
  const scope1Total = this.data
    .filter(entry => {
      // We'll need to populate categoryId to check scope
      // For now, assume we have scope information
      return true; // Placeholder
    })
    .reduce((sum, entry) => sum + entry.emissions, 0);

  // Similar for scope2 and scope3
  this.emissions.total = this.data.reduce((sum, entry) => sum + entry.emissions, 0);
  
  next();
});

export const Calculation = mongoose.model<ICalculation>('Calculation', calculationSchema);
