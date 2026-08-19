import { useEffect, useState, useCallback } from 'react';
import { dataAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { useNotifications } from '../components/Notifications';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CheckSquare, Plus, Trash2, X, Users, User } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'started' | 'processing' | 'review' | 'completed' | 'cancelled';
  due_date: string | null;
  created_at: string;
  submitted_at?: string | null;
  created_by: string | null;
  assigned_to: string | null;
  task_type: 'personal' | 'company';
  assigned_to_name?: string;
  created_by_name?: string;
  dataset_name?: string | null;
  dataset_links?: string | null;
  dataset_size?: string | null;
  limitations?: string | null;
  novelty?: string | null;
  completion_results?: string | null;
  completion_values?: string | null;
  completion_summary?: string | null;
  // Actual work tracking
  started_at?: string | null;
  completed_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
}

interface UserOption {
  id: string;
  email?: string;
  full_name?: string;
  is_active?: boolean;
}

export function Tasks() {
  const { user, profile, isAdmin, isTeamLead } = useAuth();
  const { showSuccess, showError, NotificationContainer } = useNotifications();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskType, setTaskType] = useState<'personal' | 'company' | 'all'>('all');
  const [users, setUsers] = useState<UserOption[]>([]);
  const emptyProcessingDetails = {
    dataset_name: '',
    dataset_links: '',
    dataset_size: '',
    limitations: '',
    novelty: '',
    due_date: '',
  };
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    task_type: 'personal' as 'personal' | 'company',
    assigned_to: '',
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editValues, setEditValues] = useState({
    title: '',
    description: '',
    ...emptyProcessingDetails,
  });
  const [processingTask, setProcessingTask] = useState<Task | null>(null);
  const [processingValues, setProcessingValues] = useState(emptyProcessingDetails);
  const emptyCompletionDetails = {
    completion_results: '',
    completion_values: '',
    completion_summary: '',
  };
  const [completionTask, setCompletionTask] = useState<Task | null>(null);
  const [completionValues, setCompletionValues] = useState(emptyCompletionDetails);
  const [completedFilters, setCompletedFilters] = useState({ month: '', user: '' });
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user) return;

    try {
      const params: any = {};
      if (taskType !== 'all') {
        params.type = taskType;
      }

      const data = await dataAPI.getTasks(params);
      setTasks(data || []);
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      showError(error.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user, taskType, showError]);

  const loadUsers = async () => {
    try {
      let data: any[] | undefined;

      if (isAdmin) {
        data = await dataAPI.getAllUsers();
      } else if (isTeamLead) {
        data = await dataAPI.getTeamMembers();
      } else {
        // Members can only assign to themselves; populate from their own profile
        data = user && profile
          ? [{ id: user.id, email: user.email, full_name: profile.full_name || user.email, is_active: true }]
          : [];
      }

      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (user) {
      loadTasks();
      const interval = setInterval(loadTasks, 10000);
      return () => clearInterval(interval);
    }
  }, [user, loadTasks]);

  // Load users for company task assignment.
  useEffect(() => {
    if (user) {
      loadUsers();
    }
  }, [user, isAdmin, isTeamLead]);

  const currentUserOption: UserOption | null = user
    ? {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.email,
        is_active: true,
      }
    : null;

  const assignmentOptions = (() => {
    if (!currentUserOption) return [];
    const activeUsers = users.filter((u) => u.is_active !== false);
    const scopedUsers = isAdmin
      ? activeUsers
      : isTeamLead
        ? [currentUserOption, ...activeUsers]
        : [currentUserOption];

    const uniqueUsers = new Map<string, UserOption>();
    for (const option of scopedUsers) {
      uniqueUsers.set(option.id, option);
    }

    return Array.from(uniqueUsers.values()).sort((a, b) =>
      (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')
    );
  })();

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !user) return;

    // Validation for company tasks
    if (newTask.task_type === 'company') {
      if (!newTask.assigned_to) {
        showError('Please assign the task to a user');
        return;
      }
    }

    try {
      await dataAPI.createTask({
        title: newTask.title.trim(),
        description: newTask.description.trim() || undefined,
        task_type: newTask.task_type,
        assigned_to: newTask.task_type === 'company' ? newTask.assigned_to : undefined,
      });

      showSuccess(`${newTask.task_type === 'company' ? 'Company' : 'Personal'} task created successfully!`);
      setShowCreateTask(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'personal',
        assigned_to: '',
      });
      loadTasks();
    } catch (error: any) {
      console.error('Error creating task:', error);
      showError(error.response?.data?.error || error.message || 'Failed to create task');
    }
  };

  const handleUpdateStatus = async (task: Task, newStatus: Task['status']) => {
    try {
      if (newStatus === 'processing') {
        setProcessingTask(task);
        setProcessingValues({
          dataset_name: task.dataset_name || '',
          dataset_links: task.dataset_links || '',
          dataset_size: task.dataset_size || '',
          limitations: task.limitations || '',
          novelty: task.novelty || '',
          due_date: task.due_date ? task.due_date.substring(0, 10) : '',
        });
        return;
      }

      // Worker submits the task for admin approval -> opens the details modal.
      if (newStatus === 'review') {
        setCompletionTask(task);
        setCompletionValues({
          completion_results: task.completion_results || '',
          completion_values: task.completion_values || '',
          completion_summary: task.completion_summary || '',
        });
        return;
      }

      await dataAPI.updateTaskStatus(task.id, newStatus);
      showSuccess('Task status updated successfully!');
      loadTasks();
    } catch (error: any) {
      console.error('Error updating task:', error);
      showError(error.response?.data?.error || error.message || 'Failed to update task status');
    }
  };

  // Admin approves a submitted task: completes it using the details the worker
  // already submitted (no re-entry).
  const handleApproveTask = async (task: Task) => {
    if (!confirm(`Approve and complete "${task.title}"?`)) return;
    try {
      await dataAPI.completeTask(task.id);
      showSuccess('Task approved and completed!');
      loadTasks();
    } catch (error: any) {
      console.error('Error approving task:', error);
      showError(error.response?.data?.error || error.message || 'Failed to approve task');
    }
  };

  const handleSaveProcessingDetails = async () => {
    if (!processingTask) return;
    const missing = Object.entries(processingValues)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key.replace(/_/g, ' '));

    if (missing.length > 0) {
      showError(`Please fill: ${missing.join(', ')}`);
      return;
    }

    try {
      await dataAPI.updateTask(processingTask.id, {
        status: 'processing',
        dataset_name: processingValues.dataset_name.trim(),
        dataset_links: processingValues.dataset_links.trim(),
        dataset_size: processingValues.dataset_size.trim(),
        limitations: processingValues.limitations.trim(),
        novelty: processingValues.novelty.trim(),
        due_date: processingValues.due_date,
      });
      showSuccess('Task moved to processing!');
      setProcessingTask(null);
      setProcessingValues(emptyProcessingDetails);
      await loadTasks();
    } catch (error: any) {
      console.error('Error updating processing details:', error);
      showError(error.response?.data?.error || error.message || 'Failed to update processing details');
    }
  };

  const handleSubmitForApproval = async () => {
    if (!completionTask) return;
    const missing = Object.entries(completionValues)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key.replace(/_/g, ' '));

    if (missing.length > 0) {
      showError(`Please fill: ${missing.join(', ')}`);
      return;
    }

    try {
      await dataAPI.updateTask(completionTask.id, {
        status: 'review',
        completion_results: completionValues.completion_results.trim(),
        completion_values: completionValues.completion_values.trim(),
        completion_summary: completionValues.completion_summary.trim(),
      });
      showSuccess('Submitted for admin approval!');
      setCompletionTask(null);
      setCompletionValues(emptyCompletionDetails);
      await loadTasks();
    } catch (error: any) {
      console.error('Error submitting task for approval:', error);
      showError(error.response?.data?.error || error.message || 'Failed to submit for approval');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await dataAPI.deleteTask(taskId);
      showSuccess('Task deleted successfully!');
      loadTasks();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      showError(error.response?.data?.error || error.message || 'Failed to delete task');
    }
  };

  const canEdit = (task: Task) => {
    return isAdmin || task.created_by === user?.id;
  };

  const openEditModal = (task: Task) => {
    if (!canEdit(task)) return;
    setEditingTask(task);
    setEditValues({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date ? task.due_date.substring(0, 10) : '',
      dataset_name: task.dataset_name || '',
      dataset_links: task.dataset_links || '',
      dataset_size: task.dataset_size || '',
      limitations: task.limitations || '',
      novelty: task.novelty || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    try {
      await dataAPI.updateTask(editingTask.id, {
        title: editValues.title.trim(),
        description: editValues.description.trim() || undefined,
        due_date: editValues.due_date || undefined,
        dataset_name: editValues.dataset_name.trim() || undefined,
        dataset_links: editValues.dataset_links.trim() || undefined,
        dataset_size: editValues.dataset_size.trim() || undefined,
        limitations: editValues.limitations.trim() || undefined,
        novelty: editValues.novelty.trim() || undefined,
      });
      showSuccess('Task updated successfully!');
      setEditingTask(null);
      await loadTasks();
    } catch (error: any) {
      console.error('Error updating task:', error);
      showError(error.response?.data?.error || error.message || 'Failed to update task');
    }
  };

  type DisplayStatus = Exclude<Task['status'], 'cancelled'>;
  const displayStatuses: DisplayStatus[] = ['pending', 'started', 'processing', 'review', 'completed'];

  const allCompletedTasks = tasks.filter((t) => t.status === 'completed');

  const completedMonthOptions = Array.from(
    new Set(
      allCompletedTasks
        .map((t) => (t.completed_at ? t.completed_at.substring(0, 7) : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => b.localeCompare(a));

  const completedUserOptions = Array.from(
    new Map(
      allCompletedTasks
        .map((t): [string, string] => [t.assigned_to || '', t.assigned_to_name || ''])
        .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]))
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filteredCompletedTasks = allCompletedTasks.filter((t) => {
    if (completedFilters.month) {
      const month = t.completed_at ? t.completed_at.substring(0, 7) : '';
      if (month !== completedFilters.month) return false;
    }
    if (completedFilters.user) {
      if (t.assigned_to !== completedFilters.user) return false;
    }
    return true;
  });

  const tasksByStatus: Record<DisplayStatus, Task[]> = {
    pending: tasks.filter((t) => t.status === 'pending'),
    started: tasks.filter((t) => t.status === 'started'),
    processing: tasks.filter((t) => t.status === 'processing'),
    review: tasks.filter((t) => t.status === 'review'),
    completed: filteredCompletedTasks,
  };

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
  };

  // A "worker" drives a task forward and enters its details: the assignee, the
  // assignee's team lead, the owner of a personal task, or an admin.
  const isWorker = (task: Task) => {
    if (isAdmin) return true;
    if (task.assigned_to === user?.id) return true;
    if (task.task_type === 'personal' && task.created_by === user?.id) return true;
    // For a TL, `users` holds their team members (loaded via getTeamMembers).
    if (isTeamLead && task.assigned_to && users.some((u) => u.id === task.assigned_to)) return true;
    return false;
  };

  // Approve/complete a submitted task: admins for anyone, team leads only for
  // tasks assigned to their own team members.
  const canApproveTask = (task: Task) => {
    if (isAdmin) return true;
    return isTeamLead && !!task.assigned_to && users.some((u) => u.id === task.assigned_to);
  };

  const canUpdateStatus = (task: Task, newStatus: Task['status']) => {
    // Admins approve/complete anyone; team leads approve their teammates.
    if (newStatus === 'completed') return canApproveTask(task);
    // Workers move it up to "review" (submit for approval).
    if (newStatus === 'started' || newStatus === 'processing' || newStatus === 'review') {
      return isWorker(task);
    }
    return false;
  };

  const canDelete = (task: Task) => {
    // Admins have full control over any task.
    if (isAdmin) return true;
    if (task.task_type === 'personal' && task.created_by === user?.id) {
      return true;
    }
    // Team leads can delete company tasks they created for their team.
    if (task.task_type === 'company' && isTeamLead && task.created_by === user?.id) {
      return true;
    }
    return false;
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tasks</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Manage your tasks and assignments</p>
          </div>
          <button
            onClick={() => setShowCreateTask(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Task</span>
          </button>
        </div>

        {/* Task Type Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setTaskType('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${taskType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            All Tasks
          </button>
          <button
            onClick={() => setTaskType('personal')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${taskType === 'personal'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            <User className="w-4 h-4" />
            Personal
          </button>
          <button
            onClick={() => setTaskType('company')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${taskType === 'company'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            <Users className="w-4 h-4" />
            Company
          </button>
        </div>

        {/* Task Columns - 2x2 board for active statuses, Completed full-width below */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayStatuses.map((status) => (
            <div key={status} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${status === 'completed' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center space-x-2 mb-4">
                <CheckSquare className={`w-5 h-5 ${status === 'pending' ? 'text-gray-400 dark:text-gray-500' :
                    status === 'started' ? 'text-blue-500' :
                      status === 'processing' ? 'text-orange-500' :
                        status === 'review' ? 'text-indigo-500' :
                          'text-green-500'
                  }`} />
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {status === 'pending' ? 'To Do' :
                    status === 'started' ? 'Started' :
                      status === 'processing' ? 'In Progress' :
                        status === 'review' ? 'In Review' : 'Done'}
                </h2>
                <span className="ml-auto text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {tasksByStatus[status].length}
                  {status === 'completed' && (completedFilters.month || completedFilters.user) && (
                    <span className="text-gray-400 dark:text-gray-500"> / {allCompletedTasks.length}</span>
                  )}
                </span>
              </div>

              {status === 'completed' && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <select
                    value={completedFilters.month}
                    onChange={(e) => setCompletedFilters({ ...completedFilters, month: e.target.value })}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="">All months</option>
                    {completedMonthOptions.map((m) => (
                      <option key={m} value={m}>{formatMonth(m)}</option>
                    ))}
                  </select>
                  <select
                    value={completedFilters.user}
                    onChange={(e) => setCompletedFilters({ ...completedFilters, user: e.target.value })}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="">All users</option>
                    {completedUserOptions.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  {(completedFilters.month || completedFilters.user) && (
                    <button
                      onClick={() => setCompletedFilters({ month: '', user: '' })}
                      className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {tasksByStatus[status].map((task: Task) => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-lg border-2 hover:shadow-md transition-shadow ${task.task_type === 'company'
                        ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800'
                        : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {task.task_type === 'company' ? (
                            <Users className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <User className="w-3 h-3 text-green-600 dark:text-green-400" />
                          )}
                          <button
                            type="button"
                            onClick={() => setViewingTask(task)}
                            className="font-medium text-gray-900 dark:text-gray-100 text-left hover:text-blue-600 hover:underline transition-colors"
                          >
                            {task.title}
                          </button>
                        </div>
                        {task.task_type === 'company' && (
                          <>
                            {task.assigned_to_name && (
                              <p className="text-xs text-gray-600 dark:text-gray-300">
                                Assigned to: {task.assigned_to_name}
                              </p>
                            )}
                            {task.created_by_name && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Assigned by: {task.created_by_name}
                              </p>
                            )}
                          </>
                        )}
                        {task.task_type === 'personal' && task.created_by_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            By: {task.created_by_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => setViewingTask(task)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-blue-600 dark:text-blue-400"
                          title="View full details"
                        >
                          <span className="text-xs font-medium">View</span>
                        </button>
                        {canEdit(task) && (
                          <button
                            onClick={() => openEditModal(task)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
                            title="Edit task"
                          >
                            <span className="text-xs font-medium">Edit</span>
                          </button>
                        )}
                        {canDelete(task) && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 hover:bg-red-100 rounded text-red-600 dark:text-red-400"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {task.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{task.description}</p>
                    )}

                    {(task.dataset_name || task.dataset_links || task.dataset_size || task.limitations || task.novelty) && (
                      <div className="mb-2 space-y-1 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700 pt-2">
                        {task.dataset_name && <p><span className="font-medium">Dataset:</span> {task.dataset_name}</p>}
                        {task.dataset_links && <p><span className="font-medium">Links:</span> {task.dataset_links}</p>}
                        {task.dataset_size && <p><span className="font-medium">Size:</span> {task.dataset_size}</p>}
                        {task.limitations && <p><span className="font-medium">Limitations:</span> {task.limitations}</p>}
                        {task.novelty && <p><span className="font-medium">Novelty:</span> {task.novelty}</p>}
                      </div>
                    )}

                    {(task.completion_results || task.completion_values || task.completion_summary) && (
                      <div className="mb-2 space-y-2 text-xs text-gray-700 dark:text-gray-200 border-t border-green-200 dark:border-green-800 pt-2 bg-green-50/40 -mx-1 px-2 rounded">
                        {task.completion_results && (
                          <div>
                            <span className="font-medium">Results:</span>
                            <div className="mt-1"><MarkdownRenderer>{task.completion_results}</MarkdownRenderer></div>
                          </div>
                        )}
                        {task.completion_values && (
                          <div>
                            <span className="font-medium">Values:</span>
                            <div className="mt-1"><MarkdownRenderer>{task.completion_values}</MarkdownRenderer></div>
                          </div>
                        )}
                        {task.completion_summary && (
                          <div>
                            <span className="font-medium">Summary:</span>
                            <div className="mt-1"><MarkdownRenderer>{task.completion_summary}</MarkdownRenderer></div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end text-xs flex-wrap gap-2">
                      <div className="flex flex-col items-end text-[11px] text-gray-500 dark:text-gray-400 gap-0.5">
                        {task.due_date && (
                          <span>
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                        {task.started_at && (
                          <span>
                            Work started: {new Date(task.started_at).toLocaleDateString()}
                          </span>
                        )}
                        {task.completed_at && (
                          <span>
                            Completed: {new Date(task.completed_at).toLocaleDateString()}
                          </span>
                        )}
                        {task.status === 'completed' && task.approved_by_name && (
                          <span>
                            Approved by: {task.approved_by_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Update Buttons */}
                    {status !== 'completed' && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {status === 'pending' && canUpdateStatus(task, 'started') && (
                          <button
                            onClick={() => handleUpdateStatus(task, 'started')}
                            className="flex-1 text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200"
                          >
                            Start
                          </button>
                        )}
                        {status === 'started' && canUpdateStatus(task, 'processing') && (
                          <button
                            onClick={() => handleUpdateStatus(task, 'processing')}
                            className="flex-1 text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200"
                          >
                            Processing
                          </button>
                        )}
                        {status === 'processing' && canUpdateStatus(task, 'review') && (
                          <button
                            onClick={() => handleUpdateStatus(task, 'review')}
                            className="flex-1 text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200"
                          >
                            Submit for Approval
                          </button>
                        )}
                        {status === 'review' && canApproveTask(task) && (
                          <button
                            onClick={() => handleApproveTask(task)}
                            className="flex-1 text-xs px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded hover:bg-green-200"
                          >
                            Approve &amp; Complete
                          </button>
                        )}
                        {status === 'review' && !canApproveTask(task) && (
                          <span className="flex-1 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded text-center">
                            Awaiting approval
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {tasksByStatus[status].length === 0 && (
                  <p className="text-gray-400 dark:text-gray-500 text-center py-8">No tasks</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Create Task Modal */}
        {showCreateTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Create Task</h3>
                <button onClick={() => setShowCreateTask(false)}>
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                {/* Task Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Task Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewTask({ ...newTask, task_type: 'personal', assigned_to: '' })}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${newTask.task_type === 'personal'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      Personal
                    </button>
                    <button
                      onClick={() => setNewTask({ ...newTask, task_type: 'company', assigned_to: newTask.assigned_to || user?.id || '' })}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${newTask.task_type === 'company'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      Company
                    </button>
                  </div>
                </div>

                {/* Assign To (Company tasks only) */}
                {newTask.task_type === 'company' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Assign To <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newTask.assigned_to}
                      onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    >
                      <option value="">Select user...</option>
                      {assignmentOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Enter task title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Task details..."
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Due date is set later when moving the task to Processing.
                </p>
                <button
                  onClick={handleCreateTask}
                  disabled={!newTask.title.trim()}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing Details Modal */}
        {processingTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Processing Details</h3>
                <button onClick={() => setProcessingTask(null)}>
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Dataset Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={processingValues.dataset_name}
                    onChange={(e) => setProcessingValues({ ...processingValues, dataset_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Dataset Links <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={processingValues.dataset_links}
                    onChange={(e) => setProcessingValues({ ...processingValues, dataset_links: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Dataset Size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={processingValues.dataset_size}
                    onChange={(e) => setProcessingValues({ ...processingValues, dataset_size: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Limitations <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={processingValues.limitations}
                    onChange={(e) => setProcessingValues({ ...processingValues, limitations: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Novelty <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={processingValues.novelty}
                    onChange={(e) => setProcessingValues({ ...processingValues, novelty: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={processingValues.due_date}
                    onChange={(e) => setProcessingValues({ ...processingValues, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Estimate when this task will be completed.
                  </p>
                </div>
                <button
                  onClick={handleSaveProcessingDetails}
                  className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700"
                >
                  Move to Processing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Completion Details Modal (admin only) */}
        {completionTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Submit for Admin Approval</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Enter the final results, values, and summary. An admin will review and complete the task.
                  </p>
                </div>
                <button onClick={() => setCompletionTask(null)}>
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Results <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completionValues.completion_results}
                    onChange={(e) => setCompletionValues({ ...completionValues, completion_results: e.target.value })}
                    rows={3}
                    placeholder="Final outputs, deliverables, links to artifacts..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Values <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completionValues.completion_values}
                    onChange={(e) => setCompletionValues({ ...completionValues, completion_values: e.target.value })}
                    rows={3}
                    placeholder="Metrics, numbers, benchmarks recorded by the assignee..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Overview Summary <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completionValues.completion_summary}
                    onChange={(e) => setCompletionValues({ ...completionValues, completion_summary: e.target.value })}
                    rows={3}
                    placeholder="One-paragraph overview of what was done and outcomes..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <button
                  onClick={handleSubmitForApproval}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                >
                  Submit for Approval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Task Modal */}
        {editingTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edit Task</h3>
                <button onClick={() => setEditingTask(null)}>
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editValues.title}
                    onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                  <textarea
                    value={editValues.description}
                    onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editValues.due_date}
                    onChange={(e) => setEditValues({ ...editValues, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Dataset Name</label>
                  <input
                    type="text"
                    value={editValues.dataset_name}
                    onChange={(e) => setEditValues({ ...editValues, dataset_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Dataset Links</label>
                  <textarea
                    value={editValues.dataset_links}
                    onChange={(e) => setEditValues({ ...editValues, dataset_links: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Dataset Size</label>
                  <input
                    type="text"
                    value={editValues.dataset_size}
                    onChange={(e) => setEditValues({ ...editValues, dataset_size: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Limitations</label>
                  <textarea
                    value={editValues.limitations}
                    onChange={(e) => setEditValues({ ...editValues, limitations: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Novelty</label>
                  <textarea
                    value={editValues.novelty}
                    onChange={(e) => setEditValues({ ...editValues, novelty: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editValues.title.trim()}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Task Details Modal */}
        {viewingTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className={`px-6 py-4 border-b sticky top-0 z-10 ${viewingTask.task_type === 'company' ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-100 dark:border-purple-800' : 'bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-800'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {viewingTask.task_type === 'company' ? (
                        <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <User className="w-4 h-4 text-green-600 dark:text-green-400" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {viewingTask.task_type} task · {viewingTask.status}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{viewingTask.title}</h3>
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
                    <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Due Date</h4>
                    <p className="text-gray-700 dark:text-gray-200">{viewingTask.due_date ? new Date(viewingTask.due_date).toLocaleDateString() : '—'}</p>
                  </div>
                  {viewingTask.task_type === 'company' && (
                    <>
                      <div>
                        <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Assigned To</h4>
                        <p className="text-gray-700 dark:text-gray-200">{viewingTask.assigned_to_name || '—'}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Assigned By</h4>
                        <p className="text-gray-700 dark:text-gray-200">{viewingTask.created_by_name || '—'}</p>
                      </div>
                    </>
                  )}
                  {viewingTask.task_type === 'personal' && viewingTask.created_by_name && (
                    <div>
                      <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Owner</h4>
                      <p className="text-gray-700 dark:text-gray-200">{viewingTask.created_by_name}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">Created</h4>
                    <p className="text-gray-700 dark:text-gray-200">{new Date(viewingTask.created_at).toLocaleString()}</p>
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

                {(viewingTask.dataset_name || viewingTask.dataset_links || viewingTask.dataset_size || viewingTask.limitations || viewingTask.novelty) && (
                  <section className="border-t pt-4">
                    <h4 className="text-xs font-bold uppercase text-orange-600 dark:text-orange-400 mb-3">Processing Details</h4>
                    <div className="space-y-3">
                      {viewingTask.dataset_name && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Dataset Name</span>
                          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.dataset_name}</p>
                        </div>
                      )}
                      {viewingTask.dataset_links && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Dataset Links</span>
                          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-all">{viewingTask.dataset_links}</p>
                        </div>
                      )}
                      {viewingTask.dataset_size && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Dataset Size</span>
                          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.dataset_size}</p>
                        </div>
                      )}
                      {viewingTask.limitations && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Limitations</span>
                          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.limitations}</p>
                        </div>
                      )}
                      {viewingTask.novelty && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase block">Novelty</span>
                          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{viewingTask.novelty}</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

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

                <div className="flex gap-2 pt-4 border-t">
                  {canEdit(viewingTask) && (
                    <button
                      onClick={() => {
                        const task = viewingTask;
                        setViewingTask(null);
                        openEditModal(task);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      Edit Task
                    </button>
                  )}
                  <button
                    onClick={() => setViewingTask(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
