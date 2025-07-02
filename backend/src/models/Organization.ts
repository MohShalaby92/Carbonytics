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
  },
  isActive: {
    type: Boolean,
    default: true,
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
organizationSchema.index({ name: 1 });
organizationSchema.index({ industry: 1 });
organizationSchema.index({ country: 1 });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
