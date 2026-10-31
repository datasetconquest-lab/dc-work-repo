import mongoose, { Schema, Document } from 'mongoose';

export type LeaveType = 'casual' | 'sick' | 'paid' | 'unpaid' | 'half_day' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface ILeave extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  employee_id: string;
  employee_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  type: LeaveType;
  reason?: string;
  status: LeaveStatus;
  approved_by?: mongoose.Types.ObjectId;
  created_by?: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const LeaveSchema = new Schema<ILeave>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employee_id: { type: String, trim: true, default: '' },
  employee_name: { type: String, trim: true, default: '' },
  start_date: { type: String, required: true, index: true },
  end_date: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['casual', 'sick', 'paid', 'unpaid', 'half_day', 'other'],
    default: 'casual'
  },
  reason: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
    index: true
  },
  approved_by: { type: Schema.Types.ObjectId, ref: 'User' },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'leaves'
});

LeaveSchema.index({ user_id: 1, start_date: 1, end_date: 1 });
LeaveSchema.index({ status: 1, start_date: 1 });

export const Leave = mongoose.model<ILeave>('Leave', LeaveSchema);
