import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { dataAPI } from '../lib/api';
import { Search, User, RefreshCw, Shield, Home, Building2, AlertTriangle, ChevronRight, X, Clock, ListTodo, Check, Trash2, Plus, Pencil, Globe, Network, PlusCircle, BarChart3, CheckSquare } from 'lucide-react';
import { useNotifications } from '../components/Notifications';
import { WorkAnalyticsCharts } from '../components/WorkAnalyticsCharts';

const OFFICE_IP = '223.185.0.0/16';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  employee_id?: string | null;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  is_archived?: boolean;
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
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    full_name: '',
    employee_id: '',
    role: 'member'
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // User Tab: Active vs Archived/Removed
  const [userTab, setUserTab] = useState<'active' | 'archived'>('active');

  // Active Workspace Tab for selected user
  const [userSection, setUserSection] = useState<'security' | 'analytics' | 'tasks' | 'todos'>('security');

  // Edit User Modal
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUserForm, setEditUserForm] = useState({
    full_name: '',
    email: '',
    employee_id: '',
    role: 'member',
    password: ''
  });
  const [updatingUser, setUpdatingUser] = useState(false);

  // Server-Wide Allowed IP Allocation
  const [serverIps, setServerIps] = useState<{ id: string; ip: string; label?: string; created_at?: string }[]>([]);
  const [loadingServerIps, setLoadingServerIps] = useState(false);
  const [newServerIp, setNewServerIp] = useState('');
  const [newServerIpLabel, setNewServerIpLabel] = useState('');
  const [allocatingServerIp, setAllocatingServerIp] = useState(false);
  const [addingWfhIps, setAddingWfhIps] = useState(false);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const userWfhIps = useMemo(() => {
    if (!selectedUser?.allowed_ips) return [];
    return selectedUser.allowed_ips
      .split(',')
      .map(i => i.trim())
      .filter(ip =>
        ip &&
        !ip.includes('103.218.112') &&
        !ip.startsWith('223.185') &&
        ip !== 'localhost' &&
        ip !== '127.0.0.1' &&
        ip !== '::1' &&
        !ip.startsWith('192.168.')
      );
  }, [selectedUser]);

  const isWFHEnabled = useMemo(() => userWfhIps.length > 0, [userWfhIps]);

  const activeUsersCount = useMemo(() => users.filter((u) => !u.is_archived).length, [users]);
  const archivedUsersCount = useMemo(() => users.filter((u) => !!u.is_archived).length, [users]);

  const filteredUsers = useMemo(() => {
    const tabFiltered = users.filter((u) => (userTab === 'active' ? !u.is_archived : !!u.is_archived));
    const q = filter.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const empId = (u.employee_id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || empId.includes(q);
    });
  }, [users, userTab, filter]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await dataAPI.getAllUsers();
      setUsers(data || []);
      if (data?.length) {
        // If current selection is invalid for active tab, pick first active
        const hasSelected = data.some((u: any) => u.id === selectedUserId);
        if (!selectedUserId || !hasSelected) {
          const first = data.find((u: any) => !u.is_archived) || data[0];
          setSelectedUserId(first?.id || null);
        }
      }
    } catch (e: any) {
      console.error('Failed to load users', e);
      showError(e.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const openEditUser = () => {
    if (!selectedUser) return;
    setEditUserForm({
      full_name: selectedUser.full_name || '',
      email: selectedUser.email || '',
      employee_id: selectedUser.employee_id || '',
      role: selectedUser.role || 'member',
      password: ''
    });
    setShowEditUserModal(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setUpdatingUser(true);
    try {
      const updates: any = {
        full_name: editUserForm.full_name.trim(),
        email: editUserForm.email.trim(),
        employee_id: editUserForm.employee_id.trim(),
        role: editUserForm.role
      };
      if (editUserForm.password.trim()) {
        updates.password = editUserForm.password.trim();
      }
      await dataAPI.updateUserProfile(selectedUserId, updates);
      showSuccess('User updated successfully');
      setShowEditUserModal(false);
      await loadUsers();
    } catch (err: any) {
      showError(err.message || 'Failed to update user');
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleArchiveUser = async () => {
    if (!selectedUser) return;
    const confirmed = window.confirm(
      `Remove ${selectedUser.full_name || selectedUser.email} from the users list?\n\nNote: All user profile details, tasks, attendance records, and database history will remain safely preserved in the database and website.`
    );
    if (!confirmed) return;
    try {
      await dataAPI.deleteUser(selectedUser.id);
      showSuccess('User removed from user list (all tasks and history preserved)');
      await loadUsers();
    } catch (err: any) {
      showError(err.message || 'Failed to archive user');
    }
  };

  const handleRestoreUser = async () => {
    if (!selectedUser) return;
    try {
      await dataAPI.restoreUser(selectedUser.id);
      showSuccess('User restored to active users list');
      setUserTab('active');
      await loadUsers();
    } catch (err: any) {
      showError(err.message || 'Failed to restore user');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await dataAPI.createUser(newUserForm);
      showSuccess('User created successfully');
      setShowAddUserModal(false);
      setNewUserForm({ email: '', password: '', full_name: '', employee_id: '', role: 'member' });
      await loadUsers();
    } catch (e: any) {
      showError(e.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
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

  const loadServerIps = async () => {
    setLoadingServerIps(true);
    try {
      const res = await dataAPI.getServerIps();
      setServerIps(res?.configured_ips || []);
    } catch (e: any) {
      console.error('Failed to load server IPs', e);
    } finally {
      setLoadingServerIps(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadServerIps();
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

  const handleAddWfhIps = async () => {
    if (!selectedUser) return;
    if (!wfhIpInput.trim()) {
      showError('Please enter one or more IP addresses (separated by commas)');
      return;
    }

    const inputList = wfhIpInput
      .split(/[, \n]+/)
      .map(i => i.trim())
      .filter(Boolean);

    if (inputList.length === 0) {
      showError('Please enter a valid IP address');
      return;
    }

    const ipv4OrCidrOrWildcard = /^(\d{1,3}|\*)(\.(\d{1,3}|\*)){0,3}(\/\d{1,2})?$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    for (const ip of inputList) {
      if (ip !== 'localhost' && !ipv4OrCidrOrWildcard.test(ip) && !ipv6.test(ip)) {
        showError(`Invalid IP format: "${ip}". Expected IPv4, wildcard (e.g. 49.36.*.*), or CIDR`);
        return;
      }
    }

    setAddingWfhIps(true);
    try {
      const res = await dataAPI.enableUserWfhIps(selectedUser.id, inputList);
      showSuccess(`Added ${inputList.length} WFH IP(s) successfully`);
      setWfhIpInput('');
      if (res?.user?.allowed_ips) {
        const allowedStr = Array.isArray(res.user.allowed_ips) ? res.user.allowed_ips.join(', ') : res.user.allowed_ips;
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, allowed_ips: allowedStr, restrict_by_ip: true } : u));
      } else {
        await loadUsers();
      }
    } catch (err: any) {
      showError(err.message || 'Failed to add WFH IPs');
    } finally {
      setAddingWfhIps(false);
    }
  };

  const handleRemoveWfhIp = async (ipToRemove: string) => {
    if (!selectedUser) return;
    const currentList = (selectedUser.allowed_ips || '')
      .split(',')
      .map(i => i.trim())
      .filter(Boolean);

    const updatedList = currentList.filter(ip => ip !== ipToRemove);
    if (!updatedList.some(ip => ip.startsWith('223.185'))) {
      updatedList.unshift(OFFICE_IP);
    }

    try {
      await dataAPI.updateUserProfile(selectedUser.id, {
        allowed_ips: updatedList.join(', '),
        restrict_by_ip: true
      });
      showSuccess(`Revoked WFH IP ${ipToRemove}`);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, allowed_ips: updatedList.join(', ') } : u));
    } catch (err: any) {
      showError(err.message || 'Failed to remove WFH IP');
    }
  };

  const handleDisableAllWfh = async () => {
    if (!selectedUser) return;
    const defaultIps = `${OFFICE_IP}, 127.0.0.1, ::1, localhost`;
    try {
      await dataAPI.updateUserProfile(selectedUser.id, {
        allowed_ips: defaultIps,
        restrict_by_ip: true
      });
      showSuccess('Returned to Strict Office Rule. All WFH IPs revoked.');
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, allowed_ips: defaultIps } : u));
    } catch (err: any) {
      showError(err.message || 'Failed to reset IP rule');
    }
  };

  const handleAllocateServerIp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = newServerIp.trim();
    if (!cleanIp) {
      showError('Please enter an IP address, wildcard (e.g. 49.36.*.*), or CIDR');
      return;
    }
    setAllocatingServerIp(true);
    try {
      await dataAPI.allocateServerIp(cleanIp, newServerIpLabel.trim() || undefined);
      showSuccess(`Allocated ${cleanIp} to server allow-list successfully`);
      setNewServerIp('');
      setNewServerIpLabel('');
      await loadServerIps();
    } catch (err: any) {
      showError(err.message || 'Failed to allocate server IP');
    } finally {
      setAllocatingServerIp(false);
    }
  };

  const handleDeleteServerIp = async (id: string, ip: string) => {
    if (!window.confirm(`Revoke server-wide authorization for ${ip}?`)) return;
    try {
      await dataAPI.deleteServerIp(id);
      showSuccess(`Removed ${ip} from server allow-list`);
      await loadServerIps();
    } catch (err: any) {
      showError(err.message || 'Failed to remove server IP');
    }
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
      <div className="h-[calc(100vh-5.5rem)] flex flex-col overflow-hidden max-w-[1600px] mx-auto w-full">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
            <p className="text-xs lg:text-sm text-gray-600 dark:text-gray-300 mt-0.5">Control access, IP restrictions, and WFH status</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </button>
            <button
              onClick={loadUsers}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-slate-700 dark:text-slate-200 shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-5 min-h-0 overflow-hidden">
          {/* User List Sidebar - Fills height and scrolls internally */}
          <div className="w-full lg:w-80 shrink-0 h-full flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Tab Selector: Active vs Archived */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 text-xs font-semibold shrink-0">
                <button
                  onClick={() => setUserTab('active')}
                  className={`flex-1 py-3 text-center border-b-2 transition-colors ${
                    userTab === 'active'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Active ({activeUsersCount})
                </button>
                <button
                  onClick={() => setUserTab('archived')}
                  className={`flex-1 py-3 text-center border-b-2 transition-colors ${
                    userTab === 'archived'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Archived ({archivedUsersCount})
                </button>
              </div>

              <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={userTab === 'active' ? "Search active users..." : "Search archived users..."}
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

          {/* User Details Area - FITS SCREEN, INTERNAL TABBED WORKSPACE */}
          <div className="flex-1 h-full flex flex-col min-h-0 overflow-hidden space-y-3 w-full">
            {!selectedUser ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 h-full flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-gray-300 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">No User Selected</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto text-xs">Pick a team member from the list on the left to manage their security, analytics, and tasks.</p>
              </div>
            ) : (
              <>
                {/* Profile Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 p-4 lg:p-5 shrink-0">
                  <div className="flex flex-col md:flex-row md:items-center gap-4 lg:gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-sm shrink-0">
                      {selectedUser.avatar_url ? (
                        <img src={selectedUser.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                      ) : (
                        <span>{selectedUser.full_name?.[0] || selectedUser.email[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-0.5 flex-wrap">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{selectedUser.full_name || '—'}</h2>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                          {selectedUser.role}
                        </span>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 mb-3 text-xs truncate">{selectedUser.email}</p>

                      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center mb-3">
                        <input
                          type="text"
                          value={employeeIdInput}
                          onChange={(e) => setEmployeeIdInput(e.target.value)}
                          placeholder="Employee ID (e.g. DC-001)"
                          className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={() => handleUpdateUser({ employee_id: employeeIdInput.trim() })}
                          className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                        >
                          Save Employee ID
                        </button>
                        {selectedUser.employee_id && (
                          <button
                            onClick={() => handleUpdateUser({ employee_id: '' })}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs font-medium">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 text-[11px]">
                          <Shield className={`w-3 h-3 ${selectedUser.restrict_by_ip ? 'text-green-500' : 'text-red-400'}`} />
                          <span className="text-gray-600 dark:text-gray-300">IP Protection:</span>
                          <span className={`font-bold ${selectedUser.restrict_by_ip ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                            {selectedUser.restrict_by_ip ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 text-[11px]">
                          <Building2 className="w-3 h-3 text-blue-500" />
                          <span className="text-gray-600 dark:text-gray-300">Access:</span>
                          <span className="text-blue-700 dark:text-blue-300 font-bold">{isWFHEnabled ? 'WFH OVERRIDE' : 'OFFICE MODE'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-row md:flex-col gap-2 shrink-0">
                      <button
                        onClick={openEditUser}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-xs cursor-pointer"
                      >
                        <Pencil className="w-3 h-3 text-blue-600" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleUpdateUser({ is_active: !selectedUser.is_active })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${selectedUser.is_active
                          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800'
                          : 'bg-green-600 text-white hover:bg-green-700'}`}
                      >
                        {selectedUser.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      {!selectedUser.is_archived ? (
                        <button
                          onClick={handleArchiveUser}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 border border-red-200 dark:border-red-800 transition-colors cursor-pointer"
                          title="Remove user from user page while preserving all their info, tasks, and history"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleRestoreUser}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* User Workspace Section Tabs */}
                <div className="flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 rounded-xl shrink-0 overflow-x-auto shadow-xs">
                  <button
                    type="button"
                    onClick={() => setUserSection('security')}
                    className={`flex items-center gap-2 py-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      userSection === 'security'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Security & IP Allocation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserSection('analytics')}
                    className={`flex items-center gap-2 py-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      userSection === 'analytics'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Work & Attendance Analytics</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserSection('tasks')}
                    className={`flex items-center gap-2 py-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      userSection === 'tasks'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Task Performance ({tasks.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserSection('todos')}
                    className={`flex items-center gap-2 py-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      userSection === 'todos'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                    <span>Workspace Todo ({userTodos.length})</span>
                  </button>
                </div>

                {/* Tab Pane Content: Scrolls smoothly within its pane, never breaking page fit */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar min-h-0">
                  {userSection === 'security' && (
                    <>
                      {/* SECURITY & MULTI-IP WFH CONTROLS */}
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Security & Multi-IP WFH Allocation
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                        Airtel Dynamic: 223.185.*.* (Default Office)
                      </span>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {!isWFHEnabled ? (
                      <div className="flex flex-col md:flex-row gap-6 p-5 bg-blue-50/50 border border-blue-100 dark:border-blue-800 rounded-2xl">
                        <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                          <Building2 className="text-white w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-blue-900 dark:text-blue-200 text-lg mb-1">Strict Office Network Rule Applied</h4>
                          <p className="text-sm text-blue-800/70 mb-4 leading-relaxed">
                            This user is strictly restricted to the office network. Access is only authorized when connecting with an IP starting with <b>223.185.</b> (Airtel dynamic network). You can authorize one or multiple home/remote IPs below if they work from home.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="text"
                              value={wfhIpInput}
                              onChange={(e) => setWfhIpInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddWfhIps(); } }}
                              placeholder="Enter Home IP(s), e.g. 49.37.12.98, 157.48.20.11 or 49.36.*.*"
                              className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm shadow-sm transition-all"
                            />
                            <button
                              onClick={handleAddWfhIps}
                              disabled={addingWfhIps || !wfhIpInput.trim()}
                              className="bg-blue-600 text-white px-7 py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 shrink-0"
                            >
                              <Home className="w-4 h-4" />
                              <span>{addingWfhIps ? 'Adding...' : 'Enable WFH IP(s)'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 rounded-2xl space-y-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="bg-orange-500 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-200 text-white">
                              <Home className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-orange-900 dark:text-orange-200 text-lg">WFH Mode Enabled</h4>
                                <span className="bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                                  {userWfhIps.length} Remote IP{userWfhIps.length > 1 ? 's' : ''} Authorized
                                </span>
                              </div>
                              <p className="text-xs text-orange-800/80 dark:text-orange-300/80 mt-0.5">
                                User can log in from the Airtel office network (223.185.*.*) and any of the authorized WFH IPs listed below.
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={handleDisableAllWfh}
                            className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Return to Office Rule Only</span>
                          </button>
                        </div>

                        {/* List of WFH IP Chips */}
                        <div>
                          <p className="text-[11px] font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Allocated Home / Remote IPs for {selectedUser.full_name || selectedUser.email}:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {userWfhIps.map((ip) => (
                              <span
                                key={ip}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 text-orange-900 dark:text-orange-200 font-mono text-xs font-bold shadow-sm"
                              >
                                <Home className="w-3.5 h-3.5 text-orange-500" />
                                <span>{ip}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveWfhIp(ip)}
                                  className="p-0.5 hover:bg-orange-100 dark:hover:bg-gray-700 rounded text-orange-600 dark:text-orange-400 transition-colors"
                                  title={`Revoke WFH access for ${ip}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Add more WFH IPs */}
                        <div className="pt-3 border-t border-orange-100 dark:border-orange-800/40 flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={wfhIpInput}
                            onChange={(e) => setWfhIpInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddWfhIps(); } }}
                            placeholder="Add more WFH IPs (comma-separated)..."
                            className="flex-1 px-3.5 py-2 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-xs shadow-sm"
                          />
                          <button
                            onClick={handleAddWfhIps}
                            disabled={addingWfhIps || !wfhIpInput.trim()}
                            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{addingWfhIps ? 'Adding...' : 'Add WFH IP(s)'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="p-4 bg-gray-50/50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">Last Login Activity</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${selectedUser.ip_last_login ? 'bg-blue-500' : 'bg-gray-300'}`} />
                          <p className="font-mono text-sm font-bold text-gray-700 dark:text-gray-200">{selectedUser.ip_last_login || 'No IP detected yet'}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50/50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">DB Access Whitelist</p>
                        <p className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700" title={selectedUser.allowed_ips || ''}>
                          {selectedUser.allowed_ips || OFFICE_IP}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SERVER-WIDE ALLOWED IP ALLOCATION CONTAINER */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">Server-Wide Allowed IP Allocation</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Allocate dynamic IPs to server/env for instant website access without restart</p>
                      </div>
                    </div>
                    <button
                      onClick={loadServerIps}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Refresh server IP list"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingServerIps ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="p-6 space-y-5">
                    {/* Informative banner */}
                    <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                      <Network className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">
                          Permanent Office Rule: Dynamic Airtel IP range <span className="font-mono font-bold">223.185.*.*</span> and local development hosts are always permitted server-wide.
                        </p>
                        <p className="text-emerald-800/80 dark:text-emerald-300/80">
                          Any IP, CIDR block (e.g. <span className="font-mono">103.218.112.0/24</span>), or wildcard added below will be instantly granted access across the entire server for all users.
                        </p>
                      </div>
                    </div>

                    {/* Add new Server IP Form */}
                    <form onSubmit={handleAllocateServerIp} className="p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Allocate New Server IP / Range
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-6">
                          <input
                            type="text"
                            required
                            value={newServerIp}
                            onChange={(e) => setNewServerIp(e.target.value)}
                            placeholder="IP or CIDR (e.g. 103.218.112.0/24 or 49.36.*.*)"
                            className="w-full px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-gray-900 dark:text-white"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <input
                            type="text"
                            value={newServerIpLabel}
                            onChange={(e) => setNewServerIpLabel(e.target.value)}
                            placeholder="Label (e.g. Branch Office, Admin Home)"
                            className="w-full px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            disabled={allocatingServerIp || !newServerIp.trim()}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>{allocatingServerIp ? 'Saving...' : 'Allocate IP'}</span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Server IPs List */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                          Active Server-Wide Whitelist ({serverIps.length})
                        </h4>
                      </div>

                      {loadingServerIps ? (
                        <div className="text-center py-6 text-xs text-gray-400">Loading server IPs...</div>
                      ) : serverIps.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            No additional server-wide IPs allocated yet. Only Airtel 223.185.*.* and user-specific WFH allocations are currently active.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
                          {serverIps.map((s) => (
                            <div key={s.id} className="p-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <div>
                                  <span className="font-mono font-bold text-xs text-gray-900 dark:text-gray-100">{s.ip}</span>
                                  {s.label && (
                                    <span className="ml-2 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                      {s.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {s.created_at && (
                                  <span className="text-[10px] text-gray-400 hidden sm:inline">
                                    Added {new Date(s.created_at).toLocaleDateString()}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleDeleteServerIp(s.id, s.ip)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                                  title="Revoke server-wide allocation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
              </>
            )}

            {/* TAB PANE 2: WORK & ATTENDANCE ANALYTICS */}
            {userSection === 'analytics' && (
              <WorkAnalyticsCharts
                userId={selectedUserId}
                title={`${selectedUser.full_name || selectedUser.email}'s Work & Attendance Analytics`}
              />
            )}

            {/* TAB PANE 3: TASK PERFORMANCE */}
            {userSection === 'tasks' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Task Performance
                    </h3>
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
                              <span className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase">Assigned To</span>
                              <span className="font-bold text-gray-700 dark:text-gray-200">{t.assigned_to_name || 'Unassigned'}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase">Created By</span>
                              <span className="font-bold text-gray-700 dark:text-gray-200">{t.created_by_name || 'Unknown'}</span>
                            </div>
                          </div>

                          {/* HIGH CONTRAST DARK THEME TASK COMPLETION CONTAINER */}
                          {t.status === 'completed' && (t.completion_results || t.completion_values || t.completion_summary) && (
                            <div className="mb-4 p-3.5 bg-slate-100/90 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 text-[11px] text-slate-800 dark:text-slate-100">
                              {t.completion_results && (
                                <div>
                                  <span className="block text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Results</span>
                                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 font-mono text-[11px] leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                                    {t.completion_results}
                                  </div>
                                </div>
                              )}
                              {t.completion_values && (
                                <div>
                                  <span className="block text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Values</span>
                                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 font-mono text-[11px] leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                                    {t.completion_values}
                                  </div>
                                </div>
                              )}
                              {t.completion_summary && (
                                <div>
                                  <span className="block text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Summary</span>
                                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 text-[11px] leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                                    {t.completion_summary}
                                  </div>
                                </div>
                              )}
                              {t.completed_at && (
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                  <span className="block text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed On</span>
                                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{new Date(t.completed_at).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase">Started</span>
                              <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                {t.started_at ? new Date(t.started_at).toLocaleDateString() : 'None'}
                              </span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase">Deadline</span>
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
            )}

            {/* TAB PANE 4: TO-DO LIST */}
            {userSection === 'todos' && (
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
            )}
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
                <section className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-3">Completion Record</h4>
                  <div className="space-y-3 p-3.5 bg-slate-100/90 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
                    {viewingTask.completion_results && (
                      <div>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Results</span>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-mono whitespace-pre-wrap">{viewingTask.completion_results}</div>
                      </div>
                    )}
                    {viewingTask.completion_values && (
                      <div>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Values</span>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-mono whitespace-pre-wrap">{viewingTask.completion_values}</div>
                      </div>
                    )}
                    {viewingTask.completion_summary && (
                      <div>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Overview Summary</span>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#151F32] border border-slate-200/80 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{viewingTask.completion_summary}</div>
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

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Add New User</h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-400 dark:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newUserForm.full_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="Password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee ID (Optional)
                </label>
                <input
                  type="text"
                  value={newUserForm.employee_id}
                  onChange={(e) => setNewUserForm({ ...newUserForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="EMP-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="member">Member</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {creatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Edit User Profile</h3>
              <button
                onClick={() => setShowEditUserModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-400 dark:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditUser} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editUserForm.full_name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee ID
                </label>
                <input
                  type="text"
                  value={editUserForm.employee_id}
                  onChange={(e) => setEditUserForm({ ...editUserForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="DC-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={editUserForm.role}
                  onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="member">Member</option>
                  <option value="tl">Team Lead</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reset Password (Leave blank to keep current)
                </label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="New password..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditUserModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingUser}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-semibold"
                >
                  {updatingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
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
