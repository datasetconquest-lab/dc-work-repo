import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { dataAPI, authAPI, API_BASE_URL } from '../lib/api';
import { useNotifications } from '../components/Notifications';
import { Calendar, Users, CheckSquare, Activity, TrendingUp, ListTodo, Plus, Trash2, Check, Lock } from 'lucide-react';
import { getStoredAuth } from '../lib/authStorage';


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

interface TodoItem {
  id: string;
  text: string;
  is_done: boolean;
  struck_by_name?: string | null;
  struck_at?: string | null;
  created_at: string;
}

interface TodayAttendance {
  date: string;
  day: string;
  employee_id: string | null;
  employee_name: string;
  in_time: string | null;
  out_time: string | null;
  status: 'present' | 'partial' | 'absent' | 'late';
  attendance_disabled?: boolean;
  can_mark_now: boolean;
  next_action: 'in' | 'out' | null;
  in_cutoff?: string | null;
  late_permission_today?: boolean;
  notice?: string | null;
}

export function Profile() {
  const { user, isAdmin, refreshProfile } = useAuth();
  const { showSuccess, showError, NotificationContainer } = useNotifications();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
  const attendanceDisabledByPolicy = ['venkat.dataconquest@outlook.com', 'swathi.dataconquest@outlook.com']
    .includes((email || '').trim().toLowerCase());
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState<TodayAttendance | null>(null);
  const [attendanceEmployeeId, setAttendanceEmployeeId] = useState('');
  const [attendancePassword, setAttendancePassword] = useState('');
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [todoBusy, setTodoBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
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

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const p = await dataAPI.getUserProfile(user.id);
        setFullName(p.full_name || '');
        setAvatarUrl(p.avatar_url || '');
        setEmail(p.email || '');
        // Map internal role codes to human-friendly labels
        const roleLabel = p.role === 'tl'
          ? 'Team Lead'
          : p.role === 'admin'
            ? 'Admin'
            : p.role === 'manager'
              ? 'Manager'
              : 'Member';
        setRole(roleLabel);
      } catch (e) {
        console.error('Failed to load profile', e);
        showError('Failed to load profile');
      }
    };
    load();

    const loadAttendance = async () => {
      if (!user) return;
      try {
        const a = await dataAPI.getAttendanceToday();
        setAttendance({
          date: a.date,
          day: a.day,
          employee_id: a.employee_id ?? null,
          employee_name: a.employee_name || '',
          in_time: a.in_time ? new Date(a.in_time).toISOString() : null,
          out_time: a.out_time ? new Date(a.out_time).toISOString() : null,
          status: a.status,
          attendance_disabled: !!a.attendance_disabled,
          can_mark_now: !!a.can_mark_now,
          next_action: a.next_action || null,
          in_cutoff: a.in_cutoff || null,
          late_permission_today: !!a.late_permission_today,
          notice: a.notice || null,
        });
        setAttendanceEmployeeId(a.employee_id || '');
      } catch (e: any) {
        console.error('Failed to load attendance', e);
      }
    };

    loadAttendance();
    loadTodos();

    if (isAdmin) {
      loadDashboardData();
      const interval = setInterval(loadDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

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
      title: 'Company Tasks',
      value: stats.taskCounts.total,
      icon: CheckSquare,
      color: 'purple',
      subtext: `${stats.taskCounts.completed} completed`
    },
    {
      title: 'Pending Tasks',
      value: stats.taskCounts.pending,
      icon: Activity,
      color: 'orange',
      subtext: 'Awaiting action'
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
      color: 'green'
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

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await dataAPI.updateUserProfile(user.id, {
        full_name: fullName,
        avatar_url: avatarUrl || null,
      });
      showSuccess('Profile updated successfully!');
    } catch (e: any) {
      showError(e.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAttendance = async () => {
    if (!attendanceEmployeeId.trim() || !attendancePassword) {
      showError('Employee ID and password are required');
      return;
    }

    setMarkingAttendance(true);
    try {
      await dataAPI.markAttendance({
        employee_id: attendanceEmployeeId.trim(),
        password: attendancePassword,
      });
      const a = await dataAPI.getAttendanceToday();
      setAttendance({
        date: a.date,
        day: a.day,
        employee_id: a.employee_id ?? null,
        employee_name: a.employee_name || '',
        in_time: a.in_time ? new Date(a.in_time).toISOString() : null,
        out_time: a.out_time ? new Date(a.out_time).toISOString() : null,
        status: a.status,
        attendance_disabled: !!a.attendance_disabled,
        can_mark_now: !!a.can_mark_now,
        next_action: a.next_action || null,
        in_cutoff: a.in_cutoff || null,
        late_permission_today: !!a.late_permission_today,
        notice: a.notice || null,
      });
      setAttendancePassword('');
      showSuccess('Attendance marked successfully');
    } catch (e: any) {
      showError(e.message || 'Failed to mark attendance');
    } finally {
      setMarkingAttendance(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      showError('Enter your current and new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New password and confirmation do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      showSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      showError(e.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const loadTodos = async () => {
    if (!user) return;
    try {
      const data = await dataAPI.getMyTodos();
      setTodos(data || []);
    } catch (e) {
      console.error('Failed to load to-do list', e);
    }
  };

  const handleAddTodo = async () => {
    const text = newTodo.trim();
    if (!text) return;
    setTodoBusy(true);
    try {
      const created = await dataAPI.createTodo(text);
      setTodos((prev) => [created, ...prev]);
      setNewTodo('');
    } catch (e: any) {
      showError(e.message || 'Failed to add to-do item');
    } finally {
      setTodoBusy(false);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      await dataAPI.deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      showError(e.message || 'Failed to remove to-do item');
    }
  };

  // Only admins can strike items off (or restore them).
  const handleToggleStrike = async (id: string, nextDone: boolean) => {
    try {
      const updated = await dataAPI.strikeTodo(id, nextDone);
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
    } catch (e: any) {
      showError(e.message || 'Failed to update to-do item');
    }
  };

  return (
    <Layout>
      <NotificationContainer />

      <div className="max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Update your personal details</p>
        </div>

        {/* Profile Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="grid md:grid-cols-2 gap-8 p-8">
            {/* Personal Information */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Personal Information</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Role
                    </label>
                    <input
                      type="text"
                      value={role}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed capitalize"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Attendance */}
              <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Attendance</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Mark IN before {attendance?.in_cutoff || '09:30'} AM and OUT any time before end of day.
                  Missing IN by {attendance?.in_cutoff || '09:30'} AM is marked absent — inform an admin in advance if you'll be late.
                </p>

                {(attendance?.attendance_disabled || attendanceDisabledByPolicy) && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-sm text-blue-800">
                    Attendance marking is disabled for this admin account. You can still view daily attendance in the admin dashboard.
                  </div>
                )}

                {attendance?.notice && (
                  <div className={`mb-4 p-3 rounded-lg border text-sm ${
                    attendance.next_action === null && !attendance.in_time
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800 text-red-800 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  }`}>
                    {attendance.notice}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Employee ID</label>
                    <input
                      type="text"
                      value={attendanceEmployeeId}
                      onChange={(e) => setAttendanceEmployeeId(e.target.value)}
                      disabled={attendance?.attendance_disabled || attendanceDisabledByPolicy}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your Employee ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Password</label>
                    <input
                      type="password"
                      value={attendancePassword}
                      onChange={(e) => setAttendancePassword(e.target.value)}
                      disabled={attendance?.attendance_disabled || attendanceDisabledByPolicy}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <button
                  onClick={handleMarkAttendance}
                  disabled={
                    markingAttendance ||
                    (attendance?.attendance_disabled || attendanceDisabledByPolicy) ||
                    (attendance ? !attendance.can_mark_now : false)
                  }
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {markingAttendance ? 'Marking...' : 'Enter Attendance'}
                </button>

                <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 text-sm">
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">Today:</span>{' '}
                      {attendance ? `${attendance.date} (${attendance.day})` : '—'}
                    </div>
                    <div className="text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">Status:</span>{' '}
                      <span className="font-bold">{attendance?.status?.toUpperCase() || '—'}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-300">
                      {attendance?.can_mark_now
                        ? attendance.next_action === 'in'
                          ? 'Next action: Mark IN'
                          : 'Next action: Mark OUT'
                        : attendance?.in_time
                          ? 'IN and OUT already marked for today'
                          : `IN window closed (after ${attendance?.in_cutoff || '09:30'} AM)`}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <div className="text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">IN Time:</span>{' '}
                      {attendance?.in_time ? new Date(attendance.in_time).toLocaleTimeString() : '—'}
                    </div>
                    <div className="text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">OUT Time:</span>{' '}
                      {attendance?.out_time ? new Date(attendance.out_time).toLocaleTimeString() : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notification Settings */}
              <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  System Notifications
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Check if your browser and OS are correctly configured to receive instant alerts.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      if (!('Notification' in window)) {
                        alert('Your browser does not support desktop notifications.');
                        return;
                      }

                      const permission = await Notification.requestPermission();
                      if (permission === 'granted') {
                        const title = 'Test Notification';
                        const options = {
                          body: 'If you can see this, OS notifications are working correctly!',
                          icon: 'https://ui-avatars.com/api/?name=DC&background=0284c7&color=fff',
                          badge: '/favicon.ico',
                          tag: 'test'
                        };

                        // Try SW first
                        const registration = await navigator.serviceWorker?.getRegistration();
                        if (registration) {
                          await registration.showNotification(title, options);
                          showSuccess('Test notification sent via Service Worker!');
                        } else {
                          new Notification(title, options);
                          showSuccess('Test notification sent!');
                        }
                      } else {
                        showError(`Permission ${permission}. Please check browser/OS privacy settings.`);
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    Send Test OS Notification
                  </button>
                </div>
              </div>
            </div>

            {/* Profile Image */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Profile Image</h2>

              <div className="flex flex-col items-center space-y-4">
                <div className="w-48 h-48 rounded-full overflow-hidden bg-gray-200 border-4 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-6xl">
                      {fullName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>

                <div className="w-full space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      UPLOAD IMAGE
                    </label>
                    <label className="flex items-center justify-center w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{uploadingAvatar ? 'Uploading…' : 'Choose File'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingAvatar}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !user) return;

                          if (file.size > 5 * 1024 * 1024) {
                            showError('File size must be less than 5MB');
                            return;
                          }

                          setUploadingAvatar(true);
                          try {
                            const formData = new FormData();
                            formData.append('image', file);

                            const token = getStoredAuth()?.token;
                            const res = await fetch(`${API_BASE_URL}/upload`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`
                              },
                              body: formData
                            });

                            if (!res.ok) {
                              const errorData = await res.json().catch(() => ({}));
                              throw new Error(errorData.error || 'Upload failed');
                            }

                            const data = await res.json();
                            // Persist the new photo immediately so it updates
                            // everywhere without a separate Save step.
                            await dataAPI.updateUserProfile(user.id, { avatar_url: data.url });
                            setAvatarUrl(data.url);
                            await refreshProfile();
                            showSuccess('Profile photo updated!');
                          } catch (err: any) {
                            console.error('Upload Error Details:', err);
                            showError(`Upload Error: ${err.message || 'Failed to upload image'}`);
                          } finally {
                            setUploadingAvatar(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or use URL</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Image URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Change Password</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
            Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Current Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">New Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Confirm New Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleChangePassword(); } }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="mt-5 bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {changingPassword ? 'Updating…' : 'Update Password'}
          </button>
        </div>

        {/* To-Do List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="flex items-center gap-2 mb-1">
            <ListTodo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My To-Do List</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
            {isAdmin
              ? "Add items and strike them off as they're completed."
              : 'Your to-do list is managed by an admin. You can view your items and their status here.'}
          </p>

          {/* Add item — admin only */}
          {isAdmin && (
            <div className="flex gap-2 mb-5">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTodo(); } }}
                maxLength={500}
                placeholder="Add a to-do item…"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleAddTodo}
                disabled={todoBusy || !newTodo.trim()}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}

          {/* Items */}
          {todos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{isAdmin ? 'No to-do items yet. Add one above.' : 'No to-do items yet.'}</p>
          ) : (
            <ul className="space-y-2">
              {todos.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40"
                >
                  {/* Strike control — admins only; others see a read-only status */}
                  {isAdmin ? (
                    <button
                      onClick={() => handleToggleStrike(t.id, !t.is_done)}
                      title={t.is_done ? 'Restore item' : 'Strike off'}
                      className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        t.is_done
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-300 dark:border-gray-500 hover:border-green-500'
                      }`}
                    >
                      {t.is_done && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span
                      title={t.is_done ? 'Struck off by admin' : 'Pending — an admin will strike this off'}
                      className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                        t.is_done ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 dark:border-gray-500'
                      }`}
                    >
                      {t.is_done && <Check className="w-3.5 h-3.5" />}
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm break-words ${t.is_done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                      {t.text}
                    </p>
                    {t.is_done && t.struck_by_name && (
                      <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5">
                        Struck off by {t.struck_by_name}
                      </p>
                    )}
                  </div>

                  {/* Only admins can remove items */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteTodo(t.id)}
                      title="Remove"
                      className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Admin Dashboard Stats */}
        {isAdmin && stats && (
          <div className="space-y-6">
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Dashboard Overview</h2>
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
          </div>
        )}
      </div>
    </Layout>
  );
}