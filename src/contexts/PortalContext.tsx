import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

export type Portal = 'user' | 'eda';

interface PortalContextType {
  portal: Portal | null;
  choosePortal: (p: Portal) => void;
  clearPortal: () => void;
}

const STORAGE_KEY = 'dc_active_portal';

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [portal, setPortal] = useState<Portal | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'user' || saved === 'eda' ? saved : null;
  });

  // When the user logs out, forget the chosen portal so the next login shows
  // the chooser again. Guard on `loading` so we don't wipe the saved selection
  // during the initial auth-restore (when `user` is briefly null).
  useEffect(() => {
    if (!loading && !user) {
      localStorage.removeItem(STORAGE_KEY);
      setPortal(null);
    }
  }, [user, loading]);

  const choosePortal = useCallback((p: Portal) => {
    localStorage.setItem(STORAGE_KEY, p);
    setPortal(p);
  }, []);

  const clearPortal = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPortal(null);
  }, []);

  return (
    <PortalContext.Provider value={{ portal, choosePortal, clearPortal }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (ctx === undefined) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return ctx;
}
