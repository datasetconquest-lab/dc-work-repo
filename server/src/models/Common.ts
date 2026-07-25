import mongoose, { Schema, Document } from 'mongoose';

// Notification Model
export interface INotification extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    type: 'task_assigned' | 'task_updated' | 'message_received' | 'group_added' | 'event_reminder' | 'system' | 'task_status';
    title: string;
    message: string;
    related_id?: mongoose.Types.ObjectId;
    related_type?: 'task' | 'message' | 'group' | 'event';
    is_read: boolean;
    created_at: Date;
}

const NotificationSchema = new Schema<INotification>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['task_assigned', 'task_updated', 'message_received', 'group_added', 'event_reminder', 'system', 'task_status'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    related_id: { type: Schema.Types.ObjectId },
    related_type: { type: String, enum: ['task', 'message', 'group', 'event'] },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'notifications'
});

NotificationSchema.index({ user_id: 1, created_at: -1 });
NotificationSchema.index({ is_read: 1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

// Login Log Model
export interface ILoginLog extends Document {
    _id: mongoose.Types.ObjectId;
    user_id?: mongoose.Types.ObjectId;
    login_time: Date;
    success: boolean;
    ip_address: string;
    user_agent?: string;
}

const LoginLogSchema = new Schema<ILoginLog>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    login_time: { type: Date, default: Date.now },
    success: { type: Boolean, required: true },
    ip_address: { type: String, required: true },
    user_agent: { type: String }
}, {
    collection: 'login_logs'
});

LoginLogSchema.index({ user_id: 1 });
LoginLogSchema.index({ login_time: -1 });

export const LoginLog = mongoose.model<ILoginLog>('LoginLog', LoginLogSchema);

// Reaction Model
export interface IReaction extends Document {
    _id: mongoose.Types.ObjectId;
    message_id: mongoose.Types.ObjectId;
    message_type: 'direct' | 'group';
    user_id: mongoose.Types.ObjectId;
    emoji: string;
    created_at: Date;
}

const ReactionSchema = new Schema<IReaction>({
    message_id: { type: Schema.Types.ObjectId, required: true },
    message_type: { type: String, enum: ['direct', 'group'], required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'reactions'
});

ReactionSchema.index({ message_id: 1, message_type: 1 });
ReactionSchema.index({ user_id: 1 });

export const Reaction = mongoose.model<IReaction>('Reaction', ReactionSchema);
