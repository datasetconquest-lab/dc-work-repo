export type StoredAuth = {
  token: string;
  userJson: string;
};

const LS_TOKEN = 'auth_token';
const LS_USER = 'auth_user';

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(LS_TOKEN) || sessionStorage.getItem(LS_TOKEN);
  const userJson = localStorage.getItem(LS_USER) || sessionStorage.getItem(LS_USER);
  if (!token || !userJson) return null;
  return { token, userJson };
}

export function setStoredAuth(token: string, user: unknown, rememberMe: boolean) {
  // Clear both first to avoid stale state
  clearStoredAuth();
  const store = rememberMe ? localStorage : sessionStorage;
  store.setItem(LS_TOKEN, token);
  store.setItem(LS_USER, JSON.stringify(user));
  // Persist the preference so we can reason about future behavior if needed
  store.setItem('remember_me', rememberMe ? '1' : '0');
}

export function clearStoredAuth() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem(LS_TOKEN);
    s.removeItem(LS_USER);
    s.removeItem('remember_me');
  }
}

