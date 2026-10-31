import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { Leave } from '../models/Leave.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { toObjectId } from '../utils/objectId.js';
import { getDayOfWeek, isValidDateKey } from '../services/attendanceService.js';

const router = Router();

// Helper: generate list of date strings (inclusive) between start and end
function getDateRangeArray(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const curr = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (curr <= end) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// Sync approved leave dates to Attendance collection
async function syncLeaveAttendance(userId: any, employeeId: string, employeeName: string, startDate: string, endDate: string, isApproved: boolean) {
  try {
    const dates = getDateRangeArray(startDate, endDate);
    for (const d of dates) {
      if (getDayOfWeek(d) === 'Sunday') continue;
      if (isApproved) {
        const existing = await Attendance.findOne({ user_id: userId, date: d });
        if (existing) {
          existing.status = 'leave';
          existing.updated_at = new Date();
          await existing.save();
        } else {
          await Attendance.create({
            user_id: userId,
            employee_id: employeeId || 'N/A',
            employee_name: employeeName || 'Employee',
            date: d,
            day: getDayOfWeek(d),
            in_time: null,
            out_time: null,
            status: 'leave'
          });
        }
      } else {
        // If leave was rejected/deleted and attendance status was leave, remove or reset record
        const existing = await Attendance.findOne({ user_id: userId, date: d, status: 'leave' });
        if (existing && !existing.in_time && !existing.out_time) {
          await Attendance.deleteOne({ _id: existing._id });
        }
      }
    }
  } catch (err) {
    console.error('Error syncing leave attendance:', err);
  }
}

// GET /api/leaves - List leaves with optional filters
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = req.user.role === 'admin';
    const query: any = {};

    if (!isAdmin) {
      query.user_id = toObjectId(req.user.id);
    } else if (req.query.user_id) {
      const uId = toObjectId(String(req.query.user_id));
      if (uId) query.user_id = uId;
    }

    if (req.query.status && typeof req.query.status === 'string') {
      query.status = req.query.status;
    }

    if (req.query.month && typeof req.query.month === 'string') {
      const monthStr = req.query.month.trim(); // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(monthStr)) {
        query.$or = [
          { start_date: { $regex: `^${monthStr}` } },
          { end_date: { $regex: `^${monthStr}` } }
        ];
      }
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const leaves = await Leave.find(query)
      .sort({ start_date: -1, created_at: -1 })
      .limit(limit)
      .lean();

    const formatted = leaves.map((l) => ({
      id: l._id.toString(),
      user_id: l.user_id.toString(),
      employee_id: l.employee_id,
      employee_name: l.employee_name,
      start_date: l.start_date,
      end_date: l.end_date,
      type: l.type,
      reason: l.reason || '',
      status: l.status,
      created_at: l.created_at,
      updated_at: l.updated_at
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Error fetching leaves:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch leaves' });
  }
});

// POST /api/leaves - Create a leave record (Admin or Member)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = req.user.role === 'admin';
    const targetUserId = isAdmin && req.body.user_id ? req.body.user_id : req.user.id;
    const targetObjectId = toObjectId(targetUserId);

    if (!targetObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(targetObjectId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { start_date, end_date, type, reason, status } = req.body;

    if (!start_date || !isValidDateKey(start_date)) {
      return res.status(400).json({ error: 'Valid start date (YYYY-MM-DD) is required' });
    }

    const effectiveEnd = end_date && isValidDateKey(end_date) ? end_date : start_date;
    if (effectiveEnd < start_date) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date' });
    }

    const validTypes = ['casual', 'sick', 'paid', 'unpaid', 'half_day', 'other'];
    const leaveType = validTypes.includes(type) ? type : 'casual';

    // Status: admin can approve immediately, normal user request is pending
    const leaveStatus = isAdmin ? (status && ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved') : 'pending';

    const employeeId = (user as any).employee_id || '';
    const employeeName = (user as any).full_name || (user as any).email || 'Employee';

    const newLeave = new Leave({
      user_id: targetObjectId,
      employee_id: employeeId,
      employee_name: employeeName,
      start_date,
      end_date: effectiveEnd,
      type: leaveType,
      reason: typeof reason === 'string' ? reason.trim() : '',
      status: leaveStatus,
      created_by: toObjectId(req.user.id),
      approved_by: leaveStatus === 'approved' ? toObjectId(req.user.id) : undefined
    });

    await newLeave.save();

    if (leaveStatus === 'approved') {
      await syncLeaveAttendance(targetObjectId, employeeId, employeeName, start_date, effectiveEnd, true);
    }

    res.status(201).json({
      id: newLeave._id.toString(),
      user_id: newLeave.user_id.toString(),
      employee_id: newLeave.employee_id,
      employee_name: newLeave.employee_name,
      start_date: newLeave.start_date,
      end_date: newLeave.end_date,
      type: newLeave.type,
      reason: newLeave.reason,
      status: newLeave.status,
      created_at: newLeave.created_at,
      updated_at: newLeave.updated_at
    });
  } catch (error: any) {
    console.error('Error creating leave:', error);
    res.status(500).json({ error: error.message || 'Failed to create leave' });
  }
});

