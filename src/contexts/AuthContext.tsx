import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authAPI, dataAPI } from '../lib/api';
import { clearStoredAuth, getStoredAuth, setStoredAuth } from '../lib/authStorage';

interface User {
  id: string;
  email: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: 'admin' | 'member' | 'manager' | 'tl';
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isTeamLead: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async (userId: string) => {
    try {
      const data = await dataAPI.getUserProfile(userId);
      setProfile(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const stored = getStoredAuth();

        if (stored?.token && stored.userJson) {
          const parsedUser = JSON.parse(stored.userJson);
          setUser(parsedUser);
          await loadUserProfile(parsedUser.id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth init error:', error);
        clearStoredAuth();
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const signIn = async (email: string, password: string, rememberMe: boolean) => {
    try {
      const response = await authAPI.login(email, password);

      setStoredAuth(response.token, response.user, rememberMe);

      setUser(response.user);
      await loadUserProfile(response.user.id);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }

    clearStoredAuth();
    localStorage.removeItem('dc_active_portal');
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const data = await dataAPI.getUserProfile(user.id);
      setProfile(data);
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
    isAdmin: profile?.role === 'admin',
    isTeamLead: profile?.role === 'tl',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
