import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";
import "./InventarioPage.css";

const formularioVacio = {
  codigo_interno: "",
  nombre: "",
  marca: "",
  modelo: "",
  descripcion: "",
  fecha_compra: "",
  activo: true,
  id_categoria: "",
  id_estado_equipo: "",
};

const aFormulario = (equipo) => ({
  codigo_interno: equipo.codigo_interno ?? "",
  nombre: equipo.nombre ?? "",
  marca: equipo.marca ?? "",
  modelo: equipo.modelo ?? "",
  descripcion: equipo.descripcion ?? "",
  fecha_compra: equipo.fecha_compra ?? "",
  activo: Boolean(equipo.activo),
  id_categoria: String(equipo.id_categoria ?? ""),
  id_estado_equipo: String(equipo.id_estado_equipo ?? ""),
});

const aPeticion = (formulario) => ({
  ...formulario,
  id_categoria: Number(formulario.id_categoria),
  id_estado_equipo: Number(formulario.id_estado_equipo),
});

export function InventarioPage() {
  const { isAdmin } = useAuth();
  const [equipos, setEquipos] = useState([]);
  const [catalogos, setCatalogos] = useState({ categorias: [], estados: [] });
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const [lista, datosCatalogos] = await Promise.all([api("/api/equipos"), api("/api/equipos/catalogos")]);
      setEquipos(lista ?? []);
      setCatalogos(datosCatalogos ?? { categorias: [], estados: [] });
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar el inventario.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = (campo) => (event) => {
    const { type, checked, value } = event.target;
    setFormulario((actual) => ({ ...actual, [campo]: type === "checkbox" ? checked : value }));
  };

  function limpiarFormulario() {
    setFormulario(formularioVacio);
    setEditando(null);
  }

  function editar(equipo) {
    setMensaje("");
    setError("");
    setEditando(equipo.id_equipo);
    setFormulario(aFormulario(equipo));
    document.getElementById("formulario-equipo")?.scrollIntoView({ behavior: "smooth" });
  }

  async function guardar(event) {
    event.preventDefault();
    const esEdicion = editando !== null;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      await api(esEdicion ? `/api/equipos/${editando}` : "/api/equipos", {
        method: esEdicion ? "PUT" : "POST",
        body: aPeticion(formulario),
      });
      limpiarFormulario();
      await cargar();
      setMensaje(esEdicion ? "Equipo actualizado." : "Equipo agregado.");
    } catch (requestError) {
      setError(requestError.message || "No fue posible guardar el equipo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(equipo) {
    if (!window.confirm(`¿Eliminar el equipo "${equipo.nombre}"?`)) return;
    setError("");
    setMensaje("");
    try {
      await api(`/api/equipos/${equipo.id_equipo}`, { method: "DELETE" });
      if (editando === equipo.id_equipo) limpiarFormulario();
      await cargar();
      setMensaje("Equipo eliminado.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo eliminar el equipo.");
    }
  }

  const columnas = isAdmin ? 5 : 4;

  return (
    <section className="container inventario">
      <div className="inventario-encabezado">
        <div>
          <p className="eyebrow">Gestión multimedia</p>
          <h1>Inventario de equipos</h1>
          <p>Consulta equipos, categorías y disponibilidad.</p>
        </div>
        {isAdmin && (
          <button type="button" className="button button-outline" onClick={limpiarFormulario}>
            Nuevo equipo
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="inventario-error">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="inventario-exito">
          {mensaje}
        </p>
      )}

      {cargando ? (
        <p role="status">Cargando inventario…</p>
      ) : (
        <div className="inventario-tabla-contenedor">
          <table className="inventario-tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Equipo</th>
                <th>Categoría</th>
                <th>Estado</th>
                {isAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {equipos.map((equipo) => (
                <tr key={equipo.id_equipo} className={equipo.activo ? undefined : "inventario-inactivo"}>
                  <td>{equipo.codigo_interno}</td>
                  <td>
                    <strong>{equipo.nombre}</strong>
                    <small>{[equipo.marca, equipo.modelo].filter(Boolean).join(" · ")}</small>
                  </td>
                  <td>{equipo.nombre_categoria}</td>
                  <td>
                    {equipo.nombre_estado}
                    {!equipo.activo && <span className="inventario-etiqueta">Inactivo</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="inventario-acciones">
                        <button type="button" onClick={() => editar(equipo)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => eliminar(equipo)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {equipos.length === 0 && (
                <tr>
                  <td colSpan={columnas}>No hay equipos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <form id="formulario-equipo" className="inventario-formulario" onSubmit={guardar}>
          <h2>{editando ? "Editar equipo" : "Agregar equipo"}</h2>
          <div className="inventario-campos">
            <label>
              Código interno *
              <input required maxLength={50} value={formulario.codigo_interno} onChange={cambiar("codigo_interno")} />
            </label>
            <label>
              Nombre *
              <input required maxLength={100} value={formulario.nombre} onChange={cambiar("nombre")} />
            </label>
            <label>
              Marca
              <input maxLength={100} value={formulario.marca} onChange={cambiar("marca")} />
            </label>
            <label>
              Modelo
              <input maxLength={100} value={formulario.modelo} onChange={cambiar("modelo")} />
            </label>
            <label>
              Categoría *
              <select required value={formulario.id_categoria} onChange={cambiar("id_categoria")}>
                <option value="">Seleccionar categoría</option>
                {catalogos.categorias.map((categoria) => (
                  <option value={categoria.id_categoria} key={categoria.id_categoria}>
                    {categoria.nombre_categoria}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado *
              <select required value={formulario.id_estado_equipo} onChange={cambiar("id_estado_equipo")}>
                <option value="">Seleccionar estado</option>
                {catalogos.estados.map((estado) => (
                  <option value={estado.id_estado_equipo} key={estado.id_estado_equipo}>
                    {estado.nombre_estado}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de compra
              <input type="date" value={formulario.fecha_compra} onChange={cambiar("fecha_compra")} />
            </label>
            <label className="inventario-check">
              <input type="checkbox" checked={formulario.activo} onChange={cambiar("activo")} />
              Equipo activo (visible para estudiantes y docentes)
            </label>
            <label className="inventario-ancho">
              Descripción
              <textarea rows={3} maxLength={2000} value={formulario.descripcion} onChange={cambiar("descripcion")} />
            </label>
          </div>
          <div className="inventario-acciones">
            <button disabled={guardando} type="submit" className="button button-primary">
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar equipo"}
            </button>
            {editando && (
              <button type="button" className="button button-outline" onClick={limpiarFormulario}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
