import { Router } from 'express';
import type { Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware, adminMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { MonthlyAttendanceExport } from '../models/MonthlyAttendanceExport.js';
import { comparePassword } from '../auth.js';
import {
  deriveStatus,
  finalizeAttendanceForDate,
  getDayOfWeek,
  getLocalDateKey,
  getMinutesOfDay,
  isValidDateKey,
  isAttendanceDisabled,
  isLateAllowed,
  ATTENDANCE_IN_CUTOFF_MIN,
  ATTENDANCE_IN_CUTOFF_LABEL,
  ATTENDANCE_CUTOFF_EFFECTIVE_DATE,
} from '../services/attendanceService.js';
import { toObjectId } from '../utils/objectId.js';
import ExcelJS from 'exceljs';
import { sendEmail } from '../services/emailService.js';

const router = Router();

// M7: Configurable via env vars with sensible defaults
const MONTHLY_EXPORT_RECIPIENTS = (
  process.env.ATTENDANCE_EXPORT_RECIPIENTS || 'msc.manvith1234@gmail.com,vekatme83@gmail.com,nexusresearch2023@gmail.com'
).split(',').map(s => s.trim()).filter(Boolean);
const MONTHLY_EXPORT_TEST_RECIPIENT = process.env.ATTENDANCE_EXPORT_TEST_RECIPIENT || 'msc.manvith1234@gmail.com';

// User attendance & work analytics: daily hours per month, and monthly days/hours per year
router.get('/analytics', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const targetUserId = req.query.user_id && req.user.role === 'admin'
      ? String(req.query.user_id)
      : req.user.id;

    const userObjectId = toObjectId(targetUserId);
    if (!userObjectId) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await User.findById(userObjectId)
      .select('employee_id full_name email role created_at late_permission_dates')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const todayKey = getLocalDateKey(now);

    // Target month: YYYY-MM
    const targetMonth = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Target year: YYYY
    const targetYear = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year)
      ? parseInt(req.query.year, 10)
      : now.getFullYear();

    const [yearStr, monthStr] = targetMonth.split('-');
    const monthYear = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(monthYear, monthNum, 0).getDate();

    const startMonthKey = `${targetMonth}-01`;
    const endMonthKey = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

    // Fetch month records for this user
    const monthRecords = await Attendance.find({
      user_id: userObjectId,
      date: { $gte: startMonthKey, $lte: endMonthKey }
    }).lean();

    const monthRecordsMap = new Map<string, any>(monthRecords.map(r => [r.date, r]));

    // Build day-by-day stats
    const dailyStats: Array<{
      date: string;
      dayNumber: number;
      dayOfWeek: string;
      hours: number;
      in_time: string | null;
      out_time: string | null;
      status: string;
      is_worked: boolean;
      is_weekend: boolean;
      is_today: boolean;
      is_future: boolean;
    }> = [];

    let totalHoursMonth = 0;
    let workedDaysMonth = 0;
    let presentDaysMonth = 0;
    let lateDaysMonth = 0;
    let partialDaysMonth = 0;
    let leaveDaysMonth = 0;
    let absentDaysMonth = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${targetMonth}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = getDayOfWeek(dateKey);
      const isWeekend = dayOfWeek === 'Sunday';
      const isToday = dateKey === todayKey;
      const isFuture = dateKey > todayKey;

      const record = monthRecordsMap.get(dateKey);

      let hours = 0;
      let inTimeIso: string | null = null;
      let outTimeIso: string | null = null;

      if (record?.in_time) {
        inTimeIso = new Date(record.in_time).toISOString();
        if (record.out_time) {
          outTimeIso = new Date(record.out_time).toISOString();
          const diffMs = new Date(record.out_time).getTime() - new Date(record.in_time).getTime();
          hours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
        } else if (isToday) {
          const diffMs = Date.now() - new Date(record.in_time).getTime();
          hours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
        }
      }

      const status = record?.status || (isWeekend ? 'weekend' : isFuture ? 'future' : 'absent');
      const isWorked = ['present', 'late', 'partial'].includes(status) || hours > 0;

      if (isWorked) {
        workedDaysMonth += 1;
        totalHoursMonth += hours;
        if (status === 'present') presentDaysMonth += 1;
        else if (status === 'late') lateDaysMonth += 1;
        else if (status === 'partial') partialDaysMonth += 1;
      } else if (status === 'leave') {
        leaveDaysMonth += 1;
      } else if (status === 'absent' && !isWeekend && !isFuture) {
        absentDaysMonth += 1;
      }

      dailyStats.push({
        date: dateKey,
        dayNumber: d,
        dayOfWeek,
        hours,
        in_time: inTimeIso,
        out_time: outTimeIso,
        status,
        is_worked: isWorked,
        is_weekend: isWeekend,
        is_today: isToday,
        is_future: isFuture,
      });
    }

    totalHoursMonth = Math.round(totalHoursMonth * 10) / 10;
    const avgDailyHours = workedDaysMonth > 0
      ? Math.round((totalHoursMonth / workedDaysMonth) * 10) / 10
      : 0;

    // Monthly days & hours for the selected year (12 months)
    const yearStartKey = `${targetYear}-01-01`;
    const yearEndKey = `${targetYear}-12-31`;

    const yearRecords = await Attendance.find({
      user_id: userObjectId,
      date: { $gte: yearStartKey, $lte: yearEndKey }
    }).lean();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyStats: Array<{
      month: string;
      monthName: string;
      monthNumber: number;
      daysWorked: number;
      totalHours: number;
      presentDays: number;
      lateDays: number;
      leaveDays: number;
      absentDays: number;
      isCurrentMonth: boolean;
      isFutureMonth: boolean;
    }> = [];

    let totalDaysWorkedYear = 0;
    let totalHoursYear = 0;

    for (let m = 1; m <= 12; m++) {
      const mPrefix = `${targetYear}-${String(m).padStart(2, '0')}`;
      const isCurrentMonth = mPrefix === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const isFutureMonth = mPrefix > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const recsInMonth = yearRecords.filter(r => r.date.startsWith(mPrefix));

      let mDaysWorked = 0;
      let mTotalHours = 0;
      let mPresent = 0;
      let mLate = 0;
      let mLeave = 0;
      let mAbsent = 0;

      for (const r of recsInMonth) {
        let rHours = 0;
        if (r.in_time && r.out_time) {
          const diffMs = new Date(r.out_time).getTime() - new Date(r.in_time).getTime();
          rHours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
        } else if (r.in_time && r.date === todayKey) {
          const diffMs = Date.now() - new Date(r.in_time).getTime();
          rHours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
        }

        const worked = ['present', 'late', 'partial'].includes(r.status) || rHours > 0;
        if (worked) {
          mDaysWorked += 1;
          mTotalHours += rHours;
          if (r.status === 'present') mPresent += 1;
          else if (r.status === 'late') mLate += 1;
        } else if (r.status === 'leave') {
          mLeave += 1;
        } else if (r.status === 'absent') {
          mAbsent += 1;
        }
      }

      mTotalHours = Math.round(mTotalHours * 10) / 10;
      totalDaysWorkedYear += mDaysWorked;
      totalHoursYear += mTotalHours;

      monthlyStats.push({
        month: mPrefix,
        monthName: monthNames[m - 1],
        monthNumber: m,
        daysWorked: mDaysWorked,
        totalHours: mTotalHours,
        presentDays: mPresent,
        lateDays: mLate,
        leaveDays: mLeave,
        absentDays: mAbsent,
        isCurrentMonth,
        isFutureMonth,
      });
    }

    totalHoursYear = Math.round(totalHoursYear * 10) / 10;
    const elapsedMonths = targetYear < now.getFullYear() ? 12 : now.getMonth() + 1;
    const avgDaysPerMonth = elapsedMonths > 0
      ? Math.round((totalDaysWorkedYear / elapsedMonths) * 10) / 10
      : 0;

    res.json({
      user: {
        id: user._id.toString(),
        full_name: (user as any).full_name || '',
        employee_id: (user as any).employee_id || '',
        email: user.email
      },
      daily_chart: {
        month: targetMonth,
        year: monthYear,
        month_number: monthNum,
        days_in_month: daysInMonth,
        total_hours: totalHoursMonth,
        total_days_worked: workedDaysMonth,
        avg_hours_per_day: avgDailyHours,
        present_days: presentDaysMonth,
        late_days: lateDaysMonth,
        partial_days: partialDaysMonth,
        leave_days: leaveDaysMonth,
        absent_days: absentDaysMonth,
        days: dailyStats
      },
      monthly_chart: {
        year: targetYear,
        total_days_worked: totalDaysWorkedYear,
        total_hours: totalHoursYear,
        avg_days_per_month: avgDaysPerMonth,
        months: monthlyStats
      }
    });
  } catch (error: any) {
    console.error('Error fetching attendance analytics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

router.get('/today', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const date = getLocalDateKey();

    const userObjectId = toObjectId(req.user.id);
    if (!userObjectId) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await User.findById(userObjectId).select('employee_id full_name email late_permission_dates').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const record = await Attendance.findOne({ user_id: userObjectId, date }).lean();

    const in_time = record?.in_time || null;
    const out_time = record?.out_time || null;

    const attendance_disabled = isAttendanceDisabled((user as any).email);
    const lateAllowed = isLateAllowed(user as any, date);
    const nowMin = getMinutesOfDay();
    const cutoffActive = date >= ATTENDANCE_CUTOFF_EFFECTIVE_DATE;
    // The IN window is open before the cutoff, OR any time on a date the admin
    // granted late permission (or before the policy took effect). Once it closes
    // with no IN, the day is absent.
    const inWindowOpen = !cutoffActive || nowMin < ATTENDANCE_IN_CUTOFF_MIN || lateAllowed;

    let nextAction: 'in' | 'out' | null = null;
    let notice: string | null = null;
    if (!attendance_disabled) {
      if (!in_time) {
        if (inWindowOpen) {
          nextAction = 'in';
          if (lateAllowed && nowMin >= ATTENDANCE_IN_CUTOFF_MIN) {
            notice = `Late arrival approved by admin for today. Your check-in will be recorded as LATE.`;
          }
        } else {
          nextAction = null;
          notice = `IN window closed at ${ATTENDANCE_IN_CUTOFF_LABEL} AM. You are marked absent for today. Ask an admin to grant late permission if you informed in advance.`;
        }
      } else if (!out_time) {
        nextAction = 'out';
      }
    }

    res.json({
      date,
      employee_id: (user as any).employee_id || null,
      employee_name: (user as any).full_name || (user as any).email || '',
      day: getDayOfWeek(date),
      in_time,
      out_time,
      status: deriveStatus(in_time, out_time, { lateAllowed, dateKey: date }),
      attendance_disabled,
      can_mark_now: !attendance_disabled && nextAction !== null,
      next_action: nextAction,
      in_cutoff: ATTENDANCE_IN_CUTOFF_LABEL,
      late_permission_today: lateAllowed,
      notice,
    });
  } catch (error: any) {
    console.error('Error fetching today attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance' });
  }
});

