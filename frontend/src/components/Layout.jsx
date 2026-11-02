import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { estadoRedireccion } from "./ProtectedRoute.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true, state: estadoRedireccion("logout") });
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Préstamos UAO, inicio">
          <span className="brand-mark">U</span>
          <span>
            Préstamos <strong>UAO</strong>
          </span>
        </NavLink>
        <nav aria-label="Navegación principal">
          <NavLink to="/">Inicio</NavLink>
          {user ? (
            <>
              <NavLink to="/dashboard">Panel</NavLink>
              <NavLink to="/inventario">Inventario</NavLink>
              <button className="nav-logout" type="button" onClick={handleLogout}>
                Salir
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Ingresar</NavLink>
              <NavLink className="nav-cta" to="/registro">
                Crear cuenta
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Proyecto académico · Gestión de equipos multimedia</span>
        <span>Universidad Autónoma de Occidente</span>
      </footer>
    </div>
  );
}
