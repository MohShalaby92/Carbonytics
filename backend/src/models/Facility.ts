import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Facility / site within an organization's boundary (GHG Protocol §1.2 entity
 * hierarchy, first level: organization → facilities). Calculations can be
 * tagged with a facility so emissions slice per site, and ownershipPercent +
 * control flags carry the data needed for consolidation-approach roll-ups
 * (equity share vs control).
 */
export interface IFacility extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  country: string;
  city?: string;
  // Equity share of this facility (%); used by the equity_share approach.
  ownershipPercent: number;
  // Whether the organization has operational control (control approaches).
  operationalControl: boolean;
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
    ownershipPercent: { type: Number, min: 0, max: 100, default: 100 },
    operationalControl: { type: Boolean, default: true },
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
