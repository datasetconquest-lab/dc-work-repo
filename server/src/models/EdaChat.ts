import mongoose, { Schema, Document } from 'mongoose';

// An EDA "chat" is one Research Assistant project, owned by a single user.
// Chats are isolated per user: a user can only list/open/delete their own.
export interface IEdaChat extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  title: string;
  problem_statement: string;
  keywords: string[];
  year_start?: number;
  year_end?: number;
  venues: string[];
  strong_only: boolean;
  sources: string[];
  max_results: number;
  // High-level progress flags, mirrored from the pipeline stages.
  has_papers: boolean;
  has_index: boolean;
  has_review: boolean;
  has_gaps: boolean;
  has_datasets: boolean;
  created_at: Date;
  updated_at: Date;
}

const EdaChatSchema = new Schema<IEdaChat>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  problem_statement: { type: String, default: '' },
  keywords: { type: [String], default: [] },
  year_start: { type: Number },
  year_end: { type: Number },
  venues: { type: [String], default: [] },
  strong_only: { type: Boolean, default: false },
  sources: { type: [String], default: ['semantic_scholar', 'arxiv', 'openalex', 'crossref', 'europepmc'] },
  max_results: { type: Number, default: 20 },
  has_papers: { type: Boolean, default: false },
  has_index: { type: Boolean, default: false },
  has_review: { type: Boolean, default: false },
  has_gaps: { type: Boolean, default: false },
  has_datasets: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'eda_chats',
});

EdaChatSchema.index({ user_id: 1, updated_at: -1 });

export const EdaChat = mongoose.model<IEdaChat>('EdaChat', EdaChatSchema);
