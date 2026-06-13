import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Supplier registry + data-request workflow (GHG Protocol Scope 3 supplier
 * engagement). The platform tracks the engagement lifecycle — it does NOT
 * send emails; issuing a request records that the user asked the supplier
 * for data outside the platform. Fulfilled requests link to the artifact the
 * data landed as: a supplier-specific custom emission factor, an activity-data
 * calculation, or received documentation.
 */

export type SupplierRequestStatus = 'sent' | 'received' | 'fulfilled' | 'declined';
export type SupplierFulfillmentType = 'custom-factor' | 'activity-data' | 'document';

export interface ISupplierDataRequest {
  _id: Types.ObjectId;
  period: { start: Date; end: Date };
  // Category the data is requested for (optional: a request may cover the
  // supplier's whole footprint share).
  categoryId?: Types.ObjectId;
  message?: string;
  status: SupplierRequestStatus;
  sentAt: Date;
  respondedAt?: Date;
  fulfillment?: {
    type: SupplierFulfillmentType;
    factorId?: Types.ObjectId;
    calculationId?: Types.ObjectId;
    notes?: string;
  };
}

export interface ISupplier extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  contactName?: string;
  contactEmail?: string;
  // Categories this supplier feeds (Scope 3 relevance mapping).
  categories: Types.ObjectId[];
  notes?: string;
  isActive: boolean;
  dataRequests: ISupplierDataRequest[];
  createdAt: Date;
  updatedAt: Date;
}

const dataRequestSchema = new Schema<ISupplierDataRequest>(
  {
    period: {
      start: { type: Date, required: [true, 'Request period start is required'] },
      end: {
        type: Date,
        required: [true, 'Request period end is required'],
        validate: {
          validator: function (this: ISupplierDataRequest, value: Date): boolean {
            return value > this.period.start;
          },
          message: 'Request period end must be after start',
        },
      },
    },
    categoryId: { type: Schema.Types.ObjectId, ref: 'EmissionCategory' },
    message: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['sent', 'received', 'fulfilled', 'declined'],
      default: 'sent',
    },
    sentAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
    fulfillment: {
      type: {
        type: String,
        enum: ['custom-factor', 'activity-data', 'document'],
      },
      factorId: { type: Schema.Types.ObjectId, ref: 'EmissionFactor' },
      calculationId: { type: Schema.Types.ObjectId, ref: 'Calculation' },
      notes: { type: String, trim: true, maxlength: 1000 },
    },
  },
  { _id: true }
);

const supplierSchema = new Schema<ISupplier>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: [true, 'Supplier name is required'], trim: true },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    categories: [{ type: Schema.Types.ObjectId, ref: 'EmissionCategory' }],
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    dataRequests: [dataRequestSchema],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (Array.isArray(ret.dataRequests)) {
          ret.dataRequests = ret.dataRequests.map((r: any) => {
            if (r._id) {
              r.id = r._id;
              delete r._id;
            }
            return r;
          });
        }
        return ret;
      },
    },
  }
);

supplierSchema.index({ organizationId: 1, isActive: 1 });

/**
 * Engagement status derived from the request lifecycle (best stage reached):
 * fulfilled > received > sent > none.
 */
export function deriveEngagementStatus(supplier: {
  dataRequests?: Array<{ status: string }>;
}): 'not_engaged' | 'awaiting_response' | 'data_received' | 'data_integrated' {
  const requests = supplier.dataRequests || [];
  if (requests.some((r) => r.status === 'fulfilled')) return 'data_integrated';
  if (requests.some((r) => r.status === 'received')) return 'data_received';
  if (requests.some((r) => r.status === 'sent')) return 'awaiting_response';
  return 'not_engaged';
}

export const Supplier = mongoose.model<ISupplier>('Supplier', supplierSchema);