router.post('/mark', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { employee_id, password } = req.body || {};
    if (!employee_id || !password) {
      return res.status(400).json({ error: 'Employee ID and password are required' });
    }

    const userObjectId = toObjectId(req.user.id);
    if (!userObjectId) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await User.findById(userObjectId)
      .select('employee_id full_name email password_hash is_active late_permission_dates')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    if ((user as any).is_active === false) return res.status(403).json({ error: 'User is inactive' });

    if (isAttendanceDisabled((user as any).email)) {
      return res.status(403).json({ error: 'Attendance marking is disabled for your account' });
    }

    const storedEmployeeId = ((user as any).employee_id || '').trim();
    if (!storedEmployeeId) {
      return res.status(400).json({ error: 'Employee ID not set for your account. Contact admin.' });
    }

    if (storedEmployeeId !== String(employee_id).trim()) {
      return res.status(403).json({ error: 'Employee ID does not match your account' });
    }

    const storedHash = (user as any).password_hash;
    if (!storedHash) return res.status(400).json({ error: 'No password set for this user. Contact admin.' });

    const ok = await comparePassword(String(password), storedHash);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });

    const now = new Date();
    const date = getLocalDateKey(now);
    const employeeName = (user as any).full_name || (user as any).email || 'Unknown';
    const lateAllowed = isLateAllowed(user as any, date);
    const nowMin = getMinutesOfDay(now);

    const existing = await Attendance.findOne({ user_id: userObjectId, date });
    const record = existing || new Attendance({
      user_id: userObjectId,
      employee_id: storedEmployeeId,
      employee_name: employeeName,
      date,
      day: getDayOfWeek(date),
      in_time: null,
      out_time: null,
      status: 'absent'
    });

    // Enforce strictly one IN and one OUT per day
    if (!record.in_time) {
      // Block IN after the cutoff unless admin granted late permission for today.
      // Only enforced once the policy is in effect.
      if (date >= ATTENDANCE_CUTOFF_EFFECTIVE_DATE && nowMin >= ATTENDANCE_IN_CUTOFF_MIN && !lateAllowed) {
        return res.status(403).json({
          error: `IN window closed at ${ATTENDANCE_IN_CUTOFF_LABEL} AM. You are marked absent for today. Ask an admin to grant late permission if you informed in advance.`,
        });
      }
      record.in_time = now;
    } else if (!record.out_time) {
      record.out_time = now;
    } else {
      return res.status(409).json({ error: 'Attendance already marked IN and OUT for today' });
    }

    record.employee_id = storedEmployeeId;
    record.employee_name = employeeName;
    record.status = deriveStatus(record.in_time, record.out_time, { lateAllowed, dateKey: date });
    record.updated_at = new Date();

    await record.save();

    // Realtime update for admins only
    try {
      const { io } = await import('../server.js');
      const admins = await User.find({ role: 'admin', is_active: true }).select('_id').lean();
      const payload = {
        date,
        user_id: userObjectId.toString(),
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        in_time: record.in_time,
        out_time: record.out_time,
        status: record.status,
        source: 'user_mark'
      };
      for (const a of admins) {
        io.to(`user:${a._id.toString()}`).emit('attendance_update', payload);
      }
    } catch (e) {
      console.error('Failed to emit attendance_update:', e);
    }

    return res.json({
      date,
      employee_id: record.employee_id,
      employee_name: record.employee_name,
      day: getDayOfWeek(date),
      in_time: record.in_time,
      out_time: record.out_time,
      status: record.status,
      window_marked: record.out_time ? 'out' : 'in'
    });
  } catch (error: any) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to mark attendance' });
  }
});

