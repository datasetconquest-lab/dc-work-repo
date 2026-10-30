import { useEffect, useState } from 'react';
import {
  Users, CheckSquare, Activity, TrendingUp, Calendar, MessageSquare, BarChart3,
  RefreshCw, Plus, Pencil, Trash2, Clock, Check, X, FileText, ShieldCheck
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { dataAPI } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import { getStoredAuth } from '../lib/authStorage';
import { useNotifications } from '../components/Notifications';

function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalMonthInputValue(date = new Date()): string {
  return getLocalDateInputValue(date).slice(0, 7);
}

function formatDuration(inTime: string | null, outTime: string | null): string {
  if (!inTime) return '—';
  const start = new Date(inTime).getTime();
  const end = outTime ? new Date(outTime).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end < start) return '—';
  const diffMs = end - start;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

function getLocalTimeString(isoDate: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalGroups: number;
  totalMessages: number;
  taskCounts: {
    total: number;
    pending: number;
    started: number;
    processing: number;
    review: number;
    completed: number;
  };
  upcomingEvents: number;
}

interface AttendanceRow {
  user_id: string;
  employee_id: string | null;
  employee_name: string;
  date: string;
  day: string;
  in_time: string | null;
  out_time: string | null;
  status: 'present' | 'partial' | 'absent' | 'late' | 'leave';
  late_permission?: boolean;
}

interface MonthlyWorkingDaysRow {
  user_id: string;
  employee_id: string | null;
  employee_name: string;
  worked_days: number;
  present_days: number;
  partial_days: number;
  late_days: number;
  absent_records: number;
  leave_dates: string[];
  partial_dates: string[];
  late_dates: string[];
}

interface MonthlyWorkingDaysSummary {
  month: string;
  start_date: string;
  end_date: string;
  tracked_days: number;
  rows: MonthlyWorkingDaysRow[];
}

interface LeaveRecord {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  type: 'casual' | 'sick' | 'paid' | 'unpaid' | 'half_day' | 'other';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

function formatAttendanceDateList(dates: string[]): string {
  if (!dates.length) return 'None';
  return dates
    .map((date) => {
      const day = Number(date.slice(-2));
      return Number.isFinite(day) ? String(day) : date;
    })
    .join(', ');
}

export function AdminDashboard() {
  const { showSuccess, showError, NotificationContainer } = useNotifications();

  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalGroups: 0,
    totalMessages: 0,
    taskCounts: {
      total: 0,
      pending: 0,
      started: 0,
      processing: 0,
      review: 0,
      completed: 0,
    },
    upcomingEvents: 0,
  });
  const [loading, setLoading] = useState(true);

  // Users lookup list for forms
  const [allUsersList, setAllUsersList] = useState<{ id: string; email: string; full_name: string; employee_id?: string }[]>([]);

  // Attendance states
  const [attendanceDate, setAttendanceDate] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateInputValue());
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Edit / Log Attendance Modals
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRow | null>(null);
  const [attendanceEditForm, setAttendanceEditForm] = useState({
    in_time: '',
    out_time: '',
    status: '',
    late_permission: false
  });
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({
    user_id: '',
    date: getLocalDateInputValue(),
    in_time: '09:00',
    out_time: '19:00',
    status: 'present',
    late_permission: false
  });

  // Monthly working days
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getLocalMonthInputValue());
  const [workingDaysSummary, setWorkingDaysSummary] = useState<MonthlyWorkingDaysSummary | null>(null);
  const [workingDaysLoading, setWorkingDaysLoading] = useState(true);

  // Leave Management states
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<string>('all');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);
  const [savingLeave, setSavingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    user_id: '',
    start_date: getLocalDateInputValue(),
    end_date: getLocalDateInputValue(),
    type: 'casual',
    reason: '',
    status: 'approved'
  });

  const loadDashboardData = async () => {
    try {
      const users = await dataAPI.getAllUsers();
      const totalUsers = users?.length || 0;
      const activeUsers = (users || []).filter((u: any) => u.is_active !== false).length;
      setAllUsersList((users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name || u.email,
        employee_id: u.employee_id || ''
      })));

      const taskCounts = await dataAPI.getTaskCounts();

      setStats({
        totalUsers,
        activeUsers,
        totalGroups: 0,
        totalMessages: 0,
        taskCounts: {
          total: parseInt(taskCounts.total) || 0,
          pending: parseInt(taskCounts.pending) || 0,
          started: parseInt(taskCounts.started) || 0,
          processing: parseInt(taskCounts.processing) || 0,
          review: parseInt(taskCounts.review) || 0,
          completed: parseInt(taskCounts.completed) || 0,
        },
        upcomingEvents: 0,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendance = async (date?: string) => {
    setAttendanceLoading(true);
    try {
      const data = await dataAPI.adminGetAttendanceToday(date);
      setAttendanceDate(data?.date || date || '');
      setAttendanceRows((data?.rows || []).map((r: any) => ({
        user_id: r.user_id,
        employee_id: r.employee_id ?? null,
        employee_name: r.employee_name || '',
        date: r.date,
        day: r.day,
        in_time: r.in_time ? new Date(r.in_time).toISOString() : null,
        out_time: r.out_time ? new Date(r.out_time).toISOString() : null,
        status: r.status,
        late_permission: !!r.late_permission,
      })));
    } catch (e) {
      console.error('Error loading attendance:', e);
      setAttendanceRows([]);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadMonthlyWorkingDays = async (month?: string) => {
    setWorkingDaysLoading(true);
    try {
      const data = await dataAPI.adminGetMonthlyWorkingDays(month);
      setWorkingDaysSummary({
        month: data?.month || month || '',
        start_date: data?.start_date || '',
        end_date: data?.end_date || '',
        tracked_days: Number(data?.tracked_days || 0),
        rows: (data?.rows || []).map((r: any) => ({
          user_id: r.user_id,
          employee_id: r.employee_id ?? null,
          employee_name: r.employee_name || '',
          worked_days: Number(r.worked_days || 0),
          present_days: Number(r.present_days || 0),
          partial_days: Number(r.partial_days || 0),
          late_days: Number(r.late_days || 0),
          absent_records: Number(r.absent_records || 0),
          leave_dates: Array.isArray(r.leave_dates) ? r.leave_dates : [],
          partial_dates: Array.isArray(r.partial_dates) ? r.partial_dates : [],
          late_dates: Array.isArray(r.late_dates) ? r.late_dates : [],
        })),
      });
    } catch (e) {
      console.error('Error loading monthly working days:', e);
      setWorkingDaysSummary(null);
    } finally {
      setWorkingDaysLoading(false);
    }
  };

  const loadLeaves = async () => {
    setLeavesLoading(true);
    try {
      const params: any = {};
      if (leaveStatusFilter !== 'all') params.status = leaveStatusFilter;
      const data = await dataAPI.getLeaves(params);
      setLeaves(data || []);
    } catch (e: any) {
      console.error('Error loading leaves:', e);
      setLeaves([]);
    } finally {
      setLeavesLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadAttendance(selectedDate);
    loadLeaves();

    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadAttendance(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (selectedMonth) {
      loadMonthlyWorkingDays(selectedMonth);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadLeaves();
  }, [leaveStatusFilter]);

  // Realtime attendance updates
  useEffect(() => {
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    baseUrl = baseUrl.replace(/\/api\/?$/, '');

    const socket: Socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      const auth = getStoredAuth();
      if (auth?.token) socket.emit('authenticate', auth.token);
    });

    const handleAttendanceUpdate = (payload: any) => {
      if (!payload?.date || !payload?.user_id) return;
      if (payload.date.startsWith(selectedMonth)) {
        loadMonthlyWorkingDays(selectedMonth);
      }
      const today = getLocalDateInputValue();
      if (selectedDate !== today || (attendanceDate && payload.date !== attendanceDate)) return;

      setAttendanceRows((prev) => {
        const idx = prev.findIndex((r) => r.user_id === payload.user_id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          employee_id: payload.employee_id ?? next[idx].employee_id,
          employee_name: payload.employee_name ?? next[idx].employee_name,
          in_time: payload.in_time ? new Date(payload.in_time).toISOString() : next[idx].in_time,
          out_time: payload.out_time ? new Date(payload.out_time).toISOString() : next[idx].out_time,
          status: payload.status ?? next[idx].status,
        };
        return next;
      });
    };

    const handleAutoUpdate = (summary: any) => {
      if (!summary?.date) return;
      if (summary.date.startsWith(selectedMonth)) {
        loadMonthlyWorkingDays(selectedMonth);
      }
      const today = getLocalDateInputValue();
      if (selectedDate !== today || (attendanceDate && summary.date !== attendanceDate)) return;
      loadAttendance(selectedDate || summary.date);
    };

    socket.on('attendance_update', handleAttendanceUpdate);
    socket.on('attendance_auto_update', handleAutoUpdate);

    return () => {
      socket.off('attendance_update', handleAttendanceUpdate);
      socket.off('attendance_auto_update', handleAutoUpdate);
      socket.disconnect();
    };
  }, [selectedDate, attendanceDate, selectedMonth]);

  // Attendance CRUD Handlers
  const openEditAttendance = (row: AttendanceRow) => {
    setEditingAttendance(row);
    setAttendanceEditForm({
      in_time: getLocalTimeString(row.in_time),
      out_time: getLocalTimeString(row.out_time),
      status: row.status,
      late_permission: !!row.late_permission
    });
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendance) return;
    setSavingAttendance(true);
    try {
      await dataAPI.adminSaveAttendanceRecord({
        user_id: editingAttendance.user_id,
        date: editingAttendance.date,
        in_time: attendanceEditForm.in_time ? `${editingAttendance.date}T${attendanceEditForm.in_time}:00` : null,
        out_time: attendanceEditForm.out_time ? `${editingAttendance.date}T${attendanceEditForm.out_time}:00` : null,
        status: attendanceEditForm.status || undefined,
        late_permission: attendanceEditForm.late_permission
      });
      showSuccess(`Attendance updated for ${editingAttendance.employee_name}`);
      setEditingAttendance(null);
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to update attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleToggleLatePermission = async (row: AttendanceRow) => {
    try {
      const nextLate = !row.late_permission;
      await dataAPI.adminSaveAttendanceRecord({
        user_id: row.user_id,
        date: row.date,
        in_time: row.in_time,
        out_time: row.out_time,
        late_permission: nextLate
      });
      showSuccess(`${nextLate ? 'Granted' : 'Revoked'} late permission for ${row.employee_name}`);
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to update late permission');
    }
  };

  const handleDeleteAttendance = async (row: AttendanceRow) => {
    if (!window.confirm(`Reset/delete attendance record for ${row.employee_name} on ${row.date}?`)) return;
    try {
      await dataAPI.adminDeleteAttendanceRecord({ user_id: row.user_id, date: row.date });
      showSuccess('Attendance record reset successfully');
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to reset attendance record');
    }
  };

  const handleCreateAttendanceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logForm.user_id) {
      showError('Please select an employee');
      return;
    }
    setSavingAttendance(true);
    try {
      await dataAPI.adminSaveAttendanceRecord({
        user_id: logForm.user_id,
        date: logForm.date,
        in_time: logForm.in_time ? `${logForm.date}T${logForm.in_time}:00` : null,
        out_time: logForm.out_time ? `${logForm.date}T${logForm.out_time}:00` : null,
        status: logForm.status || undefined,
        late_permission: logForm.late_permission
      });
      showSuccess('Attendance logged successfully');
      setShowLogModal(false);
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to log attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Leave CRUD Handlers
  const openAddLeave = () => {
    setEditingLeave(null);
    setLeaveForm({
      user_id: allUsersList[0]?.id || '',
      start_date: getLocalDateInputValue(),
      end_date: getLocalDateInputValue(),
      type: 'casual',
      reason: '',
      status: 'approved'
    });
    setShowLeaveModal(true);
  };

  const openEditLeave = (leave: LeaveRecord) => {
    setEditingLeave(leave);
    setLeaveForm({
      user_id: leave.user_id,
      start_date: leave.start_date,
      end_date: leave.end_date,
      type: leave.type,
      reason: leave.reason || '',
      status: leave.status
    });
    setShowLeaveModal(true);
  };

  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLeave(true);
    try {
      if (editingLeave) {
        await dataAPI.updateLeave(editingLeave.id, leaveForm);
        showSuccess('Leave record updated successfully');
      } else {
        await dataAPI.createLeave(leaveForm);
        showSuccess('Leave record created successfully');
      }
      setShowLeaveModal(false);
      await loadLeaves();
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to save leave');
    } finally {
      setSavingLeave(false);
    }
  };

  const handleQuickStatusLeave = async (leave: LeaveRecord, nextStatus: 'approved' | 'rejected') => {
    try {
      await dataAPI.updateLeave(leave.id, { status: nextStatus });
      showSuccess(`Leave marked as ${nextStatus}`);
      await loadLeaves();
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to update leave status');
    }
  };

  const handleDeleteLeave = async (leave: LeaveRecord) => {
    if (!window.confirm(`Delete leave record for ${leave.employee_name} (${leave.start_date} to ${leave.end_date})?`)) return;
    try {
      await dataAPI.deleteLeave(leave.id);
      showSuccess('Leave record deleted');
      await loadLeaves();
      await loadAttendance(selectedDate);
      await loadMonthlyWorkingDays(selectedMonth);
    } catch (err: any) {
      showError(err.message || 'Failed to delete leave');
    }
  };

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'blue',
      subtext: `${stats.activeUsers} active`
    },
    {
      title: 'Groups',
      value: stats.totalGroups,
      icon: MessageSquare,
      color: 'green'
    },
    {
      title: 'Company Tasks',
      value: stats.taskCounts.total,
      icon: CheckSquare,
      color: 'purple',
      subtext: `${stats.taskCounts.completed} completed`
    },
    {
      title: 'In Progress',
      value: stats.taskCounts.started + stats.taskCounts.processing + stats.taskCounts.review,
      icon: Activity,
      color: 'blue',
      subtext: `${stats.taskCounts.review} awaiting approval`
    },
    {
      title: 'Upcoming Events',
      value: stats.upcomingEvents,
      icon: Calendar,
      color: 'red'
    },
    {
      title: 'Task Completion',
      value: stats.taskCounts.total > 0
        ? `${Math.round((stats.taskCounts.completed / stats.taskCounts.total) * 100)}%`
        : '0%',
      icon: TrendingUp,
      color: 'teal'
    },
  ];

  const workingDaysRows = workingDaysSummary?.rows || [];
  const maxWorkedDays = Math.max(1, ...workingDaysRows.map((row) => row.worked_days));

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <NotificationContainer />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Overview of organizational metrics, attendance, and leave management</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((card) => {
            const Icon = card.icon;
            const colorClasses: Record<string, string> = {
              blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
              green: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
              orange: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
              purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
              red: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
              teal: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400',
            };

            return (
              <div
                key={card.title}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{card.title}</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">{card.value}</p>
                    {card.subtext && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{card.subtext}</p>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg ${colorClasses[card.color] || colorClasses.blue}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Task Status Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Company Task Status Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Pending</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.taskCounts.pending}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Started</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">{stats.taskCounts.started}</p>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
              <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Processing</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-200">{stats.taskCounts.processing}</p>
            </div>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">In Review</p>
              <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{stats.taskCounts.review}</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400 mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-200">{stats.taskCounts.completed}</p>
            </div>
          </div>
        </div>

        {/* CONTAINER 1: Attendance Time & Late Access Management (Admin Alone CRUD) */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Attendance Time & Late Access Management
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                  Admin Control Only
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Access and correct IN/OUT times, override statuses, and manage late permissions. Changes automatically update employee working calculations.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowLogModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Log Attendance
              </button>
              <button
                onClick={() => loadAttendance(selectedDate || undefined)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300"
                title="Refresh attendance"
              >
                <RefreshCw className={`w-4 h-4 ${attendanceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 text-sm">
            <div className="text-gray-600 dark:text-gray-300">
              Date:{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {attendanceDate
                  ? `${attendanceDate} (${new Date(attendanceDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })})`
                  : selectedDate}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Standard IN cutoff: 09:30 AM. Late permission allows check-in after cutoff without auto-absent.
            </div>
          </div>

          {attendanceLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                    <th className="py-2.5 pr-4 font-semibold">Employee</th>
                    <th className="py-2.5 pr-4 font-semibold">Employee ID</th>
                    <th className="py-2.5 pr-4 font-semibold">IN Time</th>
                    <th className="py-2.5 pr-4 font-semibold">OUT Time</th>
                    <th className="py-2.5 pr-4 font-semibold">Working Hours</th>
                    <th className="py-2.5 pr-4 font-semibold">Status</th>
                    <th className="py-2.5 pr-4 font-semibold">Late Access</th>
                    <th className="py-2.5 pr-2 font-semibold text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {attendanceRows.map((r) => (
                    <tr key={r.user_id} className="text-gray-700 dark:text-gray-200 hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                      <td className="py-3 pr-4 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
                        {r.employee_name || '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs">
                        {r.employee_id || '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.in_time ? (
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {new Date(r.in_time).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Not marked</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.out_time ? (
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {new Date(r.out_time).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Not marked</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-300">
                        {formatDuration(r.in_time, r.out_time)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.status === 'present'
                              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800'
                              : r.status === 'late'
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800'
                                : r.status === 'partial'
                                  ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-100 dark:border-yellow-800'
                                  : r.status === 'leave'
                                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800'
                                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800'
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleLatePermission(r)}
                          title="Toggle late arrival permission for this date"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            r.late_permission
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{r.late_permission ? 'Approved' : 'Standard'}</span>
                        </button>
                      </td>
                      <td className="py-3 pr-2 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditAttendance(r)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-blue-50 hover:border-blue-300 text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-colors"
                            title="Edit Attendance Time & Status"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteAttendance(r)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-red-50 hover:border-red-300 text-gray-600 dark:text-gray-300 hover:text-red-600 transition-colors"
                            title="Reset Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {attendanceRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-500 dark:text-gray-400">
                        No attendance records to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CONTAINER 2: Leave Management CRUD */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Leave Management</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Full CRUD access to review, create, modify, and approve employee leaves.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                {['all', 'pending', 'approved', 'rejected'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setLeaveStatusFilter(s)}
                    className={`px-3 py-2 font-semibold capitalize transition-colors ${
                      leaveStatusFilter === s
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                onClick={openAddLeave}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Leave
              </button>
              <button
                onClick={loadLeaves}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 text-gray-600 dark:text-gray-300"
                title="Refresh leaves"
              >
                <RefreshCw className={`w-4 h-4 ${leavesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {leavesLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                    <th className="py-2.5 pr-4 font-semibold">Employee</th>
                    <th className="py-2.5 pr-4 font-semibold">Duration / Dates</th>
                    <th className="py-2.5 pr-4 font-semibold">Type</th>
                    <th className="py-2.5 pr-4 font-semibold">Reason</th>
                    <th className="py-2.5 pr-4 font-semibold">Status</th>
                    <th className="py-2.5 pr-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {leaves.map((l) => (
                    <tr key={l.id} className="text-gray-700 dark:text-gray-200 hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{l.employee_name || '—'}</p>
                        <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{l.employee_id || 'UNASSIGNED'}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-800 dark:text-gray-200">
                          {l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`}
                        </div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className="capitalize px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {l.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs max-w-xs truncate text-gray-600 dark:text-gray-300" title={l.reason}>
                        {l.reason || '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize ${
                            l.status === 'approved'
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                              : l.status === 'rejected'
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 pr-2 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {l.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleQuickStatusLeave(l, 'approved')}
                                className="p-1.5 rounded-lg border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                title="Approve Leave"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleQuickStatusLeave(l, 'rejected')}
                                className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                title="Reject Leave"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => openEditLeave(l)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-blue-50 text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-colors"
                            title="Edit Leave"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLeave(l)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-red-50 text-gray-600 dark:text-gray-300 hover:text-red-600 transition-colors"
                            title="Delete Leave"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-500 dark:text-gray-400">
                        No leave records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CONTAINER 3: Monthly Working Days & Leaves Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Monthly Working Days</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Present, partial, late, and approved leaves by employee.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={getLocalMonthInputValue()}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => loadMonthlyWorkingDays(selectedMonth || undefined)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 text-gray-600 dark:text-gray-300"
                title="Refresh monthly working days"
              >
                <RefreshCw className={`w-4 h-4 ${workingDaysLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Month</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{workingDaysSummary?.month || selectedMonth || '-'}</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3">
              <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">Employees Tracked</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-200">{workingDaysRows.length}</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/30 p-3">
              <p className="text-xs font-semibold uppercase text-green-600 dark:text-green-400">Tracked Days</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-200">{workingDaysSummary?.tracked_days || 0}</p>
            </div>
          </div>

          {workingDaysLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : workingDaysRows.length === 0 ? (
            <div className="py-10 text-center text-gray-500 dark:text-gray-400">No monthly attendance records to show.</div>
          ) : (
            <div className="space-y-4">
              {workingDaysRows.map((row) => {
                const width = row.worked_days > 0
                  ? `${Math.max(3, Math.round((row.worked_days / maxWorkedDays) * 100))}%`
                  : '0%';
                return (
                  <div key={row.user_id} className="grid grid-cols-1 lg:grid-cols-[220px_1fr_120px] gap-2 lg:gap-4 lg:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{row.employee_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{row.employee_id || 'UNASSIGNED'}</p>
                    </div>
                    <div>
                      <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{ width }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.present_days} full days, {row.partial_days} partial days, {row.late_days} late days
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Leaves - {formatAttendanceDateList(row.leave_dates)}
                        <span className="mx-1 text-gray-300">|</span>
                        Partial - {formatAttendanceDateList(row.partial_dates)}
                        <span className="mx-1 text-gray-300">|</span>
                        Late - {formatAttendanceDateList(row.late_dates)}
                      </p>
                    </div>
                    <div className="lg:text-right">
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{row.worked_days}</span>
                      <span className="ml-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">days</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Edit Attendance Record */}
      {editingAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Edit Attendance Time</h3>
                <p className="text-xs text-gray-500">{editingAttendance.employee_name} ({editingAttendance.date})</p>
              </div>
              <button onClick={() => setEditingAttendance(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveAttendance} className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">IN Time (HH:mm)</label>
                  <input
                    type="time"
                    value={attendanceEditForm.in_time}
                    onChange={(e) => setAttendanceEditForm({ ...attendanceEditForm, in_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">OUT Time (HH:mm)</label>
                  <input
                    type="time"
                    value={attendanceEditForm.out_time}
                    onChange={(e) => setAttendanceEditForm({ ...attendanceEditForm, out_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status Override</label>
                <select
                  value={attendanceEditForm.status}
                  onChange={(e) => setAttendanceEditForm({ ...attendanceEditForm, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700 capitalize"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="partial">Partial</option>
                  <option value="leave">Leave</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="editLatePerm"
                  checked={attendanceEditForm.late_permission}
                  onChange={(e) => setAttendanceEditForm({ ...attendanceEditForm, late_permission: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="editLatePerm" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Grant Late Arrival Permission for this date
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEditingAttendance(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAttendance}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {savingAttendance ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Log / Create Attendance */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Log Employee Attendance</h3>
              <button onClick={() => setShowLogModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreateAttendanceLog} className="p-5 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Select Employee</label>
                <select
                  required
                  value={logForm.user_id}
                  onChange={(e) => setLogForm({ ...logForm, user_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                >
                  <option value="">-- Choose Employee --</option>
                  {allUsersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.employee_id || u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={logForm.date}
                  onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">IN Time</label>
                  <input
                    type="time"
                    value={logForm.in_time}
                    onChange={(e) => setLogForm({ ...logForm, in_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">OUT Time</label>
                  <input
                    type="time"
                    value={logForm.out_time}
                    onChange={(e) => setLogForm({ ...logForm, out_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={logForm.status}
                  onChange={(e) => setLogForm({ ...logForm, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700 capitalize"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="partial">Partial</option>
                  <option value="leave">Leave</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="logLatePerm"
                  checked={logForm.late_permission}
                  onChange={(e) => setLogForm({ ...logForm, late_permission: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="logLatePerm" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Grant Late Arrival Permission
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAttendance}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {savingAttendance ? 'Logging...' : 'Log Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add / Edit Leave */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">
                {editingLeave ? 'Edit Leave Record' : 'Add Employee Leave'}
              </h3>
              <button onClick={() => setShowLeaveModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveLeave} className="p-5 space-y-4 text-sm">
              {!editingLeave && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Employee</label>
                  <select
                    required
                    value={leaveForm.user_id}
                    onChange={(e) => setLeaveForm({ ...leaveForm, user_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  >
                    <option value="">-- Choose Employee --</option>
                    {allUsersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.employee_id || u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Leave Type</label>
                  <select
                    value={leaveForm.type}
                    onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700 capitalize"
                  >
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="paid">Paid Leave</option>
                    <option value="unpaid">Unpaid Leave</option>
                    <option value="half_day">Half Day</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={leaveForm.status}
                    onChange={(e) => setLeaveForm({ ...leaveForm, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700 capitalize"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason / Notes</label>
                <textarea
                  rows={3}
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="Optional reason for leave..."
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700 resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLeave}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {savingLeave ? 'Saving...' : editingLeave ? 'Update Leave' : 'Create Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
