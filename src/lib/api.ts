import { getStoredAuth } from './authStorage';

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';
  // If the URL doesn't end with /api, append it
  return envUrl.endsWith('/api') || envUrl.endsWith('/api/')
    ? envUrl
    : `${envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl}/api`;
};

const API_BASE_URL = getApiBaseUrl();
export { API_BASE_URL };

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  body?: any;
  headers?: Record<string, string>;
}

async function apiCall(endpoint: string, options: FetchOptions = {}) {
  const token = getStoredAuth()?.token;
  const method = options.method || 'GET';

  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  const rawText = await response.text();
  let parsed: any = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      parsed = { message: rawText };
    }
  }

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || `API error: ${response.statusText}`;
    const err: any = new Error(message);
    err.code = parsed?.code;
    err.detectedIp = parsed?.detectedIp;
    throw err;
  }

  return parsed;
}

// Auth APIs
export const authAPI = {
  login: (email: string, password: string) =>
    apiCall('/auth/login', { method: 'POST', body: { email, password } }),

  logout: () =>
    apiCall('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiCall('/auth/me'),

  changePassword: (current_password: string, new_password: string) =>
    apiCall('/auth/change-password', { method: 'POST', body: { current_password, new_password } }),
};

// Query APIs (for database operations)
export const queryAPI = {
  select: (table: string, options: any = {}) =>
    apiCall('/query', { method: 'POST', body: { operation: 'select', table, ...options } }),

  insert: (table: string, values: any) =>
    apiCall('/query', { method: 'POST', body: { operation: 'insert', table, values } }),

  update: (table: string, values: any, where: any) =>
    apiCall('/query', { method: 'POST', body: { operation: 'update', table, values, where } }),

  delete: (table: string, where: any) =>
    apiCall('/query', { method: 'POST', body: { operation: 'delete', table, where } }),
};

// High-level data APIs
export const dataAPI = {
  // === TASKS ===

  // Get all tasks (with optional filters)
  getTasks: (params?: { type?: 'personal' | 'company'; status?: string; assigned_to?: string; related_user?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.assigned_to) queryParams.append('assigned_to', params.assigned_to);
    if (params?.related_user) queryParams.append('related_user', params.related_user);

    const queryString = queryParams.toString();
    return apiCall(`/tasks${queryString ? `?${queryString}` : ''}`);
  },

  // Get task counts (company tasks only)
  getTaskCounts: () =>
    apiCall('/tasks/counts'),

  // Get task history for a user
  getTaskHistory: (userId: string) =>
    apiCall(`/tasks/history/${userId}`),

  // Create a new task
  createTask: (task: {
    title: string;
    description?: string;
    task_type?: 'personal' | 'company';
    assigned_to?: string;
    due_date?: string;
    dataset_name?: string;
    dataset_links?: string;
    dataset_size?: string;
    limitations?: string;
    novelty?: string;
  }) =>
    apiCall('/tasks', { method: 'POST', body: task }),

  // Update task (status or other fields)
  updateTask: (taskId: string, updates: any) =>
    apiCall(`/tasks/${taskId}`, { method: 'PUT', body: updates }),

  // Update task status only
  updateTaskStatus: (taskId: string, status: string) =>
    apiCall(`/tasks/${taskId}`, { method: 'PUT', body: { status } }),

  // Admin approve & complete. Completion details are optional — when omitted,
  // the server uses the results/values/summary the worker already submitted.
  completeTask: (taskId: string, completion?: {
    completion_results: string;
    completion_values: string;
    completion_summary: string;
  }) =>
    apiCall(`/tasks/${taskId}/complete`, { method: 'PUT', body: completion || {} }),

  // Delete task (admin only, completed tasks only)
  deleteTask: (taskId: string) =>
    apiCall(`/tasks/${taskId}`, { method: 'DELETE' }),

  // === CALENDAR ===

  // Get calendar data for a month
  getCalendarMonth: (month: string, scope?: 'personal' | 'company' | 'all') => {
    const params = new URLSearchParams({ month });
    if (scope) params.append('scope', scope);
    return apiCall(`/calendar/month?${params.toString()}`);
  },

  // Create calendar event
  createCalendarEvent: (event: {
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    location?: string;
    is_all_day?: boolean;
    meeting_link?: string;
    event_type?: string;
    event_scope?: 'personal' | 'company';
    is_global?: boolean;
  }) =>
    apiCall('/calendar/events', { method: 'POST', body: event }),

  // Update calendar event
  updateCalendarEvent: (eventId: string, updates: any) =>
    apiCall(`/calendar/events/${eventId}`, { method: 'PUT', body: updates }),

  // Delete calendar event
  deleteCalendarEvent: (eventId: string) =>
    apiCall(`/calendar/events/${eventId}`, { method: 'DELETE' }),

  // === GROUPS ===

  getGroupsByUser: (userId: string) =>
    queryAPI.select('group_members', {
      where: { user_id: userId },
      join: { groups: ['id', 'name', 'description', 'created_at'] }
    }),

  getAllUsers: () =>
    apiCall('/profiles'),

  getActiveUsers: () =>
    apiCall('/profiles/active'),

  // Get team members for the current team lead
  getTeamMembers: () =>
    apiCall('/profiles/team'),

  getGroupMessages: (groupId: string) =>
    queryAPI.select('group_messages', {
      where: { group_id: groupId },
      order: ['created_at', 'asc'],
      join: { profiles: ['full_name', 'avatar_url'] },
    }),

  getGroupMembers: (groupId: string) =>
    queryAPI.select('group_members', { where: { group_id: groupId } }),

  createGroup: (name: string, description: string) =>
    queryAPI.insert('groups', { name, description }),

  createGroupMessage: (groupId: string, content: string, attachments?: any[]) =>
    apiCall(`/data/groups/${groupId}/messages`, { method: 'POST', body: { content, attachments } }),

  addGroupMember: (groupId: string, userId: string) =>
    queryAPI.insert('group_members', { group_id: groupId, user_id: userId }),

  removeGroupMember: (groupId: string, userId: string) =>
    queryAPI.delete('group_members', { group_id: groupId, user_id: userId }),

  // === USER PROFILE ===

  createUser: (payload: any) =>
    apiCall('/profiles', { method: 'POST', body: payload }),

  getUserProfile: (userId: string) =>
    apiCall(`/profiles/${userId}`),

  updateUserProfile: (userId: string, payload: any) =>
    apiCall(`/profiles/${userId}`, { method: 'PUT', body: payload }),

  deleteUser: (userId: string) =>
    apiCall(`/profiles/${userId}`, { method: 'DELETE' }),

  restoreUser: (userId: string) =>
    apiCall(`/profiles/${userId}/restore`, { method: 'POST' }),

  updateUserLastLogin: (userId: string) =>
    queryAPI.update('profiles', { ip_last_login: new Date().toISOString() }, { id: userId }),

  // === ATTENDANCE ===

  getAttendanceToday: () =>
    apiCall('/attendance/today'),

  getAttendanceAnalytics: (params?: { month?: string; year?: number | string; user_id?: string | null }) => {
    const qp = new URLSearchParams();
    if (params?.month) qp.append('month', params.month);
    if (params?.year) qp.append('year', String(params.year));
    if (params?.user_id) qp.append('user_id', params.user_id);
    const qs = qp.toString();
    return apiCall(`/attendance/analytics${qs ? `?${qs}` : ''}`);
  },

  markAttendance: (payload: { employee_id: string; password: string }) =>
    apiCall('/attendance/mark', { method: 'POST', body: payload }),

  adminGetAttendanceToday: (date?: string) => {
    const qp = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiCall(`/attendance/admin/today${qp}`);
  },

  adminGetMonthlyWorkingDays: (month?: string) => {
    const qp = month ? `?month=${encodeURIComponent(month)}` : '';
    return apiCall(`/attendance/admin/monthly-working-days${qp}`);
  },

  adminSaveAttendanceRecord: (payload: {
    user_id: string;
    date: string;
    in_time?: string | null;
    out_time?: string | null;
    status?: string;
    late_permission?: boolean;
  }) => apiCall('/attendance/admin/record', { method: 'POST', body: payload }),

  adminDeleteAttendanceRecord: (params: { user_id?: string; date?: string; id?: string }) => {
    const qp = new URLSearchParams();
    if (params.id) qp.append('id', params.id);
    if (params.user_id) qp.append('user_id', params.user_id);
    if (params.date) qp.append('date', params.date);
    return apiCall(`/attendance/admin/record?${qp.toString()}`, { method: 'DELETE' });
  },

  // === LEAVE MANAGEMENT ===

  getLeaves: (params?: { user_id?: string; month?: string; status?: string }) => {
    const qp = new URLSearchParams();
    if (params?.user_id) qp.append('user_id', params.user_id);
    if (params?.month) qp.append('month', params.month);
    if (params?.status) qp.append('status', params.status);
    const qs = qp.toString();
    return apiCall(`/leaves${qs ? `?${qs}` : ''}`);
  },

  createLeave: (data: {
    user_id?: string;
    start_date: string;
    end_date?: string;
    type?: string;
    reason?: string;
    status?: string;
  }) => apiCall('/leaves', { method: 'POST', body: data }),

  updateLeave: (id: string, data: any) =>
    apiCall(`/leaves/${id}`, { method: 'PUT', body: data }),

  deleteLeave: (id: string) =>
    apiCall(`/leaves/${id}`, { method: 'DELETE' }),

  // === SERVER & WFH IP MANAGEMENT ===

  getServerIps: () =>
    apiCall('/admin/server-ips'),

  allocateServerIp: (ip: string, label?: string) =>
    apiCall('/admin/server-ips', { method: 'POST', body: { ip, label } }),

  deleteServerIp: (id: string) =>
    apiCall(`/admin/server-ips/${id}`, { method: 'DELETE' }),

  enableUserWfhIps: (userId: string, additional_ips: string[]) =>
    apiCall(`/admin/users/${userId}/enable-wfh`, { method: 'POST', body: { additional_ips } }),

  // === TO-DO LIST ===

  // Current user's own to-do list (read-only for non-admins)
  getMyTodos: () => apiCall('/todos'),

  // Admin only: add an item to a user's list (omit userId for the admin's own)
  createTodo: (text: string, userId?: string) =>
    apiCall('/todos', { method: 'POST', body: userId ? { text, user_id: userId } : { text } }),

  // Admin only: edit an item's text
  updateTodo: (todoId: string, text: string) =>
    apiCall(`/todos/${todoId}`, { method: 'PUT', body: { text } }),

  // Admin only: remove an item
  deleteTodo: (todoId: string) =>
    apiCall(`/todos/${todoId}`, { method: 'DELETE' }),

  // Admin: view a specific user's to-do list
  getUserTodos: (userId: string) => apiCall(`/todos/user/${userId}`),

  // Admin: strike an item off (or restore it). Omit is_done to toggle.
  strikeTodo: (todoId: string, is_done?: boolean) =>
    apiCall(`/todos/${todoId}/strike`, {
      method: 'PATCH',
      body: is_done === undefined ? {} : { is_done },
    }),
};

// === GITHUB TASK MANAGER ===

export interface GitHubTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
}

