import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";
import { crearSolicitud } from "../services/solicitudes.js";
import "./SolicitarPrestamoPage.css";

const formularioInicial = {
  fecha_inicio: "",
  fecha_fin: "",
  observacion: "",
};

export function SolicitarPrestamoPage() {
  const [equipos, setEquipos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [creada, setCreada] = useState(null);

  const cargarEquipos = useCallback(async (signal) => {
    setError("");
    setCargando(true);
    try {
      const lista = (await api("/api/equipos", { signal })) ?? [];
      setEquipos(
        lista.filter(
          (equipo) => equipo.activo !== false && equipo.nombre_estado === "Disponible",
        ),
      );
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "No fue posible consultar los equipos disponibles.");
      }
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargarEquipos(controller.signal);
    return () => controller.abort();
  }, [cargarEquipos]);

  const equiposSeleccionados = useMemo(
    () => new Set(seleccionados),
    [seleccionados],
  );

  function cambiarCampo(event) {
    const { name, value } = event.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
    setError("");
    setCreada(null);
  }

  function alternarEquipo(idEquipo) {
    setSeleccionados((actuales) =>
      actuales.includes(idEquipo)
        ? actuales.filter((id) => id !== idEquipo)
        : [...actuales, idEquipo],
    );
    setError("");
    setCreada(null);
  }

  function validar() {
    if (!formulario.fecha_inicio || !formulario.fecha_fin) {
      return "Selecciona las fechas de inicio y finalización.";
    }
    if (formulario.fecha_fin < formulario.fecha_inicio) {
      return "La fecha final no puede ser anterior a la fecha inicial.";
    }
    if (seleccionados.length === 0) {
      return "Selecciona al menos un equipo disponible.";
    }
    return "";
  }

  async function enviar(event) {
    event.preventDefault();
    if (guardando) return;

    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }

    setGuardando(true);
    setError("");
    setCreada(null);
    try {
      const solicitud = await crearSolicitud({
        fecha_inicio: formulario.fecha_inicio,
        fecha_fin: formulario.fecha_fin,
        observacion: formulario.observacion.trim() || null,
        equipos: seleccionados,
      });
      setCreada(solicitud);
      setFormulario(formularioInicial);
      setSeleccionados([]);
      await cargarEquipos();
    } catch (requestError) {
      const mensaje =
        requestError.status === 409
          ? `${requestError.message} Actualiza la disponibilidad e inténtalo nuevamente.`
          : requestError.message;
      setError(mensaje || "No fue posible crear la solicitud.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="container solicitud-page">
      <header className="solicitud-encabezado">
        <div>
          <p className="eyebrow">Préstamo de equipos</p>
          <h1>Crear una solicitud</h1>
          <p>Elige los recursos y las fechas para enviar tu solicitud al equipo administrador.</p>
        </div>
        <Link className="button button-outline" to="/mis-solicitudes">
          Ver mis solicitudes
        </Link>
      </header>

      {error && <p className="solicitud-aviso solicitud-error" role="alert">{error}</p>}
      {creada && (
        <div className="solicitud-aviso solicitud-exito" role="status">
          <div>
            <strong>Solicitud #{creada.id_solicitud} creada correctamente.</strong>
            <span> Quedó en estado {creada.nombre_estado}.</span>
          </div>
          <Link to="/mis-solicitudes">Consultar historial</Link>
        </div>
      )}

      <form className="solicitud-formulario" onSubmit={enviar} noValidate>
        <fieldset disabled={guardando}>
          <legend>1. Selecciona los equipos</legend>
          <div className="solicitud-acciones-superiores">
            <span>{seleccionados.length} seleccionado(s)</span>
            <button type="button" onClick={() => cargarEquipos()} disabled={cargando}>
              {cargando ? "Actualizando…" : "Actualizar disponibilidad"}
            </button>
          </div>

          {cargando ? (
            <p role="status" className="solicitud-vacio">Consultando inventario…</p>
          ) : equipos.length === 0 ? (
            <p className="solicitud-vacio">
              No hay equipos disponibles en este momento. Actualiza la lista más tarde.
            </p>
          ) : (
            <div className="solicitud-equipos">
              {equipos.map((equipo) => (
                <label className="solicitud-equipo" key={equipo.id_equipo}>
                  <input
                    type="checkbox"
                    checked={equiposSeleccionados.has(equipo.id_equipo)}
                    onChange={() => alternarEquipo(equipo.id_equipo)}
                  />
                  <span>
                    <strong>{equipo.nombre}</strong>
                    <small>
                      {[equipo.codigo_interno, equipo.nombre_categoria, equipo.marca, equipo.modelo]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset disabled={guardando}>
          <legend>2. Indica las fechas</legend>
          <div className="solicitud-campos">
            <label>
              Fecha de inicio *
              <input
                required
                type="date"
                name="fecha_inicio"
                value={formulario.fecha_inicio}
                onChange={cambiarCampo}
              />
            </label>
            <label>
              Fecha de finalización *
              <input
                required
                type="date"
                name="fecha_fin"
                min={formulario.fecha_inicio || undefined}
                value={formulario.fecha_fin}
                onChange={cambiarCampo}
              />
            </label>
            <label className="solicitud-campo-ancho">
              Observación
              <textarea
                rows={4}
                maxLength={2000}
                name="observacion"
                value={formulario.observacion}
                onChange={cambiarCampo}
                placeholder="Describe brevemente para qué necesitas los equipos."
              />
              <small>{formulario.observacion.length}/2000 caracteres</small>
            </label>
          </div>
        </fieldset>

        <button
          className="button button-primary solicitud-enviar"
          type="submit"
          disabled={guardando || cargando || equipos.length === 0}
        >
          {guardando ? "Enviando solicitud…" : "Enviar solicitud"}
        </button>
      </form>
    </section>
  );
}
