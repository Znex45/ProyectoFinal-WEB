import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Estado que recibe /login: tras un logout no se recuerda la página; si la sesión venció, sí.
export function estadoRedireccion(motivoSalida, location) {
  if (motivoSalida === "logout") return { notice: "Sesión cerrada correctamente." };
  if (motivoSalida === "expirada") {
    return { from: location, notice: "Tu sesión venció. Inicia sesión de nuevo para continuar." };
  }
  return { from: location };
}

// Rutas privadas: sin sesión redirige a /login y recuerda la página solicitada.
export function ProtectedRoute() {
  const { user, loading, motivoSalida } = useAuth();
  const location = useLocation();

  if (loading) return <p className="container route-status" role="status">Verificando sesión…</p>;
  if (!user) return <Navigate to="/login" replace state={estadoRedireccion(motivoSalida, location)} />;
  return <Outlet />;
}

// Página a la que se vuelve después de iniciar sesión.
export const destinoTrasLogin = (location) => location.state?.from?.pathname || "/dashboard";

// Rutas sólo para visitantes (login, registro): con sesión activa redirige al panel
// (o a la página privada que se había solicitado).
export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="container route-status" role="status">Verificando sesión…</p>;
  if (user) return <Navigate to={destinoTrasLogin(location)} replace />;
  return <Outlet />;
}
