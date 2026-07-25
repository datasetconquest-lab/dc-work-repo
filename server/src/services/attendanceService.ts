import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { User } from '../models/User.js';

// Configurable via env var, fallback to known admin accounts
const disabledRaw = process.env.ATTENDANCE_DISABLED_EMAILS || 'venkat.dataconquest@outlook.com,swathi.dataconquest@outlook.com';
export const ATTENDANCE_DISABLED_EMAILS = new Set<string>(
  disabledRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

export function isAttendanceDisabled(email: string | undefined | null): boolean {
  if (!email) return false;
  return ATTENDANCE_DISABLED_EMAILS.has(String(email).trim().toLowerCase());
}

// Attendance is tracked in India Standard Time. IST is a fixed UTC+5:30 offset
// (India observes no DST), so we shift the epoch and read UTC fields. This makes
// date keys and the IN cutoff correct regardless of the host's timezone — the
// production server (Render) runs in UTC, so relying on host-local time would be
// wrong. Override with ATTENDANCE_TZ_OFFSET_MIN only if the org ever changes TZ.
export const ATTENDANCE_TZ_OFFSET_MIN = Number(process.env.ATTENDANCE_TZ_OFFSET_MIN) || (5 * 60 + 30);

function toZoned(d: Date): Date {
  return new Date(d.getTime() + ATTENDANCE_TZ_OFFSET_MIN * 60_000);
}

export function getLocalDateKey(d: Date = new Date()): string {
  const z = toZoned(d);
  const yyyy = z.getUTCFullYear();
  const mm = String(z.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(z.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getMinutesOfDay(d: Date = new Date()): number {
  const z = toZoned(d);
  return z.getUTCHours() * 60 + z.getUTCMinutes();
}

// Daily IN cutoff. A user must mark IN before this time (server-local) or they
// are marked absent for the day, unless an admin granted them late permission
// for that date. Defaults to 09:30 (570 minutes); override with env var.
export const ATTENDANCE_IN_CUTOFF_MIN = Number(process.env.ATTENDANCE_IN_CUTOFF_MIN) || (9 * 60 + 30);

// Human-readable cutoff, e.g. "09:30", for surfacing in API responses/messages.
export const ATTENDANCE_IN_CUTOFF_LABEL = `${String(Math.floor(ATTENDANCE_IN_CUTOFF_MIN / 60)).padStart(2, '0')}:${String(ATTENDANCE_IN_CUTOFF_MIN % 60).padStart(2, '0')}`;

// The 9:30 cutoff / auto-absent / late policy only applies to dates on or after
// this effective date. Attendance recorded before the policy existed must never
// be retroactively downgraded to absent just because the check-in was late.
export const ATTENDANCE_CUTOFF_EFFECTIVE_DATE = process.env.ATTENDANCE_CUTOFF_EFFECTIVE_DATE || '2026-07-01';

/**
 * Whether the given user has admin-granted permission to arrive late on the
 * given server-local date (YYYY-MM-DD).
 */
export function isLateAllowed(user: { late_permission_dates?: string[] } | null | undefined, dateKey: string): boolean {
  if (!user || !Array.isArray(user.late_permission_dates)) return false;
  return user.late_permission_dates.includes(dateKey);
}

export interface DeriveStatusOptions {
  /** True when the user has late permission for this date. */
  lateAllowed?: boolean;
  /**
   * Server-local date key (YYYY-MM-DD) of the record. The cutoff/late policy is
   * only enforced on or after ATTENDANCE_CUTOFF_EFFECTIVE_DATE; omitting this (or
   * a date before it) uses the legacy in/out rule and never marks late as absent.
   */
  dateKey?: string;
}

export function deriveStatus(
  inTime: Date | null | undefined,
  outTime: Date | null | undefined,
  opts: DeriveStatusOptions = {}
): 'present' | 'partial' | 'absent' | 'late' {
  const hasIn = !!inTime;
  const hasOut = !!outTime;

  // No check-in at all: absent (an OUT-only record is still partial for legacy data).
  if (!hasIn) return hasOut ? 'partial' : 'absent';

  // Legacy / pre-policy dates: a check-in always counts, regardless of time.
  const cutoffActive = !opts.dateKey || opts.dateKey >= ATTENDANCE_CUTOFF_EFFECTIVE_DATE;
  if (!cutoffActive) return hasOut ? 'present' : 'partial';

  const inMin = getMinutesOfDay(inTime as Date);

  // Checked in before the cutoff → normal on-time attendance.
  if (inMin < ATTENDANCE_IN_CUTOFF_MIN) return hasOut ? 'present' : 'partial';

  // Checked in at/after the cutoff: only valid with admin late permission.
  if (opts.lateAllowed) return 'late';
  return 'absent';
}

export function isValidDateKey(dateKey: string): boolean {
  // Basic YYYY-MM-DD validation (not timezone-aware)
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

export function getDayOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map((x) => parseInt(x, 10));
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

export async function finalizeAttendanceForDate(dateKey: string): Promise<{
  date: string;
  created: number;
  updated: number;
  present: number;
  partial: number;
  absent: number;
  late: number;
}> {
  const usersAll = await User.find({ is_active: true })
    .select('_id employee_id full_name email late_permission_dates created_at')
    .lean();

  // Exclude view-only accounts from attendance tracking
  const users = usersAll.filter((u: any) => !isAttendanceDisabled(u.email));

  const userIds = users.map(u => u._id);
  const records = await Attendance.find({ date: dateKey, user_id: { $in: userIds } }).lean();
  const recordByUserId = new Map<string, any>(records.map(r => [r.user_id.toString(), r]));

  let created = 0;
  let updated = 0;
  let present = 0;
  let partial = 0;
  let absent = 0;
  let late = 0;

  const bulk = Attendance.collection.initializeUnorderedBulkOp();
  let bulkOps = 0;

  const day = getDayOfWeek(dateKey);

  for (const u of users) {
    const uid = u._id.toString();
    const existing = recordByUserId.get(uid);

    // Skip users who had not joined yet on this date (account created later and
    // no real record exists) — they must not be auto-marked absent for days
    // before they were part of the organization.
    const createdKey = (u as any).created_at ? getLocalDateKey(new Date((u as any).created_at)) : null;
    if (!existing && createdKey && dateKey < createdKey) continue;

    const inTime = existing?.in_time ?? null;
    const outTime = existing?.out_time ?? null;
    const lateAllowed = isLateAllowed(u as any, dateKey);
    const status = deriveStatus(inTime, outTime, { lateAllowed, dateKey });

    if (status === 'present') present++;
    else if (status === 'late') late++;
    else if (status === 'partial') partial++;
    else absent++;

    const employeeId = (u as any).employee_id || existing?.employee_id || 'UNASSIGNED';
    const employeeName = (u as any).full_name || (u as any).email || existing?.employee_name || 'Unknown';

    if (!existing) {
      created++;
      bulk.insert({
        user_id: new mongoose.Types.ObjectId(uid),
        employee_id: employeeId,
        employee_name: employeeName,
        date: dateKey,
        day,
        in_time: null,
        out_time: null,
        status,
        created_at: new Date(),
        updated_at: new Date(),
      });
      bulkOps++;
    } else if (existing.status !== status || existing.employee_id !== employeeId || existing.employee_name !== employeeName || existing.day !== day) {
      updated++;
      bulk.find({ _id: existing._id }).updateOne({
        $set: {
          employee_id: employeeId,
          employee_name: employeeName,
          day,
          status,
          updated_at: new Date(),
        }
      });
      bulkOps++;
    }
  }

  if (bulkOps > 0) {
    await bulk.execute();
  }

  return { date: dateKey, created, updated, present, partial, absent, late };
}

