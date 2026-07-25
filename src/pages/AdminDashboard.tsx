import { useEffect, useState } from 'react';
import { Users, CheckSquare, Activity, TrendingUp, Calendar, MessageSquare, BarChart3, RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { dataAPI } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import { getStoredAuth } from '../lib/authStorage';

function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalMonthInputValue(date = new Date()): string {
  return getLocalDateInputValue(date).slice(0, 7);
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
  status: 'present' | 'partial' | 'absent' | 'late';
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
  const [attendanceDate, setAttendanceDate] = useState<string>('');
  // Initialize with today's date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateInputValue();
  }); // For date picker (YYYY-MM-DD)
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getLocalMonthInputValue());
  const [workingDaysSummary, setWorkingDaysSummary] = useState<MonthlyWorkingDaysSummary | null>(null);
  const [workingDaysLoading, setWorkingDaysLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      // Load users
      const users = await dataAPI.getAllUsers();
      const totalUsers = users?.length || 0;
      const activeUsers = (users || []).filter((u: any) => u.is_active !== false).length;

      // Load task counts (company tasks only)
      const taskCounts = await dataAPI.getTaskCounts();

      setStats({
        totalUsers,
        activeUsers,
        totalGroups: 0, // TODO: Add API endpoint
        totalMessages: 0, // TODO: Add API endpoint
        taskCounts: {
          total: parseInt(taskCounts.total) || 0,
          pending: parseInt(taskCounts.pending) || 0,
          started: parseInt(taskCounts.started) || 0,
          processing: parseInt(taskCounts.processing) || 0,
          review: parseInt(taskCounts.review) || 0,
          completed: parseInt(taskCounts.completed) || 0,
        },
        upcomingEvents: 0, // TODO: Add API endpoint
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

  useEffect(() => {
    loadDashboardData();
    // Load attendance for the selected date (defaults to today)
    loadAttendance(selectedDate);

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Reload attendance when selectedDate changes
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

  // Realtime attendance updates (admins only page)
  useEffect(() => {
    // Get base URL for Socket.IO (remove /api if present)
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
      // Only update if viewing today's attendance
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
      // Auto-finalize can mark a bunch of users absent/partial/present → simplest is to refetch
      if (!summary?.date) return;
      if (summary.date.startsWith(selectedMonth)) {
        loadMonthlyWorkingDays(selectedMonth);
      }
      // Only auto-refresh if viewing today's attendance
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, attendanceDate, selectedMonth]);

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
  const todayDateKey = getLocalDateInputValue();

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Overview of organizational activity and metrics</p>
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

        {/* Monthly Working Days */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Monthly Working Days</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Present and partial attendance days by employee.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={getLocalMonthInputValue()}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => loadMonthlyWorkingDays(selectedMonth || undefined)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300"
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

        {/* Attendance (Realtime) */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {selectedDate === todayDateKey ? 'Today Attendance' : 'Attendance'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedDate === todayDateKey
                  ? 'Live updates as users mark attendance. Auto-absent finalizes after 23:59.'
                  : 'View attendance for the selected date.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={todayDateKey}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => loadAttendance(selectedDate || undefined)}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-medium"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 text-sm">
            <div className="text-gray-600 dark:text-gray-300">
              Date:{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {attendanceDate
                  ? `${attendanceDate} (${new Date(attendanceDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })})`
                  : '—'}
              </span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">Employees can mark IN/OUT at any time during the day.</div>
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
                    <th className="py-2 pr-4 font-semibold">Employee</th>
                    <th className="py-2 pr-4 font-semibold">Employee ID</th>
                    <th className="py-2 pr-4 font-semibold">IN Time</th>
                    <th className="py-2 pr-4 font-semibold">OUT Time</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {attendanceRows.map((r) => (
                    <tr key={r.user_id} className="text-gray-700 dark:text-gray-200">
                      <td className="py-3 pr-4 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
                        {r.employee_name || '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs">
                        {r.employee_id || '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.in_time ? new Date(r.in_time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.out_time ? new Date(r.out_time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                            r.status === 'present'
                              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800'
                              : r.status === 'late'
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800'
                                : r.status === 'partial'
                                  ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-100 dark:border-yellow-800'
                                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800'
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {attendanceRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-gray-500 dark:text-gray-400">
                        No attendance records to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
