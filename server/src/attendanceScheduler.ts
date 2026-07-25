import { User } from './models/User.js';
import { finalizeAttendanceForDate, getLocalDateKey, getMinutesOfDay } from './services/attendanceService.js';

let lastFinalizedDate: string | null = null;

async function emitAutoUpdateToAdmins(summary: any) {
  try {
    const { io } = await import('./server.js');
    const admins = await User.find({ role: 'admin', is_active: true }).select('_id').lean();
    for (const a of admins) {
      io.to(`user:${a._id.toString()}`).emit('attendance_auto_update', summary);
    }
  } catch (e) {
    console.error('Failed to emit attendance_auto_update:', e);
  }
}

async function tick() {
  const nowMin = getMinutesOfDay();
  const today = getLocalDateKey();

  // Auto-finalize attendance close to end-of-day (23:59) so users can
  // mark IN/OUT at any time during the day.
  if (nowMin < 23 * 60 + 59) return;
  if (lastFinalizedDate === today) return;

  try {
    const summary = await finalizeAttendanceForDate(today);
    lastFinalizedDate = today;
    await emitAutoUpdateToAdmins({ ...summary, source: 'auto_finalize' });
    console.log('[Attendance] Auto-finalized:', summary);
  } catch (e) {
    console.error('[Attendance] Auto-finalize failed:', e);
  }
}

export function startAttendanceScheduler() {
  // Run once shortly after startup, then every 5 minutes
  setTimeout(() => { tick().catch(() => { }); }, 30_000);
  setInterval(() => { tick().catch(() => { }); }, 5 * 60_000);
}

