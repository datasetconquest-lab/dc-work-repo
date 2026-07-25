import { useEffect, useState } from 'react';
import { dataAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { CheckSquare, Calendar, TrendingUp, Users } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useNotifications } from '../components/Notifications';

interface TaskCounts {
  total: number;
  pending: number;
  started: number;
  processing: number;
  review: number;
  completed: number;
}

export function MemberDashboard() {
  const { user } = useAuth();
  const { showError, NotificationContainer } = useNotifications();
  const [companyTaskCounts, setCompanyTaskCounts] = useState<TaskCounts>({
    total: 0,
    pending: 0,
    started: 0,
    processing: 0,
    review: 0,
    completed: 0,
  });
  const [personalTaskCounts, setPersonalTaskCounts] = useState({
    pending: 0,
    inProgress: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboardData();

      // Auto-refresh every 30 seconds
      const interval = setInterval(loadDashboardData, 30000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    try {
      // Load company task counts
      const companyCounts = await dataAPI.getTaskCounts();
      setCompanyTaskCounts({
        total: parseInt(companyCounts.total) || 0,
        pending: parseInt(companyCounts.pending) || 0,
        started: parseInt(companyCounts.started) || 0,
        processing: parseInt(companyCounts.processing) || 0,
        review: parseInt(companyCounts.review) || 0,
        completed: parseInt(companyCounts.completed) || 0,
      });

      // Load personal tasks
      const personalTasks = await dataAPI.getTasks({ type: 'personal' });
      const personalSummary = {
        pending: 0,
        inProgress: 0,
        completed: 0,
      };

      personalTasks?.forEach((task: any) => {
        if (task.status === 'pending') personalSummary.pending++;
        else if (task.status === 'started' || task.status === 'processing') personalSummary.inProgress++;
        else if (task.status === 'completed') personalSummary.completed++;
      });

      setPersonalTaskCounts(personalSummary);
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
      showError(error.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
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

  const totalCompanyActive = companyTaskCounts.pending + companyTaskCounts.started + companyTaskCounts.processing + companyTaskCounts.review;
  const companyCompletionRate = companyTaskCounts.total > 0
    ? Math.round((companyTaskCounts.completed / companyTaskCounts.total) * 100)
    : 0;

  const totalPersonalTasks = personalTaskCounts.pending + personalTaskCounts.inProgress + personalTaskCounts.completed;
  const personalCompletionRate = totalPersonalTasks > 0
    ? Math.round((personalTaskCounts.completed / totalPersonalTasks) * 100)
    : 0;

  return (
    <Layout>
      <NotificationContainer />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Your daily overview and updates</p>
        </div>

        {/* Company Tasks Overview */}
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold">Company Tasks</h2>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{totalCompanyActive}</p>
              <p className="text-sm text-purple-100">Active Tasks</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-sm text-purple-100 mb-1">Pending</p>
              <p className="text-2xl font-bold">{companyTaskCounts.pending}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-sm text-purple-100 mb-1">In Progress</p>
              <p className="text-2xl font-bold">
                {companyTaskCounts.started + companyTaskCounts.processing + companyTaskCounts.review}
              </p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-sm text-purple-100 mb-1">Completed</p>
              <p className="text-2xl font-bold">{companyTaskCounts.completed}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Personal Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personal Tasks</h3>
              <CheckSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-300">To Do</span>
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{personalTaskCounts.pending}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-300">In Progress</span>
                <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">{personalTaskCounts.inProgress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-300">Done</span>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">{personalTaskCounts.completed}</span>
              </div>
            </div>
          </div>

          {/* Company Productivity */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Company Productivity</h3>
              <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                {companyCompletionRate}%
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Task Completion Rate</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {companyTaskCounts.completed} of {companyTaskCounts.total} tasks
              </p>
            </div>
          </div>

          {/* Personal Productivity */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personal Productivity</h3>
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                {personalCompletionRate}%
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Task Completion Rate</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {personalTaskCounts.completed} of {totalPersonalTasks} tasks
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Company Task Status</h2>
              <Users className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Pending Tasks</span>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{companyTaskCounts.pending}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Started</span>
                <span className="text-lg font-bold text-blue-900 dark:text-blue-200">{companyTaskCounts.started}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Processing</span>
                <span className="text-lg font-bold text-orange-900 dark:text-orange-200">{companyTaskCounts.processing}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">In Review</span>
                <span className="text-lg font-bold text-indigo-900 dark:text-indigo-200">{companyTaskCounts.review}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <span className="text-sm font-medium text-green-700 dark:text-green-300">Completed</span>
                <span className="text-lg font-bold text-green-900 dark:text-green-200">{companyTaskCounts.completed}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Quick Actions</h2>
              <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="space-y-3">
              <a
                href="/tasks"
                className="block p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <p className="font-medium text-purple-900 dark:text-purple-200">View Company Tasks</p>
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  {totalCompanyActive} tasks need your attention
                </p>
              </a>
              <a
                href="/tasks"
                className="block p-3 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 transition-colors"
              >
                <p className="font-medium text-green-900 dark:text-green-200">View Personal Tasks</p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  {personalTaskCounts.pending + personalTaskCounts.inProgress} tasks pending
                </p>
              </a>
              <a
                href="/calendar"
                className="block p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <p className="font-medium text-blue-900 dark:text-blue-200">Check Calendar</p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">View upcoming events and deadlines</p>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
