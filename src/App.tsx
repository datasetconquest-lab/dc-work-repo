import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PortalProvider, usePortal } from './contexts/PortalContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { PortalChooser } from './pages/PortalChooser';
import { EdaApp } from './eda/EdaApp';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminMail } from './pages/AdminMail';
import { MemberDashboard } from './pages/MemberDashboard';
import { Messages } from './pages/Messages';
import { Groups } from './pages/Groups';
import { Tasks } from './pages/Tasks';
import { Calendar } from './pages/Calendar';
import { Profile } from './pages/Profile';
import { useLocation } from './hooks/useNavigation';
import { GlobalNotifications } from './components/GlobalNotifications';
import { ArrowLeftRight } from 'lucide-react';

// Floating control shown on every User Portal page so the user can switch back
// to the portal chooser (User Portal ↔ EDA Portal) without it living inside
// any individual Teams page.
function BackToPortals() {
  const { clearPortal } = usePortal();
  return (
    <button
      onClick={clearPortal}
      title="Switch portal"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-3 py-2 rounded-full
                 bg-blue-600 text-white text-sm font-medium shadow-lg hover:bg-blue-700
                 transition-colors"
    >
      <ArrowLeftRight className="w-4 h-4" />
      Switch Portal
    </button>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const { portal } = usePortal();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // After login, the user picks a workspace (User portal vs EDA portal).
  if (!portal) {
    return <PortalChooser />;
  }

  if (portal === 'eda') {
    return <EdaApp />;
  }

  const getPage = () => {
    // User is logged in, show appropriate page based on route
    if (pathname === '/admin') {
      return (
        <ProtectedRoute requireAdmin={true}>
          <AdminDashboard />
        </ProtectedRoute>
      );
    }

    if (pathname === '/admin/users') {
      return (
        <ProtectedRoute requireAdmin={true}>
          <AdminUsers />
        </ProtectedRoute>
      );
    }

    if (pathname === '/admin/mail') {
      return (
        <ProtectedRoute requireAdmin={true}>
          <AdminMail />
        </ProtectedRoute>
      );
    }

    if (pathname === '/profile' || pathname === '/admin/profile') {
      return (
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      );
    }

    if (pathname === '/messages' || pathname === '/admin/messages') {
      return (
        <ProtectedRoute>
          <Messages />
        </ProtectedRoute>
      );
    }

    if (pathname === '/dashboard') {
      return (
        <ProtectedRoute>
          <MemberDashboard />
        </ProtectedRoute>
      );
    }

    if (pathname === '/groups' || pathname === '/admin/groups') {
      return (
        <ProtectedRoute>
          <Groups />
        </ProtectedRoute>
      );
    }

    if (pathname === '/tasks' || pathname === '/admin/tasks') {
      return (
        <ProtectedRoute>
          <Tasks />
        </ProtectedRoute>
      );
    }

    if (pathname === '/calendar' || pathname === '/admin/calendar') {
      return (
        <ProtectedRoute>
          <Calendar />
        </ProtectedRoute>
      );
    }

    // Default route - show member dashboard
    return (
      <ProtectedRoute>
        <MemberDashboard />
      </ProtectedRoute>
    );
  };

  return (
    <>
      <GlobalNotifications />
      {getPage()}
      <BackToPortals />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <PortalProvider>
        <AppContent />
      </PortalProvider>
    </AuthProvider>
  );
}

export default App;
