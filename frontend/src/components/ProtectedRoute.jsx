import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <p role="status">Verificando sesión…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
