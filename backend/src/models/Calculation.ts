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
  // Data-quality rating computed by the calculation engine when the entry was saved
  // (factor quality, regional specificity, recency).
  quality: {
    type: String,
    enum: ['high', 'medium', 'low'],
  },
  // ---- Calculation provenance (audit lineage) ----
  factorId: { type: Schema.Types.ObjectId, ref: 'EmissionFactor' },
  factorName: { type: String, trim: true },
  factorSource: { type: String, trim: true },
  factorYear: { type: Number },
  // GWP set in force when computed, and whether GWPs were applied per gas or
  // were already embedded in a CO2e-denominated factor (never both).
  gwpSet: { type: String },
  gwpApplied: { type: String, enum: ['per-gas', 'embedded'] },
  method: { type: String, trim: true },
  // Supplier provenance: set when the entry was computed with a factor that
  // came from a specific supplier (supplier-specific method, DQ 1).
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String, trim: true },
  // Scope 2 dual reporting (populated for purchased-electricity entries):
  // both figures are stored per the GHG Protocol Scope 2 Guidance.
  scope2Location: { type: Number },
  scope2Market: { type: Number },
  scope2MarketMethod: { type: String, trim: true },
  // Estimation flags: gap-filled values are never silently mixed with
  // measured data (estimates carry the method and force low quality / DQ 5).
  isEstimate: { type: Boolean, default: false },
  estimationMethod: { type: String, trim: true },
  // PCAF-style data-quality score (1 best … 5 worst).
  dqScore: { type: Number, min: 1, max: 5 },
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
  // Optional facility/site tag (organizational boundary dimension).
  facilityId: {
    type: Schema.Types.ObjectId,
    ref: 'Facility',
    index: true,
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
    // 'locked' = published/immutable; corrections require an explicit unlock
    // (admin/manager), which is itself an audited event.
    enum: ['draft', 'completed', 'verified', 'locked'],
    default: 'draft',
  },
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret: any) {
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

// ---- Immutability guards (assurance requirement) ----
// A locked calculation cannot be modified or deleted. Lock/unlock transitions
// themselves go through status-only updates (see lock/unlock controller), which
// are the single allowed mutation; everything else is rejected at the model
// layer so no future code path can silently restate published results.

const LOCKED_MESSAGE =
  'Calculation is locked (published) and cannot be modified or deleted. An admin/manager must unlock it first.';

function isStatusOnlyUpdate(update: any): boolean {
  if (!update || typeof update !== 'object') return false;
  // Mongoose's `timestamps` option injects `$set.updatedAt` AND
  // `$setOnInsert.createdAt` into every update (even without upsert), so a
  // pure status transition legitimately carries those alongside `status`.
  const allowed = (k: string) => k === 'status' || k === 'updatedAt';
  const timestampOnly = (k: string) => k === 'createdAt' || k === 'updatedAt';
  for (const op of Object.keys(update)) {
    if (op === '$set') {
      if (!Object.keys(update.$set).every(allowed)) return false;
    } else if (op === '$setOnInsert') {
      if (!Object.keys(update.$setOnInsert).every(timestampOnly)) return false;
    } else if (op.startsWith('$')) {
      return false;
    } else if (!allowed(op)) {
      return false;
    }
  }
  return true;
}

calculationSchema.pre('save', async function (next) {
  if (!this.isNew) {
    const prior = await (this.constructor as any)
      .findById(this._id)
      .select('status')
      .lean();
    if (prior?.status === 'locked') {
      return next(new Error(LOCKED_MESSAGE));
    }
  }
  // Keep stored totals consistent with the entries.
  this.emissions.total = this.data.reduce((sum, entry) => sum + entry.emissions, 0);
  next();
});

calculationSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate();
  if (isStatusOnlyUpdate(update)) return next(); // lock/unlock transition
  const doc = await this.model.findOne(this.getQuery()).select('status').lean();
  if ((doc as any)?.status === 'locked') return next(new Error(LOCKED_MESSAGE));
  next();
});

calculationSchema.pre('updateOne', async function (next) {
  if (isStatusOnlyUpdate(this.getUpdate())) return next();
  const doc = await this.model.findOne(this.getQuery()).select('status').lean();
  if ((doc as any)?.status === 'locked') return next(new Error(LOCKED_MESSAGE));
  next();
});

calculationSchema.pre('findOneAndDelete', async function (next) {
  const doc = await this.model.findOne(this.getQuery()).select('status').lean();
  if ((doc as any)?.status === 'locked') return next(new Error(LOCKED_MESSAGE));
  next();
});

calculationSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  const doc = await this.model.findOne(this.getQuery()).select('status').lean();
  if ((doc as any)?.status === 'locked') return next(new Error(LOCKED_MESSAGE));
  next();
});

calculationSchema.pre('deleteMany', async function (next) {
  const locked = await this.model.exists({ ...this.getQuery(), status: 'locked' });
  if (locked) return next(new Error(LOCKED_MESSAGE));
  next();
});

export const Calculation = mongoose.model<ICalculation>('Calculation', calculationSchema);