router.get('/admin/today', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dateParam = String(req.query.date || '').trim();
    const date = dateParam ? dateParam : getLocalDateKey();
    if (!isValidDateKey(date)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });
    }

    const todayKey = getLocalDateKey();
    const nowMin = getMinutesOfDay();
    // Finalization is still based on end-of-day, but marking attendance has no time window limits.
    const shouldFinalize = date < todayKey || (date === todayKey && nowMin >= 23 * 60 + 59);

    if (shouldFinalize) {
      await finalizeAttendanceForDate(date);
    }

    const usersAll = await User.find({ is_active: true })
      .select('_id employee_id full_name email role late_permission_dates created_at')
      .sort({ full_name: 1, email: 1 })
      .lean();

    // Exclude accounts that are configured as "view-only" (no attendance required)
    const users = usersAll.filter((u: any) => !isAttendanceDisabled(u.email));

    const userIds = users.map(u => u._id);
    const records = await Attendance.find({ date, user_id: { $in: userIds } }).lean();
    const recordByUserId = new Map<string, any>(records.map(r => [r.user_id.toString(), r]));

    const rows = users
      // Hide users who had not joined yet on this date (created later and no record)
      .filter(u => {
        if (recordByUserId.has(u._id.toString())) return true;
        const createdKey = (u as any).created_at ? getLocalDateKey(new Date((u as any).created_at)) : null;
        return !createdKey || date >= createdKey;
      })
      .map(u => {
      const r = recordByUserId.get(u._id.toString());
      const in_time = r?.in_time || null;
      const out_time = r?.out_time || null;
      const lateAllowed = isLateAllowed(u as any, date);
      let status: any = r?.status;
      if (!status || status === 'absent') {
        status = deriveStatus(in_time, out_time, { lateAllowed, dateKey: date });
      }
      return {
        user_id: u._id.toString(),
        employee_id: (u as any).employee_id || r?.employee_id || null,
        employee_name: (u as any).full_name || (u as any).email || r?.employee_name || '',
        date,
        day: r?.day || getDayOfWeek(date),
        in_time,
        out_time,
        status,
        late_permission: lateAllowed,
      };
    });

    res.json({ date, rows });
  } catch (error: any) {
    console.error('Error fetching admin attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance' });
  }
});

