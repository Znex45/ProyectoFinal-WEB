import React, { useCallback, useEffect, useRef, useState } from "react";
import { actualizarEstadoSolicitud, listarSolicitudes } from "../services/solicitudes.js";
import "./AdminSolicitudesPage.css";

const estados = ["Pendiente", "Aprobada", "En préstamo", "Finalizada", "Rechazada", "Cancelada"];
const acciones = {
  Pendiente: [["Aprobar", "Aprobada"], ["Rechazar", "Rechazada"], ["Cancelar", "Cancelada"]],
  Aprobada: [["Entregar equipo", "En préstamo"], ["Cancelar", "Cancelada"]],
  "En préstamo": [["Finalizar préstamo", "Finalizada"]],
};
const fecha = valor => valor ? String(valor).slice(0, 10) : "—";
const equipos = s => (s.equipos ?? []).map(e => e.nombre).join(", ") || "Sin equipos";

export function AdminSolicitudesPage() {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const bloqueo = useRef(false);
  const cargar = useCallback(async signal => {
    setCargando(true);
    setError("");
    try {
      const datos = await listarSolicitudes({ signal });
      if (!signal?.aborted) setLista(datos ?? []);
    } catch (e) {
      if (!signal?.aborted) { setLista([]); setError(e.message || "No fue posible cargar las solicitudes."); }
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);
  async function cambiar(s, destino) {
    if (bloqueo.current || !window.confirm(`¿Cambiar la solicitud #${s.id_solicitud} a ${destino}?`)) return;
    bloqueo.current = true;
    setOcupado(true); setError(""); setMensaje("");
    try {
      await actualizarEstadoSolicitud(s.id_solicitud, destino);
      setMensaje(`Solicitud #${s.id_solicitud}: ${destino}.`);
      await cargar();
    } catch (e) { setError(e.message || "No fue posible cambiar el estado."); }
    finally { bloqueo.current = false; setOcupado(false); }
  }
  const visibles = lista.filter(s => (filtro === "Todos" || s.nombre_estado === filtro) &&
    `${s.id_solicitud} ${s.solicitante ?? ""} ${equipos(s)}`.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()));
  return <section className="container admin-solicitudes">
    <header className="admin-cabecera"><div><p className="eyebrow">Administración · Préstamos</p><h1>Gestión de solicitudes</h1><p>Consulta y gestiona el ciclo de préstamo de equipos multimedia.</p></div>
      <button className="button button-outline" disabled={cargando || ocupado} onClick={() => cargar()}>Actualizar</button></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {mensaje && <p className="admin-exito" role="status">{mensaje}</p>}
    <div className="admin-indicadores">{estados.map(e => <button type="button" className="admin-indicador" key={e} aria-pressed={filtro === e} onClick={() => setFiltro(filtro === e ? "Todos" : e)}><span>{e}</span><strong>{cargando || error ? "—" : lista.filter(s => s.nombre_estado === e).length}</strong></button>)}</div>
    <div className="admin-filtros"><label>Buscar solicitud<input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="ID, solicitante o equipo" /></label><label>Estado<select value={filtro} onChange={e => setFiltro(e.target.value)}>{["Todos", ...estados].map(e => <option key={e}>{e}</option>)}</select></label></div>
    {cargando ? <p role="status">Cargando solicitudes…</p> : !visibles.length ? <p>{error ? "Actualiza para volver a intentar." : "No hay solicitudes para estos filtros."}</p> : <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Solicitud</th><th>Solicitante / equipos</th><th>Fechas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map(s => <tr key={s.id_solicitud}>
      <td>#{s.id_solicitud}</td><td><strong>{s.solicitante}</strong><p>{equipos(s)}</p><details><summary>Detalles</summary><p>Creación: {fecha(s.fecha_solicitud)}</p><p>Observación: {s.observacion || "Sin observaciones"}</p></details></td><td>{fecha(s.fecha_inicio)}<br />{fecha(s.fecha_fin)}</td><td><span className="admin-estado">{s.nombre_estado}</span></td><td><div className="admin-acciones">{(acciones[s.nombre_estado] ?? []).map(([texto,destino]) => <button key={destino} className="button button-outline" disabled={ocupado || cargando} onClick={() => cambiar(s,destino)}>{texto}</button>)}{!acciones[s.nombre_estado] && "Sin acciones"}</div></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
