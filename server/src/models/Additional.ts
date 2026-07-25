import mongoose, { Schema, Document } from 'mongoose';

// Auth Credentials Model (separate table for password hashes)
export interface IAuthCredential extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
}

const AuthCredentialSchema = new Schema<IAuthCredential>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    password_hash: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'auth_credentials'
});

// Event Participants Model
export interface IEventParticipant extends Document {
    _id: mongoose.Types.ObjectId;
    event_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    response: 'pending' | 'accepted' | 'declined' | 'tentative';
    created_at: Date;
    updated_at: Date;
}

const EventParticipantSchema = new Schema<IEventParticipant>({
    event_id: { type: Schema.Types.ObjectId, ref: 'CalendarEvent', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    response: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'tentative'],
        default: 'pending'
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'event_participants'
});

EventParticipantSchema.index({ event_id: 1, user_id: 1 }, { unique: true });

// Audit Log Model
export interface IAuditLog extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    entity_type: string;
    entity_id?: mongoose.Types.ObjectId;
    action: string;
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    details?: string;
    created_at: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: Schema.Types.ObjectId },
    action: { type: String, required: true },
    old_values: { type: Schema.Types.Mixed },
    new_values: { type: Schema.Types.Mixed },
    details: { type: String },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'audit_logs'
});

AuditLogSchema.index({ user_id: 1 });
AuditLogSchema.index({ created_at: -1 });
AuditLogSchema.index({ entity_type: 1, entity_id: 1 });

// Analytics Snapshot Model
export interface IAnalyticsSnapshot extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    total_tasks: number;
    completed_tasks: number;
    active_groups: number;
    login_count: number;
    snapshot_date: Date;
    created_at: Date;
}

const AnalyticsSnapshotSchema = new Schema<IAnalyticsSnapshot>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    total_tasks: { type: Number, default: 0 },
    completed_tasks: { type: Number, default: 0 },
    active_groups: { type: Number, default: 0 },
    login_count: { type: Number, default: 0 },
    snapshot_date: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'analytics_snapshots'
});

AnalyticsSnapshotSchema.index({ user_id: 1 });
AnalyticsSnapshotSchema.index({ snapshot_date: -1 });

export const AuthCredential = mongoose.model<IAuthCredential>('AuthCredential', AuthCredentialSchema);
export const EventParticipant = mongoose.model<IEventParticipant>('EventParticipant', EventParticipantSchema);
export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export const AnalyticsSnapshot = mongoose.model<IAnalyticsSnapshot>('AnalyticsSnapshot', AnalyticsSnapshotSchema);
