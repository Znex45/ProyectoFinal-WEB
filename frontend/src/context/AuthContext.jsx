import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/auth/me");
      setUser(data?.user ?? null);
      return data?.user ?? null;
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe().catch(() => setUser(null));
  }, [refreshMe]);

  const login = useCallback(async (correo, password) => {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { correo, password },
    });
    if (!data?.user) throw new Error("El servidor no devolvió el usuario autenticado.");
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback((datos) =>
    api("/api/auth/register", { method: "POST", body: datos }), []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshMe }),
    [user, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