// Admin-only: Create or update attendance record (time CRUD)
router.post('/admin/record', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, date, in_time, out_time, status, late_permission } = req.body;
    if (!user_id || !date || !isValidDateKey(date)) {
      return res.status(400).json({ error: 'user_id and valid date (YYYY-MM-DD) are required' });
    }

    const userObjectId = toObjectId(user_id);
    if (!userObjectId) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await User.findById(userObjectId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Handle late_permission update on user if requested
    if (typeof late_permission === 'boolean') {
      const dates = Array.isArray(user.late_permission_dates) ? [...user.late_permission_dates] : [];
      if (late_permission && !dates.includes(date)) {
        dates.push(date);
        dates.sort();
        user.late_permission_dates = dates;
        await user.save();
      } else if (!late_permission && dates.includes(date)) {
        user.late_permission_dates = dates.filter((d: string) => d !== date);
        await user.save();
      }
    }

    const lateAllowed = isLateAllowed(user as any, date);

    let parsedIn: Date | null = null;
    let parsedOut: Date | null = null;

    if (in_time) {
      parsedIn = new Date(in_time);
      if (isNaN(parsedIn.getTime())) {
        parsedIn = new Date(`${date}T${in_time}:00`);
      }
      if (isNaN(parsedIn.getTime())) parsedIn = null;
    }

    if (out_time) {
      parsedOut = new Date(out_time);
      if (isNaN(parsedOut.getTime())) {
        parsedOut = new Date(`${date}T${out_time}:00`);
      }
      if (isNaN(parsedOut.getTime())) parsedOut = null;
    }

    let resolvedStatus = status;
    if (!resolvedStatus || !['present', 'partial', 'absent', 'late', 'leave'].includes(resolvedStatus)) {
      resolvedStatus = deriveStatus(parsedIn, parsedOut, { lateAllowed, dateKey: date });
    }

    const existing = await Attendance.findOne({ user_id: userObjectId, date });
    const record = existing || new Attendance({
      user_id: userObjectId,
      date,
      day: getDayOfWeek(date),
    });

    record.employee_id = (user as any).employee_id || 'N/A';
    record.employee_name = (user as any).full_name || (user as any).email || 'Employee';
    record.in_time = parsedIn;
    record.out_time = parsedOut;
    record.status = resolvedStatus;
    record.updated_at = new Date();
    await record.save();

    // Broadcast attendance update via Socket.IO
    try {
      const { io } = await import('../server.js');
      const admins = await User.find({ role: 'admin', is_active: true }).select('_id').lean();
      const payload = {
        date,
        user_id: userObjectId.toString(),
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        in_time: record.in_time,
        out_time: record.out_time,
        status: record.status,
        source: 'admin_edit'
      };
      for (const a of admins) {
        io.to(`user:${a._id.toString()}`).emit('attendance_update', payload);
      }
    } catch (e) {
      console.error('Failed to emit attendance_update:', e);
    }

    res.json({
      success: true,
      record: {
        id: record._id.toString(),
        user_id: record.user_id.toString(),
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        date: record.date,
        day: record.day,
        in_time: record.in_time,
        out_time: record.out_time,
        status: record.status,
      }
    });
  } catch (error: any) {
    console.error('Error saving admin attendance record:', error);
    res.status(500).json({ error: error.message || 'Failed to save attendance record' });
  }
});

