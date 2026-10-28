import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setError("");
    setBusy(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container dashboard-page">
      <span className="eyebrow">PANEL DE USUARIO</span>
      <h1>Hola, {user?.nombres || "bienvenido"}.</h1>
      <p className="form-intro">Desde aquí puedes consultar los recursos de la plataforma.</p>
      {error && <p className="form-note" role="alert">{error}</p>}
      <div className="dashboard-links">
        <Link className="button button-primary" to="/inventario">Ver inventario</Link>
        <Link className="button button-outline" to="/archivos">Archivos multimedia</Link>
      </div>
      <button className="button button-outline dashboard-logout" type="button" onClick={handleLogout} disabled={busy}>
        {busy ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </section>
  );
}
