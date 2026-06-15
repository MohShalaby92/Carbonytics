import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Boundary node in an organization's entity hierarchy (GHG Protocol §1.2:
 * organization → subsidiaries/divisions → sites/assets). Nodes nest via
 * `parentFacilityId`, so the org can model a corporate structure, not just a
 * flat list of sites. Calculations tag to a node (`facilityId`); consolidation
 * roll-ups apply each node's `ownershipPercent` (equity share — held by the
 * immediate parent, multiplied down the chain), control flags
 * (operational/financial control approaches) and M&A effective dates
 * (`acquiredDate`/`disposedDate`, which pro-rate a node's contribution within
 * the reporting period). The name "Facility" is kept for backward
 * compatibility; `entityType` distinguishes a subsidiary from a physical site.
 */
export interface IFacility extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  country: string;
  city?: string;
  // Parent node in the hierarchy (null/undefined = directly under the org).
  parentFacilityId?: Types.ObjectId;
  // Classification within the boundary (informational; roll-up uses the flags).
  entityType: 'subsidiary' | 'division' | 'site' | 'asset';
  // Equity share held by the IMMEDIATE PARENT in this node (%); the org's equity
  // is the product down the chain. Used by the equity_share approach.
  ownershipPercent: number;
  // Whether the organization has operational control (control approaches).
  operationalControl: boolean;
  // Whether the organization has financial control (financial_control approach).
  financialControl: boolean;
  // M&A effective dates — a node only contributes for the part of the reporting
  // period it was held (acquiredDate ≤ t ≤ disposedDate).
  acquiredDate?: Date;
  disposedDate?: Date;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const facilitySchema = new Schema<IFacility>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: [true, 'Facility name is required'], trim: true },
    country: { type: String, default: 'Egypt', trim: true },
    city: { type: String, trim: true },
    parentFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility', index: true },
    entityType: {
      type: String,
      enum: ['subsidiary', 'division', 'site', 'asset'],
      default: 'site',
    },
    ownershipPercent: { type: Number, min: 0, max: 100, default: 100 },
    operationalControl: { type: Boolean, default: true },
    financialControl: { type: Boolean, default: true },
    acquiredDate: { type: Date },
    disposedDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

facilitySchema.index({ organizationId: 1, isActive: 1 });

export const Facility = mongoose.model<IFacility>('Facility', facilitySchema);