// Admin-only: Delete / reset an attendance record
router.delete('/admin/record', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, date, id } = req.query;
    const filter: any = {};
    if (id) {
      filter._id = toObjectId(String(id));
    } else if (user_id && date) {
      filter.user_id = toObjectId(String(user_id));
      filter.date = String(date);
    } else {
      return res.status(400).json({ error: 'id or (user_id and date) required' });
    }

    await Attendance.deleteOne(filter);

    // Broadcast update
    try {
      const { io } = await import('../server.js');
      io.emit('attendance_auto_update', { date: String(date || '') });
    } catch {}

    res.json({ success: true, message: 'Attendance record deleted/reset' });
  } catch (error: any) {
    console.error('Error deleting attendance record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete attendance record' });
  }
});

// Admin-only: monthly worked-day counts by employee.
router.get('/admin/monthly-working-days', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const monthParam = String(req.query.month || '').trim();
    const targetMonth = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthNumber = parseInt(monthStr, 10);
    if (Number.isNaN(year) || Number.isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    const monthIndex = monthNumber - 1;
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const trackedEnd = targetMonth === currentMonth && now < monthEnd ? now : monthEnd;

    const startKey = getLocalDateKey(monthStart);
    const endKey = getLocalDateKey(monthEnd);

    const trackedDateKeys: string[] = [];
    for (let d = new Date(monthStart); d <= trackedEnd; d.setDate(d.getDate() + 1)) {
      const dateKey = getLocalDateKey(new Date(d));
      if (getDayOfWeek(dateKey) !== 'Sunday') {
        trackedDateKeys.push(dateKey);
      }
    }

    const todayKey = getLocalDateKey(now);
    const finalizableDateKeys = trackedDateKeys.filter((dateKey) => dateKey < todayKey);
    for (const dateKey of finalizableDateKeys) {
      await finalizeAttendanceForDate(dateKey);
    }

    const usersAll = await User.find({ is_active: true })
      .select('_id employee_id full_name email late_permission_dates created_at')
      .sort({ full_name: 1, email: 1 })
      .lean();

    const users = usersAll.filter((u: any) => !isAttendanceDisabled(u.email));
    const userIds = users.map(u => u._id);

    const records = await Attendance.find({
      user_id: { $in: userIds },
      date: { $gte: startKey, $lte: endKey },
    }).lean();

    const recordsByUser = new Map<string, any[]>();
    for (const record of records) {
      const uid = record.user_id.toString();
      if (!recordsByUser.has(uid)) recordsByUser.set(uid, []);
      recordsByUser.get(uid)!.push(record);
    }

    const rows = users.map((u) => {
      const uid = u._id.toString();
      const userRecords = recordsByUser.get(uid) || [];
      const recordsByDate = new Map<string, any>(userRecords.map((record) => [record.date, record]));

      // A user is only tracked from their effective start = the earlier of their
      // account-creation date and their first real check-in. Days before that are
      // not counted (the user had not joined), so newer employees aren't penalised
      // with phantom absences for dates before their account existed.
      const createdKey = (u as any).created_at ? getLocalDateKey(new Date((u as any).created_at)) : null;
      let firstRealKey: string | null = null;
      for (const record of userRecords) {
        if ((record.in_time || record.out_time) && (!firstRealKey || record.date < firstRealKey)) {
          firstRealKey = record.date;
        }
      }
      const startKey = [createdKey, firstRealKey].filter(Boolean).sort()[0] || null;

      let present_days = 0;
      let partial_days = 0;
      let late_days = 0;
      let absent_records = 0;
      const leave_dates: string[] = [];
      const partial_dates: string[] = [];
      const late_dates: string[] = [];

      for (const dateKey of trackedDateKeys) {
        if (startKey && dateKey < startKey) continue; // before the user joined
        const record = recordsByDate.get(dateKey);
        const lateAllowed = isLateAllowed(u as any, dateKey);
        if (record?.status === 'leave') {
          leave_dates.push(dateKey);
          continue;
        }
        const status = record?.status && ['present', 'partial', 'late'].includes(record.status)
          ? record.status
          : deriveStatus(record?.in_time || null, record?.out_time || null, { lateAllowed, dateKey });
        if (status === 'present') present_days += 1;
        else if (status === 'late') {
          late_days += 1;
          late_dates.push(dateKey);
        } else if (status === 'partial') {
          partial_days += 1;
          partial_dates.push(dateKey);
        } else if (status === 'leave') {
          leave_dates.push(dateKey);
        } else if (dateKey !== todayKey) {
          absent_records += 1;
          leave_dates.push(dateKey);
        }
      }

      return {
        user_id: uid,
        employee_id: (u as any).employee_id || null,
        employee_name: (u as any).full_name || (u as any).email || '',
        worked_days: present_days + partial_days + late_days,
        present_days,
        partial_days,
        late_days,
        absent_records,
        leave_dates,
        partial_dates,
        late_dates,
      };
    });

    rows.sort((a, b) => {
      if (b.worked_days !== a.worked_days) return b.worked_days - a.worked_days;
      return a.employee_name.localeCompare(b.employee_name);
    });

    res.json({
      month: targetMonth,
      start_date: startKey,
      end_date: endKey,
      tracked_days: trackedDateKeys.length,
      rows,
    });
  } catch (error: any) {
    console.error('Error fetching monthly working days:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch monthly working days' });
  }
});

