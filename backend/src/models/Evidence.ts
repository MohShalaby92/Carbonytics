import mongoose, { Schema } from 'mongoose';
import { IEvidence } from '../types';

/**
 * Evidence attachment metadata (§4.3 — evidence at the data-line level, required
 * for assurance). One row per uploaded file; the bytes live in GridFS (bucket
 * `evidence`). Linked to a specific `Calculation.data[entryIndex]` so a verifier
 * can trace any reported number to its supporting invoice / meter photo /
 * supplier letter. Tenant-scoped via organizationId.
 */
const evidenceSchema = new Schema<IEvidence>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    calculationId: {
      type: Schema.Types.ObjectId,
      ref: 'Calculation',
      required: true,
      index: true,
    },
    entryIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    gridFsId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    filename: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByEmail: { type: String, required: true, trim: true },
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

evidenceSchema.index({ organizationId: 1, calculationId: 1, entryIndex: 1 });

export const Evidence = mongoose.model<IEvidence>('Evidence', evidenceSchema);
