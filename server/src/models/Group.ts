import mongoose, { Schema, Document, Types } from 'mongoose';

// Group Model
export interface IGroup extends Document {
    _id: Types.ObjectId;
    name: string;
    description?: string;
    created_by: Types.ObjectId;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const GroupSchema = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'groups'
});

GroupSchema.index({ name: 1 });
GroupSchema.index({ created_by: 1 });

export const Group = mongoose.model<IGroup>('Group', GroupSchema);

// Group Member Model
export interface IGroupMember extends Document {
    _id: Types.ObjectId;
    group_id: Types.ObjectId;
    user_id: Types.ObjectId;
    added_by: Types.ObjectId;
    joined_at: Date;
}

const GroupMemberSchema = new Schema({
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    added_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joined_at: { type: Date, default: Date.now }
}, {
    collection: 'group_members'
});

GroupMemberSchema.index({ group_id: 1, user_id: 1 }, { unique: true });
GroupMemberSchema.index({ user_id: 1 });

export const GroupMember = mongoose.model<IGroupMember>('GroupMember', GroupMemberSchema);

// Group Message Model
export interface IGroupMessage extends Document {
    _id: Types.ObjectId;
    group_id: Types.ObjectId;
    user_id: Types.ObjectId;
    message: string;
    attachments: any[];
    created_at: Date;
    updated_at: Date;
}

const GroupMessageSchema = new Schema({
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: false, default: '' },
    attachments: [Schema.Types.Mixed],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'group_messages'
});

GroupMessageSchema.index({ group_id: 1, created_at: -1 });
GroupMessageSchema.index({ user_id: 1 });

export const GroupMessage = mongoose.model<IGroupMessage>('GroupMessage', GroupMessageSchema);
