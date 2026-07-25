import mongoose, { Schema, Document } from 'mongoose';

// Calendar Event Model
export interface ICalendarEvent extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    event_type: 'meeting' | 'task' | 'deadline' | 'reminder' | 'holiday' | 'other';
    start_time: Date;
    end_time?: Date;
    all_day: boolean;
    is_company_wide: boolean;
    participants: mongoose.Types.ObjectId[];
    color?: string;
    created_by: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    event_type: {
        type: String,
        enum: ['meeting', 'task', 'deadline', 'reminder', 'holiday', 'other'],
        default: 'meeting'
    },
    start_time: { type: Date, required: true },
    end_time: { type: Date },
    all_day: { type: Boolean, default: false },
    is_company_wide: { type: Boolean, default: false },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    color: { type: String },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'calendar_events'
});

CalendarEventSchema.index({ user_id: 1 });
CalendarEventSchema.index({ start_time: 1 });
CalendarEventSchema.index({ is_company_wide: 1 });

export const CalendarEvent = mongoose.model<ICalendarEvent>('CalendarEvent', CalendarEventSchema);
