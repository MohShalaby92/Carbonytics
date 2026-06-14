import mongoose, { Schema } from 'mongoose';
import { IInventory } from '../types';

/**
 * Reporting-year inventory (the year-level wrapper layered over per-calculation
 * locking). One document per (organization, reporting year). Its lifecycle —
 * Draft → Review → Published — closes a reporting year: publishing freezes the
 * whole-year totals and the GWP set, locks the member calculations, and writes
 * an immutable InventorySnapshot. Reopening is the audited correction path.
 */
const inventorySchema = new Schema<IInventory>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    reportingYear: { type: Number, required: true, min: 2000, max: 2100 },
    // Defaults to the calendar year but stored explicitly so fiscal years work.
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    // 'published' == locked: the reporting year is closed and immutable.
    status: {
      type: String,
      enum: ['draft', 'review', 'published'],
      default: 'draft',
    },
    // Frozen at publish from organization.settings.gwpSet, so the published
    // figures keep their methodology even after the org switches AR4/AR5/AR6.
    gwpSet: { type: String, enum: ['AR4', 'AR5', 'AR6'] },
    // Exactly one inventory per organization may be the base year. Enforced in
    // the controller (designating a new base year clears the previous one).
    isBaseYear: { type: Boolean, default: false },
    // GHG Protocol base-year recalculation significance threshold (percent):
    // a restated year that drifts from its frozen figure by more than this is
    // flagged for base-year recalculation.
    recalcThresholdPercent: { type: Number, default: 5, min: 0, max: 100 },
    // Frozen whole-year figures captured at publish (the "frozen results").
    frozenTotals: {
      scope1: { type: Number },
      scope2: { type: Number },
      scope3: { type: Number },
      total: { type: Number },
    },
    frozenCompletenessPercent: { type: Number },
    publishedAt: { type: Date },
    publishedBy: { type: String, trim: true },
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

// One inventory per organization per reporting year.
inventorySchema.index({ organizationId: 1, reportingYear: 1 }, { unique: true });

export const Inventory = mongoose.model<IInventory>('Inventory', inventorySchema);
