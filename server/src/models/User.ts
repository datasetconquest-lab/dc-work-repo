import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    email: string;
    full_name: string;
    employee_id?: string;
    avatar_url?: string;
    // Roles:
    // - admin: full system administration
    // - member: regular user
    // - manager: currently unused generic manager role
    // - tl: team lead (can manage tasks for their team members)
    role: 'admin' | 'member' | 'manager' | 'tl';
    is_active: boolean;
    password_hash?: string;
    allowed_ips?: string;
    restrict_by_ip: boolean;
    ip_last_login?: string;
    ip_login_history: { ip: string; timestamp: Date }[];
    last_login?: Date;
    created_by?: mongoose.Types.ObjectId;
    // Optional team lead relationship – when set, this user reports to the given team lead
    team_lead_id?: mongoose.Types.ObjectId;
    // Dates (YYYY-MM-DD) on which this user is allowed to arrive after the IN
    // cutoff (9:30 AM) without being auto-marked absent. Granted by an admin
    // when the user informs them in advance. A check-in after the cutoff on one
    // of these dates is recorded as "late" instead of "absent".
    late_permission_dates?: string[];
    created_at: Date;
    updated_at: Date;
}

const UserSchema = new Schema<IUser>({
    email: { type: String, required: true, lowercase: true, trim: true },
    full_name: { type: String, trim: true },
    employee_id: { type: String, trim: true },
    avatar_url: { type: String },
    role: { type: String, enum: ['admin', 'member', 'manager', 'tl'], default: 'member' },
    is_active: { type: Boolean, default: true },
    password_hash: { type: String },
    allowed_ips: { type: String, default: '127.0.0.1, ::1, localhost, 192.168.0.0/16' },
    restrict_by_ip: { type: Boolean, default: true },
    ip_last_login: { type: String },
    ip_login_history: [{ ip: String, timestamp: Date }],
    last_login: { type: Date },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    team_lead_id: { type: Schema.Types.ObjectId, ref: 'User' },
    late_permission_dates: { type: [String], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'users'
});

// Index for faster lookups
UserSchema.index({ email: 1 });
UserSchema.index({ employee_id: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ is_active: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
