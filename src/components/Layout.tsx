import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePortal } from '../contexts/PortalContext';
import { useLocation } from '../hooks/useNavigation';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import {
  LayoutDashboard,
  Users,
  User as UserIcon,
  MessageSquare,
  CheckSquare,
  Calendar,
  Mail,
  LogOut,
  LayoutGrid,
  Menu,
  X
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { clearPortal } = usePortal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname, navigate } = useLocation();

  const adminNavItems = [
    { name: 'Admin Hub', icon: LayoutDashboard, path: '/admin' },
    { name: 'Users', icon: Users, path: '/admin/users' },
    { name: 'Tasks', icon: CheckSquare, path: '/admin/tasks' },
    { name: 'Groups', icon: MessageSquare, path: '/admin/groups' },
    { name: 'Calendar', icon: Calendar, path: '/admin/calendar' },
    { name: 'Messages', icon: MessageSquare, path: '/messages' },
    { name: 'Mail', icon: Mail, path: '/admin/mail' },
    { name: 'Profile', icon: UserIcon, path: '/admin/profile' },
  ];

  const memberNavItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    { name: 'Groups', icon: MessageSquare, path: '/groups' },
    { name: 'Calendar', icon: Calendar, path: '/calendar' },
    { name: 'Messages', icon: MessageSquare, path: '/messages' },
    { name: 'Profile', icon: UserIcon, path: '/profile' },
  ];

  const navItems = profile?.role === 'admin' ? adminNavItems : memberNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700/50 dark:bg-gray-900">
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 px-4 py-3 flex items-center justify-between">
        <Logo className="h-16 w-auto" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <Logo className="w-full h-auto" />
            <p className="text-sm text-gray-600 dark:text-gray-300 dark:text-gray-400 mt-2 capitalize">
              {profile?.role === 'tl' ? 'Team Lead' : profile?.role}
            </p>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto font-poppins">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                    ? 'bg-blue-600 text-white shadow-md font-medium'
                    : 'text-gray-700 dark:text-gray-200 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-3 flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{profile?.full_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile?.email}</p>
              </div>
              <ThemeToggle className="flex-shrink-0" />
            </div>
            <button
              onClick={() => { clearPortal(); setSidebarOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 mb-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <LayoutGrid className="w-5 h-5" />
              <span>Back to Portals</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="lg:ml-64 pt-24 lg:pt-0">
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
