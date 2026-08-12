import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { bootstrapSession, getCachedUser, logoutUser } from '../lib/api';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Paint instantly with the last-known user while the refresh token is
    // verified against the server in the background.
    setUser(getCachedUser());
    bootstrapSession()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((newUser: AuthUser) => {
    // Tokens were already stored by loginUser()/register() in lib/api.
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    logoutUser().finally(() => setUser(null));
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
