import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import './InventarioPage.css';

const vacio = { codigo_interno: '', nombre: '', marca: '', modelo: '', descripcion: '', id_categoria: '', id_estado_equipo: '' };

export function InventarioPage({ user }) {
  const [equipos, setEquipos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState(vacio);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const admin = user?.rol === 'Administrador';

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [lista, catalogos] = await Promise.all([api('/api/equipos'), api('/api/equipos/catalogos')]);
      setEquipos(lista.data ?? []);
      setCategorias(catalogos.categorias ?? []);
      setEstados(catalogos.estados ?? []);
    } catch (e) { setError(e.message || 'No fue posible cargar el inventario.'); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function editar(equipo) {
    setMensaje(''); setError(''); setEditando(equipo.id_equipo);
    setFormulario(Object.fromEntries(Object.keys(vacio).map(k => [k, equipo[k] == null ? '' : String(equipo[k])])));
  }
  function nuevo() { setFormulario(vacio); setEditando(null); setError(''); setMensaje(''); }

  async function guardar(event) {
    event.preventDefault(); setGuardando(true); setError(''); setMensaje('');
    try {
      const body = { ...formulario, id_categoria: Number(formulario.id_categoria), id_estado_equipo: Number(formulario.id_estado_equipo) };
      await api(editando ? `/api/equipos/${editando}` : '/api/equipos', {
        method: editando ? 'PUT' : 'POST', body: JSON.stringify(body),
      });
      nuevo(); await cargar(); setMensaje(editando ? 'Equipo actualizado.' : 'Equipo agregado.');
    } catch (e) { setError(e.message || 'No fue posible guardar.'); }
    finally { setGuardando(false); }
  }

  async function eliminar(equipo) {
    if (!window.confirm(`¿Eliminar el equipo "${equipo.nombre}"?`)) return;
    setError(''); setMensaje('');
    try {
      await api(`/api/equipos/${equipo.id_equipo}`, { method: 'DELETE' });
      await cargar(); setMensaje('Equipo eliminado.');
    } catch (e) { setError(e.message || 'No se pudo eliminar. Puede tener préstamos o archivos asociados.'); }
  }

  return (
    <section className="container inventario">
      <div className="inventario-encabezado"><div><p className="eyebrow">Gestión multimedia</p><h1>Inventario de equipos</h1><p>Consulta equipos, categorías y disponibilidad.</p></div>{admin && <button type="button" className="button button-outline" onClick={nuevo}>Nuevo equipo</button>}</div>
      {error && <p role="alert" className="inventario-error">{error}</p>}
      {mensaje && <p role="status" className="inventario-exito">{mensaje}</p>}
      {cargando ? <p>Cargando inventario...</p> : <div className="inventario-tabla-contenedor"><table className="inventario-tabla"><thead><tr><th>Código</th><th>Equipo</th><th>Categoría</th><th>Estado</th>{admin && <th>Acciones</th>}</tr></thead><tbody>{equipos.map(e => <tr key={e.id_equipo}><td>{e.codigo_interno}</td><td><strong>{e.nombre}</strong><small>{[e.marca,e.modelo].filter(Boolean).join(' · ')}</small></td><td>{e.nombre_categoria}</td><td>{e.nombre_estado}</td>{admin && <td className="inventario-acciones"><button type="button" onClick={() => editar(e)}>Editar</button><button type="button" onClick={() => eliminar(e)}>Eliminar</button></td>}</tr>)}{equipos.length === 0 && <tr><td colSpan={admin ? 5 : 4}>No hay equipos registrados.</td></tr>}</tbody></table></div>}
      {admin && <form className="inventario-formulario" onSubmit={guardar}><h2>{editando ? 'Editar equipo' : 'Agregar equipo'}</h2><div className="inventario-campos"><label>Código interno *<input required maxLength={50} value={formulario.codigo_interno} onChange={e => setFormulario(p => ({...p,codigo_interno:e.target.value}))}/></label><label>Nombre *<input required maxLength={100} value={formulario.nombre} onChange={e => setFormulario(p => ({...p,nombre:e.target.value}))}/></label><label>Marca<input maxLength={100} value={formulario.marca} onChange={e => setFormulario(p => ({...p,marca:e.target.value}))}/></label><label>Modelo<input maxLength={100} value={formulario.modelo} onChange={e => setFormulario(p => ({...p,modelo:e.target.value}))}/></label><label>Categoría *<select required value={formulario.id_categoria} onChange={e => setFormulario(p => ({...p,id_categoria:e.target.value}))}><option value="">Seleccionar categoría</option>{categorias.map(c => <option value={c.id_categoria} key={c.id_categoria}>{c.nombre_categoria}</option>)}</select></label><label>Estado *<select required value={formulario.id_estado_equipo} onChange={e => setFormulario(p => ({...p,id_estado_equipo:e.target.value}))}><option value="">Seleccionar estado</option>{estados.map(s => <option value={s.id_estado_equipo} key={s.id_estado_equipo}>{s.nombre_estado}</option>)}</select></label><label className="inventario-ancho">Descripción<textarea rows={3} value={formulario.descripcion} onChange={e => setFormulario(p => ({...p,descripcion:e.target.value}))}/></label></div><div className="inventario-acciones"><button disabled={guardando} type="submit" className="button button-primary">{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar equipo'}</button>{editando && <button type="button" className="button button-outline" onClick={nuevo}>Cancelar edición</button>}</div></form>}
    </section>
  );
}
