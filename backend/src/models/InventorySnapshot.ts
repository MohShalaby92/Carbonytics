import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Immutable, versioned snapshot of a reporting-year inventory taken at every
 * publish event. Mirrors CalculationSnapshot but at the year level: it captures
 * the frozen whole-year figures (totals, GWP set, completeness, member
 * calculations) so a published year has a complete restatement history —
 * reopen (audited) → re-publish writes the next version. Append-only by
 * convention; there are no update/delete code paths.
 */
export interface IInventorySnapshot extends Document {
  organizationId: Types.ObjectId;
  inventoryId: Types.ObjectId;
  version: number;
  snapshot: any; // frozen year figures + methodology + member calculation ids
  reason: string; // e.g. 'publish'
  comment?: string;
  createdBy?: string; // user email
  createdAt: Date;
}

const inventorySnapshotSchema = new Schema<IInventorySnapshot>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, default: 'publish' },
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

inventorySnapshotSchema.index({ inventoryId: 1, version: -1 });

export const InventorySnapshot = mongoose.model<IInventorySnapshot>(
  'InventorySnapshot',
  inventorySnapshotSchema
);
