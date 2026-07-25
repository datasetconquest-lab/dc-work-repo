import mongoose, { Schema, Document } from 'mongoose';

// Task Model
export interface ITask extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    status: 'pending' | 'started' | 'processing' | 'review' | 'completed' | 'cancelled';
    due_date?: Date;
    assigned_to?: mongoose.Types.ObjectId;
    created_by?: mongoose.Types.ObjectId;
    task_type: 'personal' | 'company';
    dataset_name?: string;
    dataset_links?: string;
    dataset_size?: string;
    limitations?: string;
    novelty?: string;
    completion_results?: string;
    completion_values?: string;
    completion_summary?: string;
    is_deleted: boolean;
    // When actual work on the task started (first transition out of "pending")
    started_at?: Date;
    // When the worker (member/TL) submitted the task for admin approval (-> "review")
    submitted_at?: Date;
    // When the task was actually submitted / marked completed
    completed_at?: Date;
    // Who approved/completed the task (admin or the assignee's team lead)
    approved_by?: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const TaskSchema = new Schema<ITask>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
        type: String,
        enum: ['pending', 'started', 'processing', 'review', 'completed', 'cancelled'],
        default: 'pending'
    },
    due_date: { type: Date },
    assigned_to: { type: Schema.Types.ObjectId, ref: 'User' },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    task_type: { type: String, enum: ['personal', 'company'], default: 'company' },
    dataset_name: { type: String, trim: true },
    dataset_links: { type: String, trim: true },
    dataset_size: { type: String, trim: true },
    limitations: { type: String, trim: true },
    novelty: { type: String, trim: true },
    completion_results: { type: String, trim: true },
    completion_values: { type: String, trim: true },
    completion_summary: { type: String, trim: true },
    is_deleted: { type: Boolean, default: false },
    started_at: { type: Date },
    submitted_at: { type: Date },
    completed_at: { type: Date },
    approved_by: { type: Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tasks'
});

TaskSchema.index({ user_id: 1 });
TaskSchema.index({ assigned_to: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ task_type: 1 });
TaskSchema.index({ due_date: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);

// Task Log Model
export interface ITaskLog extends Document {
    _id: mongoose.Types.ObjectId;
    task_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    action: string;
    old_value?: string;
    new_value?: string;
    created_at: Date;
}

const TaskLogSchema = new Schema<ITaskLog>({
    task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    old_value: { type: String },
    new_value: { type: String },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'task_logs'
});

TaskLogSchema.index({ task_id: 1 });
TaskLogSchema.index({ user_id: 1 });

export const TaskLog = mongoose.model<ITaskLog>('TaskLog', TaskLogSchema);