// PUT /api/leaves/:id - Update leave record
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const leaveObjectId = toObjectId(req.params.id);
    if (!leaveObjectId) return res.status(400).json({ error: 'Invalid leave ID' });

    const leave = await Leave.findById(leaveObjectId);
    if (!leave) return res.status(404).json({ error: 'Leave record not found' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = leave.user_id.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Non-admin can only edit if status is pending
    if (!isAdmin && leave.status !== 'pending') {
      return res.status(403).json({ error: 'Cannot modify a processed leave request' });
    }

    const { start_date, end_date, type, reason, status } = req.body;

    const oldStart = leave.start_date;
    const oldEnd = leave.end_date;
    const oldStatus = leave.status;

    if (start_date && isValidDateKey(start_date)) leave.start_date = start_date;
    if (end_date && isValidDateKey(end_date)) leave.end_date = end_date;
    if (leave.end_date < leave.start_date) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date' });
    }

    if (type && ['casual', 'sick', 'paid', 'unpaid', 'half_day', 'other'].includes(type)) {
      leave.type = type;
    }
    if (reason !== undefined) leave.reason = String(reason).trim();

    if (isAdmin && status && ['pending', 'approved', 'rejected'].includes(status)) {
      leave.status = status;
      if (status === 'approved') {
        leave.approved_by = toObjectId(req.user.id) || undefined;
      }
    }

    leave.updated_at = new Date();
    await leave.save();

    // Re-sync attendance if status or dates changed
    if (oldStatus === 'approved') {
      await syncLeaveAttendance(leave.user_id, leave.employee_id, leave.employee_name, oldStart, oldEnd, false);
    }
    if (leave.status === 'approved') {
      await syncLeaveAttendance(leave.user_id, leave.employee_id, leave.employee_name, leave.start_date, leave.end_date, true);
    }

    res.json({
      id: leave._id.toString(),
      user_id: leave.user_id.toString(),
      employee_id: leave.employee_id,
      employee_name: leave.employee_name,
      start_date: leave.start_date,
      end_date: leave.end_date,
      type: leave.type,
      reason: leave.reason,
      status: leave.status,
      created_at: leave.created_at,
      updated_at: leave.updated_at
    });
  } catch (error: any) {
    console.error('Error updating leave:', error);
    res.status(500).json({ error: error.message || 'Failed to update leave' });
  }
});

// DELETE /api/leaves/:id - Delete leave record
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const leaveObjectId = toObjectId(req.params.id);
    if (!leaveObjectId) return res.status(400).json({ error: 'Invalid leave ID' });

    const leave = await Leave.findById(leaveObjectId);
    if (!leave) return res.status(404).json({ error: 'Leave record not found' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = leave.user_id.toString() === req.user.id;

    if (!isAdmin && (!isOwner || leave.status !== 'pending')) {
      return res.status(403).json({ error: 'Forbidden: only admins or pending request owners can delete' });
    }

    if (leave.status === 'approved') {
      await syncLeaveAttendance(leave.user_id, leave.employee_id, leave.employee_name, leave.start_date, leave.end_date, false);
    }

    await Leave.findByIdAndDelete(leaveObjectId);

    res.json({ success: true, message: 'Leave deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting leave:', error);
    res.status(500).json({ error: error.message || 'Failed to delete leave' });
  }
});

export default router;
