import { useAuth } from '../contexts/AuthContext';
import { usePortal } from '../contexts/PortalContext';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LogOut } from 'lucide-react';

export function PortalChooser() {
  const { profile, signOut } = useAuth();
  const { choosePortal } = usePortal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-100 dark:bg-blue-900/40 rounded-full opacity-20 animate-pulse" style={{ animationDuration: '4s' }}></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-blue-200 dark:bg-blue-800/40 rounded-full opacity-20 animate-pulse" style={{ animationDuration: '6s' }}></div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      <div className="w-full max-w-3xl relative z-10">
        <div className="text-center mb-10">
          {/* Company logo — 5x the previous size (h-14 -> h-[17.5rem]) */}
          <div className="flex justify-center mb-6">
            <Logo className="h-[17.5rem] max-h-[40vh] w-auto max-w-full" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Choose a workspace to continue</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* User portal */}
          <button
            onClick={() => choosePortal('user')}
            className="group aspect-square bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 border-transparent hover:border-blue-500 p-8 flex flex-col items-center justify-center gap-5 transform transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <div className="w-24 h-24 rounded-2xl bg-blue-50 dark:bg-gray-700/60 flex items-center justify-center p-4 group-hover:bg-blue-100 dark:group-hover:bg-gray-700 transition-colors">
              <Logo className="max-w-full max-h-full object-contain" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">User Portal</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Team workspace — messages, tasks, groups, calendar
              </p>
            </div>
          </button>

          {/* EDA portal */}
          <button
            onClick={() => choosePortal('eda')}
            className="group aspect-square bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 border-transparent hover:border-[#6C4DF6] p-8 flex flex-col items-center justify-center gap-5 transform transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <div className="w-24 h-24 rounded-2xl bg-[#F0EBFF] dark:bg-[#232332] flex items-center justify-center p-4 group-hover:bg-[#EDE7FF] dark:group-hover:bg-[#2C2C40] transition-colors">
              <img src="/eda_logo.ico" alt="Research Assistant" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">EDA Portal</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Research Assistant — papers, gaps, datasets, EDA
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