// Admin-only: generate monthly attendance export, email it as Excel, and store snapshot in DB.
router.post('/admin/monthly-export', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const now = new Date();
    const { month, test } = req.body || {};
    const targetMonth: string = typeof month === 'string' && month.trim()
      ? month.trim()
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0); // last day of month

    // Collect all days in the month as date keys
    const dateKeys: string[] = [];
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      dateKeys.push(getLocalDateKey(new Date(d)));
    }

    // Fetch all active users (exclude view-only accounts)
    const usersAll = await User.find({ is_active: true })
      .select('_id employee_id full_name email')
      .sort({ full_name: 1, email: 1 })
      .lean();

    const users = usersAll.filter((u: any) => !isAttendanceDisabled(u.email));

    const userIds = users.map(u => u._id);

    // Fetch all attendance records for the month
    const records = await Attendance.find({
      user_id: { $in: userIds },
      date: { $gte: dateKeys[0], $lte: dateKeys[dateKeys.length - 1] },
    }).lean();

    const recordsByUserAndDate = new Map<string, any>();
    for (const r of records) {
      recordsByUserAndDate.set(`${r.user_id.toString()}|${r.date}`, r);
    }

    // Build table rows: Date, Day, Employee ID, Name, In Time, Out Time
    const rows: {
      date: string;
      day: string;
      employee_id: string | null;
      employee_name: string;
      in_time: Date | null;
      out_time: Date | null;
    }[] = [];

    for (const dateKey of dateKeys) {
      const day = getDayOfWeek(dateKey);

      for (const u of users) {
        const uid = u._id.toString();
        const rec = recordsByUserAndDate.get(`${uid}|${dateKey}`);
        const in_time: Date | null = rec?.in_time || null;
        const out_time: Date | null = rec?.out_time || null;

        rows.push({
          date: dateKey,
          day,
          employee_id: (u as any).employee_id || rec?.employee_id || null,
          employee_name: (u as any).full_name || (u as any).email || rec?.employee_name || 'Unknown',
          in_time,
          out_time,
        });
      }
    }

    // Save snapshot in DB
    const exportDoc = new MonthlyAttendanceExport({
      month: targetMonth,
      generated_at: new Date(),
      generated_by: new mongoose.Types.ObjectId(req.user.id),
      recipients: test ? [MONTHLY_EXPORT_TEST_RECIPIENT] : MONTHLY_EXPORT_RECIPIENTS,
      rows,
    });
    await exportDoc.save();

    // Generate Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Day', key: 'day', width: 12 },
      { header: 'Employee ID', key: 'employee_id', width: 15 },
      { header: 'Name', key: 'employee_name', width: 28 },
      { header: 'In Time', key: 'in_time', width: 18 },
      { header: 'Out Time', key: 'out_time', width: 18 },
    ];

    for (const r of rows) {
      worksheet.addRow({
        date: r.date,
        day: r.day,
        employee_id: r.employee_id || '',
        employee_name: r.employee_name,
        in_time: r.in_time ? r.in_time.toLocaleTimeString() : '',
        out_time: r.out_time ? r.out_time.toLocaleTimeString() : '',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const fromAddress = process.env.MAIL_FROM || 'manvith.dataconquest@outlook.com';

    const recipients = test ? [MONTHLY_EXPORT_TEST_RECIPIENT] : MONTHLY_EXPORT_RECIPIENTS;

    const subject = `Monthly Attendance Export - ${targetMonth}`;
    const text = `Attached is the monthly attendance report for ${targetMonth}.\n\nThis report includes: Date, Day, Employee ID, Name, In Time, and Out Time.`;

    const info = await sendEmail({
      from: fromAddress,
      to: recipients,
      subject,
      text,
      attachments: [
        {
          filename: `attendance-${targetMonth}.xlsx`,
          content: Buffer.from(buffer),
        },
      ],
    });

    res.json({
      message: 'Monthly attendance export generated and emailed',
      month: targetMonth,
      recipients,
      export_id: exportDoc._id.toString(),
      email: {
        provider: 'sendgrid',
        raw: info,
      },
    });
  } catch (error: any) {
    console.error('Error generating monthly attendance export:', error);
    res.status(500).json({ error: error.message || 'Failed to generate monthly export' });
  }
});

export default router;
