import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { logoutUser } from '../lib/api';

export type AuthUser = {
  user_id: string;
  username: string;
  display_name: string;
};

type AuthContextType = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

// Only non-sensitive display info is stored locally — the JWT itself lives in
// an httpOnly cookie set by the server and is never accessible to JavaScript.
const USER_KEY = 'planit_user_info';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Verify the session cookie is still valid by hitting /api/auth/me.
    // This also hydrates fresh user info after any profile changes.
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then((data: AuthUser) => {
        setUser(data);
        localStorage.setItem(USER_KEY, JSON.stringify(data));
      })
      .catch(() => {
        // Cookie expired or missing — clear any stale local state.
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((newUser: AuthUser) => {
    // The session cookie was already set by the server in the login response.
    // We only persist display info locally for fast UI hydration on next load.
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    logoutUser().finally(() => {
      localStorage.removeItem(USER_KEY);
      setUser(null);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
