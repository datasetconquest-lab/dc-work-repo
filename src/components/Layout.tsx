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
  X,
  Shield,
  Briefcase
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
    { name: 'Users & Access', icon: Users, path: '/admin/users' },
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

  const getInitials = (name?: string) => {
    if (!name) return 'DC';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#101827] text-slate-800 dark:text-slate-100 flex transition-colors duration-200">
      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/95 dark:bg-[#151F32]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="h-8 flex items-center">
          <Logo className="h-7 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 dark:bg-[#1B273B] rounded-lg p-0.5">
            <ThemeToggle className="p-1.5" />
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B273B] transition-colors"
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Desktop & Mobile Drawer Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-[#151F32] border-r border-slate-200/90 dark:border-[#243249] flex flex-col justify-between transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-100 dark:border-[#243249] flex items-center justify-between">
            <div className="h-10 flex items-center">
              <Logo className="h-9 w-auto object-contain" />
            </div>
            {profile?.role === 'admin' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/50">
                <Shield className="w-3 h-3" />
                Admin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#243249] text-slate-600 dark:text-slate-300">
                <Briefcase className="w-3 h-3" />
                Member
              </span>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Workspace Menu
            </div>
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-[#1B273B]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                    }`}
                  />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile & Actions Footer */}
          <div className="p-3.5 border-t border-slate-100 dark:border-[#243249] space-y-2">
            {/* User Details Card */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1B273B] border border-slate-200/60 dark:border-[#2E3D56] flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {getInitials(profile?.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {profile?.full_name || 'User'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {profile?.email}
                  </p>
                </div>
              </div>
              <div className="shrink-0 pl-1">
                <ThemeToggle className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-[#243249]" />
              </div>
            </div>

            {/* Portal Switcher & Logout Buttons */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={() => {
                  clearPortal();
                  setSidebarOpen(false);
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-[#243249] transition-colors"
                title="Back to Portals"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />
                <span>Portals</span>
              </button>

              <button
                onClick={handleSignOut}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-slate-700/80 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen flex flex-col">
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
