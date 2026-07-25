import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, ShieldAlert, LogOut } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700/50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700/50 p-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Access Restricted</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            Your session has expired or your current IP address is not authorized to access this section.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="/login"
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              Sign In
            </a>
            <button
              onClick={() => signOut()}
              className="w-full py-3 text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Clear Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (requireAdmin && profile.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700/50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-300">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
