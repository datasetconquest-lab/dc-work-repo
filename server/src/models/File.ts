import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
    filename: string;
    contentType: string;
    size: number;
    // For legacy records we stored the file directly in MongoDB
    data?: Buffer;
    // Legacy: older uploads kept a local-disk path (ephemeral on the host)
    path?: string;
    // Current: bytes live in GridFS (survives restarts/redeploys)
    gridfs_id?: mongoose.Types.ObjectId;
    uploaded_by: mongoose.Types.ObjectId;
    // Marks how the file is being used. Only 'message' files are
    // wiped by the monthly cleanup job; anything else (avatars, etc.)
    // is left alone.
    category: 'message' | 'avatar' | 'other';
    created_at: Date;
}

const FileSchema = new Schema<IFile>({
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer },
    path: { type: String },
    gridfs_id: { type: Schema.Types.ObjectId },
    uploaded_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
        type: String,
        enum: ['message', 'avatar', 'other'],
        default: 'other',
        index: true
    },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'files'
});

FileSchema.index({ uploaded_by: 1 });
FileSchema.index({ created_at: -1 });
FileSchema.index({ category: 1, created_at: 1 });

export const FileStore = mongoose.model<IFile>('File', FileSchema);
