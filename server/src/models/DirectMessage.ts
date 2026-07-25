import mongoose, { Schema, Document, Types } from 'mongoose';

// Direct Message Model
export interface IDirectMessage extends Document {
    _id: Types.ObjectId;
    sender_id: Types.ObjectId;
    receiver_id: Types.ObjectId;
    message: string;
    attachments: any[];
    is_read: boolean;
    created_at: Date;
    updated_at: Date;
}

const DirectMessageSchema = new Schema({
    sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: false, default: '' },
    attachments: [Schema.Types.Mixed],
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'direct_messages'
});

DirectMessageSchema.index({ sender_id: 1, receiver_id: 1 });
DirectMessageSchema.index({ receiver_id: 1 });
DirectMessageSchema.index({ created_at: -1 });

export const DirectMessage = mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema);
