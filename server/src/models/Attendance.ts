import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceStatus = 'present' | 'partial' | 'absent' | 'late';

export interface IAttendance extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  employee_id: string;
  employee_name: string;
  /**
   * Server-local date key in YYYY-MM-DD format
   */
  date: string;
  /**
   * Human-readable day-of-week (e.g. "Monday").
   * This is stored redundantly for easier reporting/exports.
   */
  day: string;
  /**
   * First timestamp when the employee marked attendance for the day.
   * This represents the IN time.
   */
  in_time?: Date | null;
  /**
   * Second timestamp when the employee marked attendance for the day.
   * This represents the OUT time.
   */
  out_time?: Date | null;
  status: AttendanceStatus;
  created_at: Date;
  updated_at: Date;
}

const AttendanceSchema = new Schema<IAttendance>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employee_id: { type: String, required: true, trim: true, index: true },
  employee_name: { type: String, required: true, trim: true },
  date: { type: String, required: true, index: true },
  day: { type: String, required: true, trim: true },
  in_time: { type: Date, default: null },
  out_time: { type: Date, default: null },
  status: { type: String, enum: ['present', 'partial', 'absent', 'late'], default: 'absent', index: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'attendance'
});

AttendanceSchema.index({ user_id: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: 1, status: 1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);

