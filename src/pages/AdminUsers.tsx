import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { dataAPI } from '../lib/api';
import { Search, User, RefreshCw, Shield, Home, Building2, AlertTriangle, ChevronRight, X, Clock, ListTodo, Check, Trash2, Plus, Pencil } from 'lucide-react';
import { useNotifications } from '../components/Notifications';

const OFFICE_IP = '103.218.112.0/24';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  employee_id?: string | null;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  restrict_by_ip: boolean;
  allowed_ips: string | null;
  ip_last_login?: string | null;
  late_permission_dates?: string[];
  created_at?: string;
  updated_at?: string;
}

interface TodoItem {
  id: string;
  text: string;
  is_done: boolean;
  struck_by_name?: string | null;
  struck_at?: string | null;
  created_at: string;
}

interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'started' | 'processing' | 'review' | 'completed' | 'cancelled';
  due_date: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  assigned_to_name?: string | null;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  task_type?: 'personal' | 'company';
  completion_results?: string | null;
  completion_values?: string | null;
  completion_summary?: string | null;
  created_at: string;
}

export function AdminUsers() {
  const { showSuccess, showError, NotificationContainer } = useNotifications();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [filter, setFilter] = useState('');
  const [wfhIpInput, setWfhIpInput] = useState('');
  const [employeeIdInput, setEmployeeIdInput] = useState('');
  const [latePermDate, setLatePermDate] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'completed'>('all');
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [userTodos, setUserTodos] = useState<TodoItem[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [newUserTodo, setNewUserTodo] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const isWFHEnabled = useMemo(() => {
    if (!selectedUser?.allowed_ips) return false;
    const ips = selectedUser.allowed_ips.split(',').map(i => i.trim());
    return ips.length > 1 || (ips.length === 1 && ips[0] !== OFFICE_IP);
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, filter]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await dataAPI.getAllUsers();
      setUsers(data || []);
      if (!selectedUserId && data?.length) setSelectedUserId(data[0].id);
    } catch (e: any) {
      console.error('Failed to load users', e);
      showError(e.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadTasks = async (userId: string) => {
    setLoadingTasks(true);
    try {
      const data = await dataAPI.getTasks({ related_user: userId });
      setTasks(data || []);
    } catch (e: any) {
      console.error('Failed to load tasks', e);
      showError(e.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserTodos = async (userId: string) => {
    setLoadingTodos(true);
    try {
      const data = await dataAPI.getUserTodos(userId);
      setUserTodos(data || []);
    } catch (e: any) {
      console.error('Failed to load to-do list', e);
      setUserTodos([]);
    } finally {
      setLoadingTodos(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      loadTasks(selectedUserId);
      loadUserTodos(selectedUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const toggleStrikeTodo = async (id: string, nextDone: boolean) => {
    try {
      const updated = await dataAPI.strikeTodo(id, nextDone);
      setUserTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
      showSuccess(nextDone ? 'Item struck off' : 'Item restored');
    } catch (e: any) {
      showError(e.message || 'Failed to update to-do item');
    }
  };

  const deleteUserTodo = async (id: string) => {
    try {
      await dataAPI.deleteTodo(id);
      setUserTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      showError(e.message || 'Failed to remove to-do item');
    }
  };

  const addUserTodo = async () => {
    const text = newUserTodo.trim();
    if (!text || !selectedUserId) return;
    setAddingTodo(true);
    try {
      const created = await dataAPI.createTodo(text, selectedUserId);
      setUserTodos((prev) => [created, ...prev]);
      setNewUserTodo('');
    } catch (e: any) {
      showError(e.message || 'Failed to add to-do item');
    } finally {
      setAddingTodo(false);
    }
  };

  const editUserTodo = async (id: string, current: string) => {
    const next = window.prompt('Edit to-do item', current);
    if (next === null) return;
    const text = next.trim();
    if (!text || text === current) return;
    try {
      const updated = await dataAPI.updateTodo(id, text);
      setUserTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
    } catch (e: any) {
      showError(e.message || 'Failed to update to-do item');
    }
  };

  useEffect(() => {
    setEmployeeIdInput(selectedUser?.employee_id ? String(selectedUser.employee_id) : '');
  }, [selectedUser?.employee_id]);

  const handleUpdateUser = async (updates: Partial<Profile>) => {
    if (!selectedUserId) return;
    try {
      await dataAPI.updateUserProfile(selectedUserId, updates);
      showSuccess('User updated successfully');
      setUsers(users.map(u => u.id === selectedUserId ? { ...u, ...updates } : u));
    } catch (e: any) {
      showError(e.message || 'Update failed');
    }
  };

  const enableWFH = async () => {
    if (!wfhIpInput.trim()) {
      showError('Please enter the user\'s home/current IP address');
      return;
    }
    const cleanIp = wfhIpInput.trim();
    const newAllowedIps = `${OFFICE_IP}, ${cleanIp}`;
    await handleUpdateUser({
      allowed_ips: newAllowedIps,
      restrict_by_ip: true
    });
    setWfhIpInput('');
  };

  const disableWFH = async () => {
    await handleUpdateUser({
      allowed_ips: OFFICE_IP,
      restrict_by_ip: true
    });
  };

  const addLatePermission = async () => {
    if (!selectedUser) return;
    const d = latePermDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      showError('Pick a valid date');
      return;
    }
    const current = selectedUser.late_permission_dates || [];
    if (current.includes(d)) {
      showError('Late permission already granted for that date');
      return;
    }
    const next = [...current, d].sort();
    await handleUpdateUser({ late_permission_dates: next });
    setLatePermDate('');
  };

  const removeLatePermission = async (d: string) => {
    if (!selectedUser) return;
    const next = (selectedUser.late_permission_dates || []).filter((x) => x !== d);
    await handleUpdateUser({ late_permission_dates: next });
  };

  return (
    <Layout>
      <NotificationContainer />
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Control access, IP restrictions, and WFH status</p>
          </div>
          <button
            onClick={loadUsers}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* User List Sidebar - STICKY */}
          <div className="w-full lg:w-80 shrink-0 sticky top-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-[calc(100vh-180px)] overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loadingUsers ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-2/3" />
                          <div className="h-2 bg-gray-50 dark:bg-gray-700/50 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex items-center gap-3 relative group ${selectedUserId === u.id ? 'bg-blue-50/50' : ''
                          }`}
                      >
                        {selectedUserId === u.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                        )}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${selectedUserId === u.id ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600'
                          }`}>
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span className="font-bold text-sm">{(u.full_name || u.email)[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold truncate text-[13px] ${selectedUserId === u.id ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}`}>
                            {u.full_name || 'No Name'}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">{u.role}</p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 transition-all ${selectedUserId === u.id ? 'text-blue-600 dark:text-blue-400 translate-x-1' : 'text-gray-300 group-hover:text-gray-400'}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Details Area - SCROLLABLE */}
          <div className="flex-1 space-y-6 w-full lg:min-h-screen">
            {!selectedUser ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-20 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-20 h-20 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <User className="w-10 h-10 text-gray-200" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No User Selected</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto text-sm">Pick a team member from the list to manage their access and review their performance.</p>
              </div>
            ) : (
              <>
                {/* Profile Header */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
                      {selectedUser.avatar_url ? (
                        <img src={selectedUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span>{selectedUser.full_name?.[0] || selectedUser.email[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedUser.full_name || '—'}</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {selectedUser.role}
                        </span>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">{selectedUser.email}</p>

                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4">
                        <input
                          type="text"
                          value={employeeIdInput}
                          onChange={(e) => setEmployeeIdInput(e.target.value)}
                          placeholder="Employee ID (e.g. DC-001)"
                          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                        />
                        <button
                          onClick={() => handleUpdateUser({ employee_id: employeeIdInput.trim() })}
                          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                        >
                          Save Employee ID
                        </button>
                        {selectedUser.employee_id && (
                          <button
                            onClick={() => handleUpdateUser({ employee_id: '' })}
                            className="px-5 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                          <Shield className={`w-3.5 h-3.5 ${selectedUser.restrict_by_ip ? 'text-green-500' : 'text-red-400'}`} />
                          <span className="text-gray-600 dark:text-gray-300">IP Protection:</span>
                          <span className={selectedUser.restrict_by_ip ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                            {selectedUser.restrict_by_ip ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                          <Building2 className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-gray-600 dark:text-gray-300">Access Status:</span>
                          <span className="text-blue-700 dark:text-blue-300">{isWFHEnabled ? 'WFH OVERRIDE' : 'OFFICE MODE'}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateUser({ is_active: !selectedUser.is_active })}
                      className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${selectedUser.is_active
                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 border border-red-200 dark:border-red-800'
                        : 'bg-green-600 text-white hover:bg-green-700 shadow-md ring-2 ring-green-100'}`}
                    >
                      {selectedUser.is_active ? 'Deactivate User' : 'Activate User'}
                    </button>
                  </div>
                </div>

                {/* SECURITY CONTROLS */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Security & WFH Control
                    </h3>
                  </div>

                  <div className="p-6 space-y-6">
                    {!isWFHEnabled ? (
                      <div className="flex flex-col md:flex-row gap-6 p-5 bg-blue-50/50 border border-blue-100 dark:border-blue-800 rounded-2xl">
                        <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                          <Building2 className="text-white w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-blue-900 dark:text-blue-200 text-lg mb-1">Standard Office Rules Applied</h4>
                          <p className="text-sm text-blue-800/70 mb-5 leading-relaxed">
                            This user is restricted to the high-security office network. They can only access the platform while connected to <b>{OFFICE_IP}</b>.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="text"
                              value={wfhIpInput}
                              onChange={(e) => setWfhIpInput(e.target.value)}
                              placeholder="Enter Home/Temporary IP address..."
                              className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm shadow-sm transition-all"
                            />
                            <button
                              onClick={enableWFH}
                              className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                            >
                              <Home className="w-4 h-4" />
                              Enable WFH Access
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-6 p-5 bg-orange-50/50 border border-orange-100 dark:border-orange-800 rounded-2xl">
                        <div className="bg-orange-500 w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-200">
                          <Home className="text-white w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-bold text-orange-900 dark:text-orange-200 text-lg">WFH Mode Enabled</h4>
                            <span className="bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 text-[10px] font-black px-2 py-1 rounded-lg border border-orange-100 dark:border-orange-800 uppercase animate-pulse">Override Active</span>
                          </div>
                          <p className="text-sm text-orange-800/70 mb-5 leading-relaxed">
                            Access is currently granted for Office AND Home IPs: <b className="text-orange-900 dark:text-orange-200">{selectedUser.allowed_ips?.replace(OFFICE_IP, '').replace(',', '').trim()}</b>.
                          </p>
                          <button
                            onClick={disableWFH}
                            className="bg-orange-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-orange-700 transition-all shadow-md active:scale-95 flex items-center gap-2"
                          >
                            <Building2 className="w-4 h-4" />
                            Return to Office Rule
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">Last Login Activity</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${selectedUser.ip_last_login ? 'bg-blue-500' : 'bg-gray-300'}`} />
                          <p className="font-mono text-sm font-bold text-gray-700 dark:text-gray-200">{selectedUser.ip_last_login || 'No IP detected yet'}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">DB Access Whitelist</p>
                        <p className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700" title={selectedUser.allowed_ips || ''}>
                          {selectedUser.allowed_ips || OFFICE_IP}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LATE ARRIVAL PERMISSION */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Late Arrival Permission
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      Attendance IN closes at <b>09:30 AM</b>; a user who has not marked IN by then is auto-marked
                      <b> absent</b>. Grant a specific date here when a user has informed you in advance — on that date
                      their check-in after 09:30 is recorded as <b>LATE</b> instead of absent.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="date"
                        value={latePermDate}
                        onChange={(e) => setLatePermDate(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 dark:text-gray-100 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm shadow-sm transition-all"
                      />
                      <button
                        onClick={addLatePermission}
                        className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Clock className="w-4 h-4" />
                        Grant Late Permission
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">Granted Dates</p>
                      {(selectedUser.late_permission_dates || []).length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No late permissions granted.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(selectedUser.late_permission_dates || []).map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-sm font-semibold"
                            >
                              {d}
                              <button
                                onClick={() => removeLatePermission(d)}
                                className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
                                title="Revoke"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* TO-DO LIST */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <ListTodo className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      To-Do List
                    </h3>
                  </div>
                  <div className="p-6">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                      Only admins manage this list. Add items for {selectedUser.full_name || 'this user'},
                      edit or remove them, and tick to <b>strike off</b> (or untick to restore). The user
                      sees their list as read-only.
                    </p>

                    {/* Add item for this user (admin only) */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newUserTodo}
                        onChange={(e) => setNewUserTodo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUserTodo(); } }}
                        maxLength={500}
                        placeholder="Add a to-do item for this user…"
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                      />
                      <button
                        onClick={addUserTodo}
                        disabled={addingTodo || !newUserTodo.trim()}
                        className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    </div>

                    {loadingTodos ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                    ) : userTodos.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">This user has no to-do items.</p>
                    ) : (
                      <ul className="space-y-2">
                        {userTodos.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40"
                          >
                            <button
                              onClick={() => toggleStrikeTodo(t.id, !t.is_done)}
                              title={t.is_done ? 'Restore item' : 'Strike off'}
                              className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                t.is_done
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'border-gray-300 dark:border-gray-500 hover:border-green-500'
                              }`}
                            >
                              {t.is_done && <Check className="w-3.5 h-3.5" />}
                            </button>
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
                            <button
                              onClick={() => editUserTodo(t.id, t.text)}
                              title="Edit"
                              className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteUserTodo(t.id)}
                              title="Remove"
                              className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* TASKS VIEW */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">Task Performance</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tasks assigned to, owned by, or submitted by this user</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1 border border-gray-100 dark:border-gray-700">
                        <button
                          onClick={() => setTaskStatusFilter('all')}
                          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${taskStatusFilter === 'all' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setTaskStatusFilter('completed')}
                          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${taskStatusFilter === 'completed' ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                        >
                          Completed
                        </button>
                      </div>
                      <button
                        onClick={() => selectedUserId && loadTasks(selectedUserId)}
                        className="p-2 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingTasks ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {(() => {
                      const visibleTasks = taskStatusFilter === 'completed'
                        ? tasks.filter((t) => t.status === 'completed')
                        : tasks;

                      if (loadingTasks) {
                        return (
                          <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-12 h-12 border-4 border-gray-100 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mb-4" />
                            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Analyzing records...</p>
                          </div>
                        );
                      }
                      if (visibleTasks.length === 0) {
                        return (
                          <div className="text-center py-20 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-700">
                            <AlertTriangle className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                            <h4 className="text-gray-900 dark:text-gray-100 font-bold mb-1">Clear Schedule</h4>
                            <p className="text-gray-400 dark:text-gray-500 text-sm">
                              {taskStatusFilter === 'completed' ? 'No completed tasks yet for this user.' : 'This user has no related tasks.'}
                            </p>
                          </div>
                        );
                      }
                      return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {visibleTasks.map((t) => (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => setViewingTask(t)}
                            className="group p-5 border border-gray-100 dark:border-gray-700 rounded-2xl hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all bg-white dark:bg-gray-800 relative text-left cursor-pointer w-full"
                          >
                            <div className="flex justify-between items-start mb-3">
                              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${t.status === 'completed' ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800'
                                }`}>
                                {t.status}
                              </span>
                            </div>
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-blue-600 transition-colors">{t.title}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed mb-6 h-8">{t.description || 'Routine organizational task.'}</p>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400 mb-4">
                              <div>
                                <span className="block text-[9px] font-black text-gray-300 uppercase">Assigned To</span>
                                <span className="font-bold text-gray-700 dark:text-gray-200">{t.assigned_to_name || 'Unassigned'}</span>
                              </div>
                              <div className="text-right">
                                <span className="block text-[9px] font-black text-gray-300 uppercase">Created By</span>
                                <span className="font-bold text-gray-700 dark:text-gray-200">{t.created_by_name || 'Unknown'}</span>
                              </div>
                            </div>

                            {t.status === 'completed' && (t.completion_results || t.completion_values || t.completion_summary) && (
                              <div className="mb-4 p-3 bg-green-50/60 border border-green-100 dark:border-green-800 rounded-xl space-y-2 text-[11px] text-gray-700 dark:text-gray-200">
                                {t.completion_results && (
                                  <div>
                                    <span className="block text-[9px] font-black text-green-600 dark:text-green-400 uppercase mb-0.5">Results</span>
                                    <p className="leading-snug">{t.completion_results}</p>
                                  </div>
                                )}
                                {t.completion_values && (
                                  <div>
                                    <span className="block text-[9px] font-black text-green-600 dark:text-green-400 uppercase mb-0.5">Values</span>
                                    <p className="leading-snug">{t.completion_values}</p>
                                  </div>
                                )}
                                {t.completion_summary && (
                                  <div>
                                    <span className="block text-[9px] font-black text-green-600 dark:text-green-400 uppercase mb-0.5">Summary</span>
                                    <p className="leading-snug">{t.completion_summary}</p>
                                  </div>
                                )}
                                {t.completed_at && (
                                  <div className="pt-1 border-t border-green-100 dark:border-green-800">
                                    <span className="block text-[9px] font-black text-green-600 dark:text-green-400 uppercase mb-0.5">Completed On</span>
                                    <p className="leading-snug">{new Date(t.completed_at).toLocaleDateString()}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-gray-300 uppercase">Started</span>
                                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                  {t.started_at ? new Date(t.started_at).toLocaleDateString() : 'None'}
                                </span>
                              </div>
                              <div className="flex flex-col text-right">
                                <span className="text-[9px] font-black text-gray-300 uppercase">Deadline</span>
                                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                  {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'None'}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* View Task Details Modal */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className={`px-6 py-4 border-b sticky top-0 z-10 ${viewingTask.status === 'completed' ? 'bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {viewingTask.task_type || 'task'} · {viewingTask.status}
                  </span>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">{viewingTask.title}</h3>
                </div>
                <button onClick={() => setViewingTask(null)} className="p-1 rounded hover:bg-white/60">
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 text-sm">
              {viewingTask.description && (
                <section>
                  <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Description</h4>
                  <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.description}</p>
                </section>
              )}

              <section className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Assigned To</h4>
                  <p className="text-gray-700 dark:text-gray-200">{viewingTask.assigned_to_name || '—'}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Created By</h4>
                  <p className="text-gray-700 dark:text-gray-200">{viewingTask.created_by_name || '—'}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Due Date</h4>
                  <p className="text-gray-700 dark:text-gray-200">{viewingTask.due_date ? new Date(viewingTask.due_date).toLocaleDateString() : '—'}</p>
                </div>
                {viewingTask.started_at && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Work Started</h4>
                    <p className="text-gray-700 dark:text-gray-200">{new Date(viewingTask.started_at).toLocaleString()}</p>
                  </div>
                )}
                {viewingTask.completed_at && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Completed</h4>
                    <p className="text-gray-700 dark:text-gray-200">{new Date(viewingTask.completed_at).toLocaleString()}</p>
                  </div>
                )}
                {viewingTask.status === 'completed' && viewingTask.approved_by_name && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Approved By</h4>
                    <p className="text-gray-700 dark:text-gray-200">{viewingTask.approved_by_name}</p>
                  </div>
                )}
              </section>

              {(viewingTask.completion_results || viewingTask.completion_values || viewingTask.completion_summary) && (
                <section className="border-t pt-4">
                  <h4 className="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-3">Completion Record</h4>
                  <div className="space-y-3">
                    {viewingTask.completion_results && (
                      <div>
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Results</span>
                        <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.completion_results}</p>
                      </div>
                    )}
                    {viewingTask.completion_values && (
                      <div>
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Values</span>
                        <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.completion_values}</p>
                      </div>
                    )}
                    {viewingTask.completion_summary && (
                      <div>
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Overview Summary</span>
                        <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.completion_summary}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <button
                onClick={() => setViewingTask(null)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </Layout>
  );
}
