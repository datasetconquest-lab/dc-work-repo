import { useState, useEffect } from 'react';

export function useLocation() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setPathname(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return { pathname, navigate };
}
