import mongoose, { Schema, Document } from 'mongoose';

// One pipeline output document per (chat, kind). `data` holds the same JSON
// structure the Research Assistant used to write to files
// (metadata.json / lit_review.json / gaps.json / datasets.json / eda / humanize),
// so all project data now lives in MongoDB instead of on disk.
export type EdaResultKind =
  | 'metadata'
  | 'lit_review'
  | 'gaps'
  | 'datasets'
  | 'eda'
  | 'humanize';

export interface IEdaResult extends Document {
  _id: mongoose.Types.ObjectId;
  chat_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  kind: EdaResultKind;
  data: unknown;
  created_at: Date;
  updated_at: Date;
}

const EdaResultSchema = new Schema<IEdaResult>({
  chat_id: { type: Schema.Types.ObjectId, ref: 'EdaChat', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'eda_results',
});

// One document per (chat, kind).
EdaResultSchema.index({ chat_id: 1, kind: 1 }, { unique: true });

export const EdaResult = mongoose.model<IEdaResult>('EdaResult', EdaResultSchema);
