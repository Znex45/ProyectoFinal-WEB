import React from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const correo = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    setError("");
    setBusy(true);
    try {
      await login(correo, password);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.message || "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page container">
      <div className="auth-aside">
        <span className="eyebrow">ACCESO A LA PLATAFORMA</span>
        <h1>Bienvenido de nuevo.</h1>
        <p>
          Pronto podrás gestionar solicitudes y consultar el inventario desde
          aquí.
        </p>
        <div className="aside-line" />
        <span>Préstamos UAO · Proyecto académico</span>
      </div>
      <div className="auth-card">
        <span className="eyebrow">INICIAR SESIÓN</span>
        <h2>Ingresa a tu cuenta</h2>
        <p className="form-intro">
          Utiliza tu correo institucional y contraseña.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
            type="email"
            name="email"
            placeholder="nombre@uao.edu.co"
            autoComplete="email"
            required
          />
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            name="password"
            placeholder="Ingresa tu contraseña"
            autoComplete="current-password"
            required
            minLength="8"
          />
          <button className="button button-primary form-submit" type="submit" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar"} <span aria-hidden="true">↗</span>
          </button>
          <p className="form-note" role={error ? "alert" : "status"}>
            {error || (busy ? "Verificando credenciales…" : location.state?.notice || "")}
          </p>
        </form>
        <p className="form-switch">
          ¿Aún no tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </div>
    </section>
  );
}
