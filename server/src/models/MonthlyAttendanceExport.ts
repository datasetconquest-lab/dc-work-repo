import mongoose, { Schema, Document } from 'mongoose';

export interface IMonthlyAttendanceRow {
  date: string;
  day: string;
  employee_id: string | null;
  employee_name: string;
  in_time: Date | null;
  out_time: Date | null;
}

export interface IMonthlyAttendanceExport extends Document {
  _id: mongoose.Types.ObjectId;
  month: string; // YYYY-MM
  generated_at: Date;
  generated_by?: mongoose.Types.ObjectId;
  recipients: string[];
  rows: IMonthlyAttendanceRow[];
}

const MonthlyAttendanceExportSchema = new Schema<IMonthlyAttendanceExport>({
  month: { type: String, required: true, index: true },
  generated_at: { type: Date, default: Date.now },
  generated_by: { type: Schema.Types.ObjectId, ref: 'User' },
  recipients: [{ type: String, trim: true }],
  rows: [
    {
      date: { type: String, required: true },
      day: { type: String, required: true },
      employee_id: { type: String, default: null },
      employee_name: { type: String, required: true },
      in_time: { type: Date, default: null },
      out_time: { type: Date, default: null },
    },
  ],
}, {
  collection: 'monthly_attendance_exports',
});

MonthlyAttendanceExportSchema.index({ month: 1, generated_at: -1 });

export const MonthlyAttendanceExport = mongoose.model<IMonthlyAttendanceExport>(
  'MonthlyAttendanceExport',
  MonthlyAttendanceExportSchema,
);

