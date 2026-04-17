import { createContext, useContext, useEffect, useState } from "react";

import { getMe, login as loginRequest } from "../api/auth";
import { ACCESS_TOKEN_KEY, getStoredToken, setStoredToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (token) {
      setStoredToken(token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }, [token]);

  const clearSession = () => {
    setToken("");
    setCurrentUser(null);
    setStoredToken("");
  };

  const restoreSession = async () => {
    const stored = getStoredToken();
    if (!stored) {
      clearSession();
      setAuthLoading(false);
      return null;
    }
    try {
      setToken(stored);
      const user = await getMe();
      setCurrentUser(user);
      return user;
    } catch {
      clearSession();
      return null;
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    const handleLogout = () => clearSession();
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const login = async (username, password) => {
    const response = await loginRequest(username, password);
    setToken(response.access_token || "");
    setCurrentUser(response.user || null);
    setAuthLoading(false);
    return response.user;
  };

  const updateCurrentUser = (user) => {
    setCurrentUser(user || null);
  };

  const logout = () => {
    clearSession();
    setAuthLoading(false);
  };

  const value = {
    token,
    currentUser,
    authLoading,
    isAuthenticated: Boolean(token && currentUser),
    login,
    logout,
    restoreSession,
    updateCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
