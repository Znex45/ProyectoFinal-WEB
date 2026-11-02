import React from "react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="container dashboard-page">
      <span className="eyebrow">ERROR 404</span>
      <h1>Página no encontrada.</h1>
      <p className="form-intro">La dirección que buscas no existe o fue movida.</p>
      <div className="dashboard-links">
        <Link className="button button-primary" to="/">
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
