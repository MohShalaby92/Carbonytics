import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Append-only audit trail (assurance backbone).
 *
 * Every meaningful create/update/delete on activity data, factors, and
 * organizational settings writes one immutable entry: who, when, what,
 * old → new value. There are intentionally NO update or delete code paths
 * for this collection.
 */
export interface IAuditLog extends Document {
  organizationId: Types.ObjectId;
  userId?: Types.ObjectId;
  userEmail?: string;
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'import';
  resourceType: string; // e.g. 'calculation', 'emission-factor', 'organization-settings'
  resourceId?: string;
  before?: any;
  after?: any;
  comment?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String, trim: true },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete', 'lock', 'unlock', 'import'],
    },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    comment: { type: String, trim: true },
  },
  {
    // createdAt only — audit entries are never updated.
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

auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
