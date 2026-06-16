import mongoose, { Schema } from 'mongoose';
import { IEmissionFactorVersion } from '../types';

/**
 * Immutable, append-only version history for emission factors (§3 — factor
 * library as versioned reference data, closing the §2.1 deterministic-recompute
 * gap and report failure-mode #6).
 *
 * Each row is a frozen snapshot of a factor's value-bearing state (value(s) per
 * gas, unit, source, year, valid-from/to, license). A new row is written ONLY
 * when the content actually changes (deduplicated by `contentHash`), so the
 * version number is a meaningful change counter, not a write counter. A
 * calculation pins the version in force at save time, so re-importing a new
 * annual factor set over the live factor never silently restates a locked
 * inventory — the pinned version still reproduces the stored figure.
 *
 * Rows are immutable: update/delete are rejected at the model layer (the only
 * legitimate way to change a factor is to record a NEW version).
 */
const emissionFactorVersionSchema = new Schema<IEmissionFactorVersion>(
  {
    factorId: {
      type: Schema.Types.ObjectId,
      ref: 'EmissionFactor',
      required: true,
      index: true,
    },
    factorCode: { type: String, trim: true },
    version: { type: Number, required: true, min: 1 },
    // ---- value-bearing snapshot ----
    name: { type: String, required: true, trim: true },
    factor: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
    co2: { type: Number, default: 0 },
    ch4: { type: Number, default: 0 },
    n2o: { type: Number, default: 0 },
    otherGhg: { type: Number, default: 0 },
    source: { type: String, required: true, trim: true },
    sourceUrl: { type: String, trim: true },
    sourceDocument: { type: String, trim: true },
    // Plain string (no enum) so the snapshot never rejects a legacy region value.
    region: { type: String, default: 'global' },
    country: { type: String },
    year: { type: Number, required: true },
    validFrom: { type: Date },
    validTo: { type: Date },
    license: { type: String, trim: true },
    qualityRating: { type: String, trim: true },
    uncertainty: { type: Number },
    metadata: { type: Schema.Types.Mixed, default: {} },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, trim: true },
    // ---- bookkeeping ----
    contentHash: { type: String, required: true, index: true },
    recordedBy: { type: String, required: true, trim: true },
    changeReason: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One row per (factor, version); fast latest-version lookup.
emissionFactorVersionSchema.index({ factorId: 1, version: -1 }, { unique: true });

// ---- Immutability guards (append-only, assurance requirement) ----
const IMMUTABLE_MESSAGE =
  'Emission factor versions are immutable (append-only). Record a new version instead of editing one.';

emissionFactorVersionSchema.pre('save', function (next) {
  // Allow the initial insert; reject any later modification of an existing row.
  if (!this.isNew) return next(new Error(IMMUTABLE_MESSAGE));
  next();
});

const blockWrite = function (next: (err?: Error) => void) {
  next(new Error(IMMUTABLE_MESSAGE));
};
emissionFactorVersionSchema.pre('updateOne', blockWrite);
emissionFactorVersionSchema.pre('findOneAndUpdate', blockWrite);
emissionFactorVersionSchema.pre('updateMany', blockWrite);
emissionFactorVersionSchema.pre('deleteOne', { document: false, query: true }, blockWrite);
emissionFactorVersionSchema.pre('findOneAndDelete', blockWrite);
emissionFactorVersionSchema.pre('deleteMany', blockWrite);

export const EmissionFactorVersion = mongoose.model<IEmissionFactorVersion>(
  'EmissionFactorVersion',
  emissionFactorVersionSchema
);
