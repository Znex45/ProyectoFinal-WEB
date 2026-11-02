import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { estadoRedireccion } from "../components/ProtectedRoute.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function DashboardPage() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    await logout();
    navigate("/login", { replace: true, state: estadoRedireccion("logout") });
  }

  return (
    <section className="container dashboard-page">
      <span className="eyebrow">PANEL DE USUARIO · {user?.rol?.toUpperCase()}</span>
      <h1>Hola, {user?.nombres || "bienvenido"}.</h1>
      <p className="form-intro">
        {isAdmin
          ? "Administra el inventario de equipos: agrega, edita o retira recursos."
          : "Consulta los equipos disponibles para tus actividades académicas."}
      </p>
      <div className="dashboard-links">
        <Link className="button button-primary" to="/inventario">
          {isAdmin ? "Gestionar inventario" : "Ver inventario"} <span aria-hidden="true">↗</span>
        </Link>
        <button className="button button-outline" type="button" onClick={handleLogout} disabled={busy}>
          {busy ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      </div>
    </section>
  );
}
