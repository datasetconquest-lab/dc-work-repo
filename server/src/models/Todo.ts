import mongoose, { Schema, Document } from 'mongoose';

// Personal to-do item. Each user creates and owns their own list. Only an admin
// can "strike off" (mark done) an item; a regular user may create and remove
// their own not-yet-struck items but cannot complete them.
export interface ITodo extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;      // owner of the item
    text: string;
    is_done: boolean;                      // struck off the list
    struck_by?: mongoose.Types.ObjectId;   // admin who struck it off
    struck_at?: Date;
    created_at: Date;
    updated_at: Date;
}

const TodoSchema = new Schema<ITodo>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true },
    is_done: { type: Boolean, default: false },
    struck_by: { type: Schema.Types.ObjectId, ref: 'User' },
    struck_at: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'todos'
});

TodoSchema.index({ user_id: 1, created_at: -1 });

export const Todo = mongoose.model<ITodo>('Todo', TodoSchema);
