import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cancelarSolicitud, listarSolicitudes } from "../services/solicitudes.js";
import "./MisSolicitudesPage.css";

const cancelable = new Set(["Pendiente", "Aprobada"]);

const formatearFecha = (valor, incluirHora = false) => {
  if (!valor) return "—";
  const fecha = incluirHora
    ? new Date(String(valor).replace(" ", "T"))
    : new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-CO", incluirHora
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(fecha);
};

const claseEstado = (estado) =>
  `historial-estado historial-estado-${String(estado).toLowerCase().replaceAll(" ", "-")}`;

export function MisSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cancelando, setCancelando] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async (signal) => {
    setError("");
    setCargando(true);
    try {
      setSolicitudes((await listarSolicitudes({ signal })) ?? []);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setSolicitudes([]);
        setError(requestError.message || "No fue posible consultar tus solicitudes.");
      }
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  async function cancelar(solicitud) {
    if (!window.confirm(`¿Cancelar la solicitud #${solicitud.id_solicitud}?`)) return;
    setCancelando(solicitud.id_solicitud);
    setError("");
    setMensaje("");
    try {
      await cancelarSolicitud(solicitud.id_solicitud);
      await cargar();
      setMensaje(`La solicitud #${solicitud.id_solicitud} fue cancelada.`);
    } catch (requestError) {
      setError(requestError.message || "No fue posible cancelar la solicitud.");
    } finally {
      setCancelando(null);
    }
  }

  return (
    <section className="container historial-page">
      <header className="historial-encabezado">
        <div>
          <p className="eyebrow">Seguimiento</p>
          <h1>Mis solicitudes</h1>
          <p>Consulta el estado y los detalles de tus préstamos de equipos.</p>
        </div>
        <div className="historial-acciones-cabecera">
          <button className="button button-outline" type="button" onClick={() => cargar()} disabled={cargando}>
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
          <Link className="button button-primary" to="/solicitar">Nueva solicitud</Link>
        </div>
      </header>

      {error && <p className="historial-aviso historial-error" role="alert">{error}</p>}
      {mensaje && <p className="historial-aviso historial-exito" role="status">{mensaje}</p>}

      {cargando ? (
        <p className="historial-vacio" role="status">Cargando solicitudes…</p>
      ) : solicitudes.length === 0 ? (
        <div className="historial-vacio">
          <h2>Aún no tienes solicitudes</h2>
          <p>Cuando solicites un equipo, podrás hacer seguimiento desde aquí.</p>
          <Link className="button button-primary" to="/solicitar">Crear mi primera solicitud</Link>
        </div>
      ) : (
        <div className="historial-lista">
          {solicitudes.map((solicitud) => (
            <article className="historial-tarjeta" key={solicitud.id_solicitud}>
              <header>
                <div>
                  <span className="historial-id">Solicitud #{solicitud.id_solicitud}</span>
                  <small>Creada {formatearFecha(solicitud.fecha_solicitud, true)}</small>
                </div>
                <span className={claseEstado(solicitud.nombre_estado)}>{solicitud.nombre_estado}</span>
              </header>

              <dl className="historial-datos">
                <div><dt>Inicio</dt><dd>{formatearFecha(solicitud.fecha_inicio)}</dd></div>
                <div><dt>Finalización</dt><dd>{formatearFecha(solicitud.fecha_fin)}</dd></div>
                <div className="historial-ancho">
                  <dt>Equipos</dt>
                  <dd>
                    {solicitud.equipos?.length
                      ? solicitud.equipos.map((equipo) => equipo.nombre).join(", ")
                      : "Sin equipos asociados"}
                  </dd>
                </div>
                {solicitud.observacion && (
                  <div className="historial-ancho"><dt>Observación</dt><dd>{solicitud.observacion}</dd></div>
                )}
              </dl>

              {cancelable.has(solicitud.nombre_estado) && (
                <footer>
                  <button
                    type="button"
                    className="historial-cancelar"
                    disabled={cancelando === solicitud.id_solicitud}
                    onClick={() => cancelar(solicitud)}
                  >
                    {cancelando === solicitud.id_solicitud ? "Cancelando…" : "Cancelar solicitud"}
                  </button>
                </footer>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
