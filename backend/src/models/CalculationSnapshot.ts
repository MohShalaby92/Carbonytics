import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Immutable, versioned snapshot of a calculation taken at every lock
 * (publication) event. Restatements therefore have a complete before/after
 * history: unlock (audited) → re-lock writes the next version, and the diff
 * endpoint reports what changed between versions. Append-only by convention —
 * there are no update/delete code paths.
 */
export interface ICalculationSnapshot extends Document {
  organizationId: Types.ObjectId;
  calculationId: Types.ObjectId;
  version: number;
  snapshot: any; // full calculation document as locked
  reason: string; // e.g. 'lock'
  comment?: string;
  createdBy?: string; // user email
  createdAt: Date;
}

const calculationSnapshotSchema = new Schema<ICalculationSnapshot>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    calculationId: { type: Schema.Types.ObjectId, ref: 'Calculation', required: true, index: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, default: 'lock' },
    comment: { type: String, trim: true },
    createdBy: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

calculationSnapshotSchema.index({ calculationId: 1, version: -1 });

export const CalculationSnapshot = mongoose.model<ICalculationSnapshot>(
  'CalculationSnapshot',
  calculationSnapshotSchema
);
