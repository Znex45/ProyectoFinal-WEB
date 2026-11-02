import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler } from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Por qué se perdió la sesión: "logout" (el usuario salió) o "expirada" (la API respondió 401).
  const [motivoSalida, setMotivoSalida] = useState(null);

  // Consulta al servidor si hay una sesión activa (al cargar la app o recargar la página).
  const refreshMe = useCallback(async () => {
    try {
      const data = await api("/api/auth/me");
      setUser(data?.user ?? null);
      return data?.user ?? null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // Si cualquier petición protegida devuelve 401, la sesión venció: se limpia el usuario
  // y ProtectedRoute redirige a /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMotivoSalida("expirada");
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (correo, password) => {
    const data = await api("/api/auth/login", { method: "POST", body: { correo, password } });
    if (!data?.user) throw new Error("El servidor no devolvió el usuario autenticado.");
    setMotivoSalida(null);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback((datos) => api("/api/auth/register", { method: "POST", body: datos }), []);

  // El usuario se limpia siempre, aunque el servidor no responda.
  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.warn("No se pudo cerrar la sesión en el servidor:", error.message);
    } finally {
      setMotivoSalida("logout");
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      motivoSalida,
      isAdmin: user?.rol === "Administrador",
      login,
      register,
      logout,
      refreshMe,
    }),
    [user, loading, motivoSalida, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
