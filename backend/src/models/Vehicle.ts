import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Fleet registry (§2.2 mobile distance-based). A Vehicle is an owned/controlled
 * mobile-combustion source the organization tracks so distance data can be
 * attributed to it and the right per-vehicle-km factor applied consistently.
 *
 * `factorId` is the vehicle's default distance factor (a Mobile Combustion
 * kg CO2e/km factor — e.g. a DEFRA per-vehicle-km row). The calculator can
 * pick a vehicle to auto-select its factor + the km unit. Stored emissions are
 * still computed by the engine from distance × factor; the registry is a
 * convenience/boundary layer, never a source of fabricated numbers.
 */

export type VehicleType = 'car' | 'van' | 'hgv' | 'motorbike' | 'bus' | 'other';

export interface IVehicle extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string; // label or registration plate
  vehicleType: VehicleType;
  fuel?: string; // diesel / petrol / electric / hybrid / CNG / LPG / ...
  size?: string; // segment / class (informational, e.g. 'Supermini', 'Class II')
  registration?: string;
  // Default distance factor (Mobile Combustion, kg CO2e/km). Optional so a
  // vehicle can be registered before a factor is chosen.
  factorId?: Types.ObjectId;
  // Optional site/entity this vehicle belongs to (organizational boundary).
  facilityId?: Types.ObjectId;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: [true, 'Vehicle name is required'], trim: true },
    vehicleType: {
      type: String,
      enum: ['car', 'van', 'hgv', 'motorbike', 'bus', 'other'],
      default: 'car',
    },
    fuel: { type: String, trim: true },
    size: { type: String, trim: true },
    registration: { type: String, trim: true },
    factorId: { type: Schema.Types.ObjectId, ref: 'EmissionFactor' },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },
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

vehicleSchema.index({ organizationId: 1, isActive: 1 });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', vehicleSchema);
