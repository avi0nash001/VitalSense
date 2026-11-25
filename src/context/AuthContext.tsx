import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserProfile } from '../lib/types';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginDemo: (role: 'member' | 'caregiver') => Promise<UserProfile>;
  register: (params: {
    name: string;
    email: string;
    password: string;
    role: 'member' | 'caregiver';
  }) => Promise<UserProfile>;
  logout: () => void;
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);

  const loginDemo = useCallback(async (role: 'member' | 'caregiver') => {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to sign in to demo workspace.');
    }
    setToken(data.token);
    setUser(data.user);
    return data.user as UserProfile;
  }, []);

  useEffect(() => {
    // Support ?autostart=1 or ?demo=caregiver|member for immediate workspace access
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');
    const demoRole = params.get('demo');

    if (autostart === '1' || demoRole === 'member' || demoRole === 'caregiver') {
      const targetRole = demoRole === 'caregiver' ? 'caregiver' : 'member';
      loginDemo(targetRole)
        .catch(() => undefined)
        .finally(() => setIsBootstrapping(false));
    } else {
      setIsBootstrapping(false);
    }
  }, [loginDemo]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials.');
    }
    setToken(data.token);
    setUser(data.user);
    return data.user as UserProfile;
  }, []);

  const register = useCallback(
    async (params: {
      name: string;
      email: string;
      password: string;
      role: 'member' | 'caregiver';
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }
      setToken(data.token);
      setUser(data.user);
      return data.user as UserProfile;
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const apiFetch = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const headers = new Headers(init?.headers);
      if (!headers.has('Content-Type') && init?.body) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(url, { ...init, headers });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setToken(null);
        setUser(null);
        throw new Error(data.error || 'Your session has expired. Please sign in again.');
      }
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isBootstrapping,
        login,
        loginDemo,
        register,
        logout,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
