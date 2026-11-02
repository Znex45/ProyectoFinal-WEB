import { pool } from '../config/db.js';

const enteroPositivo = (value) => /^[1-9]\d*$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value));
const errorCliente = (res, status, error) => res.status(status).json({ error });
const campos = ['codigo_interno', 'nombre', 'marca', 'modelo', 'descripcion', 'id_categoria', 'id_estado_equipo'];

function validarEquipo(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Envía los datos del equipo.';
  const codigo = body.codigo_interno;
  const nombre = body.nombre;
  if (typeof codigo !== 'string' || !codigo.trim() || codigo.trim().length > 50) return 'Código interno obligatorio (máximo 50 caracteres).';
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100) return 'Nombre obligatorio (máximo 100 caracteres).';
  if (!enteroPositivo(body.id_categoria) || !enteroPositivo(body.id_estado_equipo)) return 'Categoría y estado deben ser identificadores válidos.';
  for (const key of ['marca', 'modelo']) {
    if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 100)) return `${key} debe ser texto de máximo 100 caracteres.`;
  }
  if (body.descripcion != null && typeof body.descripcion !== 'string') return 'Descripción debe ser texto.';
  return null;
}
function parametrosEquipo(body) {
  return [body.codigo_interno.trim(), body.nombre.trim(), body.marca?.trim() || null, body.modelo?.trim() || null, body.descripcion?.trim() || null, Number(body.id_categoria), Number(body.id_estado_equipo)];
}
async function validarCatalogos(body) {
  const [[categoria]] = await pool.execute('SELECT id_categoria FROM categoria_equipo WHERE id_categoria = ?', [Number(body.id_categoria)]);
  if (!categoria) return 'La categoría seleccionada no existe.';
  const [[estado]] = await pool.execute('SELECT id_estado_equipo FROM estado_equipo WHERE id_estado_equipo = ?', [Number(body.id_estado_equipo)]);
  if (!estado) return 'El estado seleccionado no existe.';
  return null;
}
const consultaEquipos = `SELECT e.id_equipo, e.codigo_interno, e.nombre, e.marca, e.modelo, e.descripcion,
  e.fecha_compra, e.activo, e.id_categoria, c.nombre_categoria,
  e.id_estado_equipo, s.nombre_estado
  FROM equipo e JOIN categoria_equipo c ON c.id_categoria = e.id_categoria
  JOIN estado_equipo s ON s.id_estado_equipo = e.id_estado_equipo`;
function manejarError(error, res) {
  if (error.code === 'ER_DUP_ENTRY') return errorCliente(res, 409, 'Ya existe un equipo con ese código interno.');
  if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') return errorCliente(res, 409, 'El equipo tiene préstamos o archivos asociados; no se puede eliminar.');
  console.error('Error CRUD equipos:', error);
  return errorCliente(res, 500, 'Error interno del servidor.');
}
export async function listarEquipos(_req, res) {
  try { const [data] = await pool.execute(`${consultaEquipos} ORDER BY e.id_equipo DESC`); return res.json({ data }); }
  catch (err) { return manejarError(err, res); }
}
export async function obtenerCatalogos(_req, res) {
  try {
    const [categorias] = await pool.execute('SELECT id_categoria,nombre_categoria FROM categoria_equipo ORDER BY nombre_categoria');
    const [estados] = await pool.execute('SELECT id_estado_equipo,nombre_estado FROM estado_equipo ORDER BY nombre_estado');
    return res.json({ categorias, estados });
  } catch (err) { return manejarError(err, res); }
}
export async function obtenerEquipo(req, res) {
  if (!enteroPositivo(req.params.id)) return errorCliente(res, 400, 'ID de equipo inválido.');
  try {
    const [[data]] = await pool.execute(`${consultaEquipos} WHERE e.id_equipo = ?`, [Number(req.params.id)]);
    return data ? res.json({ data }) : errorCliente(res, 404, 'Equipo no encontrado.');
  } catch (err) { return manejarError(err, res); }
}
export async function crearEquipo(req, res) {
  const error = validarEquipo(req.body);
  if (error) return errorCliente(res, 400, error);
  try {
    const catalogoError = await validarCatalogos(req.body);
    if (catalogoError) return errorCliente(res, 400, catalogoError);
    const [result] = await pool.execute(`INSERT INTO equipo (${campos.join(',')}) VALUES (?,?,?,?,?,?,?)`, parametrosEquipo(req.body));
    return res.status(201).json({ id: result.insertId });
  } catch (err) { return manejarError(err, res); }
}
export async function actualizarEquipo(req, res) {
  if (!enteroPositivo(req.params.id)) return errorCliente(res, 400, 'ID de equipo inválido.');
  const error = validarEquipo(req.body);
  if (error) return errorCliente(res, 400, error);
  try {
    const [[existente]] = await pool.execute('SELECT id_equipo FROM equipo WHERE id_equipo = ?', [Number(req.params.id)]);
    if (!existente) return errorCliente(res, 404, 'Equipo no encontrado.');
    const catalogoError = await validarCatalogos(req.body);
    if (catalogoError) return errorCliente(res, 400, catalogoError);
    await pool.execute(`UPDATE equipo SET ${campos.map(x => `${x} = ?`).join(', ')} WHERE id_equipo = ?`, [...parametrosEquipo(req.body), Number(req.params.id)]);
    return res.json({ message: 'Actualizado' });
  } catch (err) { return manejarError(err, res); }
}
export async function eliminarEquipo(req, res) {
  if (!enteroPositivo(req.params.id)) return errorCliente(res, 400, 'ID de equipo inválido.');
  try {
    const id = Number(req.params.id);
    const [[prestamo]] = await pool.execute('SELECT id_detalle FROM detalle_solicitud WHERE id_equipo = ? LIMIT 1', [id]);
    const [[archivo]] = await pool.execute('SELECT id_archivo FROM archivo_multimedia WHERE id_equipo = ? LIMIT 1', [id]);
    if (prestamo || archivo) return errorCliente(res, 409, 'No se puede eliminar: tiene préstamos o archivos asociados.');
    const [result] = await pool.execute('DELETE FROM equipo WHERE id_equipo = ?', [id]);
    return result.affectedRows ? res.status(204).end() : errorCliente(res, 404, 'Equipo no encontrado.');
  } catch (err) { return manejarError(err, res); }
}