export interface GitHubTreeResponse {
  repo: string;
  owner: string;
  path: string;
  entries: GitHubTreeEntry[];
  empty: boolean;
  can_write: boolean;
  html_url: string;
}

export interface GitHubFileResponse {
  repo: string;
  path: string;
  name: string;
  sha: string;
  size: number;
  can_write: boolean;
  html_url: string;
  content: string | null;
  too_large?: boolean;
  is_binary?: boolean;
}

export interface GitHubUploadResult {
  path: string;
  status: 'created' | 'updated' | 'failed';
  error?: string;
}

export const githubAPI = {
  createRepo: (taskId: string, name?: string): Promise<{ github_repo: string; html_url: string; owner: string }> =>
    apiCall(`/github/task/${encodeURIComponent(taskId)}/create-repo`, {
      method: 'POST',
      body: name ? { name } : {},
    }),

  linkRepo: (taskId: string, repo: string): Promise<{ github_repo: string; html_url: string; owner: string }> =>
    apiCall(`/github/task/${encodeURIComponent(taskId)}/link-repo`, {
      method: 'POST',
      body: { repo },
    }),

  getTree: (repo: string, path: string = ''): Promise<GitHubTreeResponse> => {
    const qp = path ? `?path=${encodeURIComponent(path)}` : '';
    return apiCall(`/github/repo/${encodeURIComponent(repo)}/tree${qp}`);
  },

  getFile: (repo: string, path: string): Promise<GitHubFileResponse> =>
    apiCall(`/github/repo/${encodeURIComponent(repo)}/content?path=${encodeURIComponent(path)}`),

  updateFile: (
    repo: string,
    data: { path: string; content: string; sha?: string; message?: string }
  ): Promise<{ path: string; sha: string; commit_sha: string }> =>
    apiCall(`/github/repo/${encodeURIComponent(repo)}/file`, {
      method: 'PUT',
      body: data,
    }),

  deleteFile: (
    repo: string,
    data: { path: string; sha: string; message?: string }
  ): Promise<{ path: string; commit_sha: string }> =>
    apiCall(`/github/repo/${encodeURIComponent(repo)}/file`, {
      method: 'DELETE',
      body: data,
    }),

  uploadFiles: async (
    repo: string,
    path: string,
    files: File[],
    message?: string
  ): Promise<{ results: GitHubUploadResult[] }> => {
    const formData = new FormData();
    if (path) {
      formData.append('path', path);
    }
    if (message) {
      formData.append('message', message);
    }
    for (const file of files) {
      formData.append('files', file);
    }

    const token = getStoredAuth()?.token;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/github/repo/${encodeURIComponent(repo)}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const rawText = await response.text();
    let parsed: any = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { error: rawText };
      }
    }

    if (!response.ok) {
      const msg = parsed?.error || parsed?.message || `Upload failed with status ${response.status}`;
      throw new Error(msg);
    }

    return parsed;
  },
};

