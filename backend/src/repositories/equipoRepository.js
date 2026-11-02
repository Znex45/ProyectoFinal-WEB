import { pool } from "../config/database.js";

const columnasEditables = [
  "codigo_interno",
  "nombre",
  "marca",
  "modelo",
  "descripcion",
  "fecha_compra",
  "activo",
  "id_categoria",
  "id_estado_equipo",
];

const selectEquipos = `
  SELECT e.id_equipo, e.codigo_interno, e.nombre, e.marca, e.modelo, e.descripcion,
         e.fecha_compra, e.activo, e.id_categoria, c.nombre_categoria,
         e.id_estado_equipo, s.nombre_estado
  FROM equipo e
  JOIN categoria_equipo c ON c.id_categoria = e.id_categoria
  JOIN estado_equipo s ON s.id_estado_equipo = e.id_estado_equipo`;

// MySQL devuelve BOOLEAN como 0/1; la API expone true/false.
const mapEquipo = (row) => ({ ...row, activo: Boolean(row.activo) });
const valores = (equipo) => columnasEditables.map((columna) => equipo[columna]);

export async function findAll({ soloActivos = false } = {}) {
  const where = soloActivos ? " WHERE e.activo = 1" : "";
  const [rows] = await pool.execute(`${selectEquipos}${where} ORDER BY e.id_equipo DESC`);
  return rows.map(mapEquipo);
}

export async function findById(id) {
  const [rows] = await pool.execute(`${selectEquipos} WHERE e.id_equipo = ?`, [id]);
  return rows[0] ? mapEquipo(rows[0]) : null;
}

export async function findCatalogos() {
  const [categorias] = await pool.execute(
    "SELECT id_categoria, nombre_categoria FROM categoria_equipo ORDER BY nombre_categoria",
  );
  const [estados] = await pool.execute(
    "SELECT id_estado_equipo, nombre_estado FROM estado_equipo ORDER BY nombre_estado",
  );
  return { categorias, estados };
}

export async function categoriaExists(id) {
  const [rows] = await pool.execute("SELECT 1 FROM categoria_equipo WHERE id_categoria = ?", [id]);
  return rows.length > 0;
}

export async function estadoExists(id) {
  const [rows] = await pool.execute("SELECT 1 FROM estado_equipo WHERE id_estado_equipo = ?", [id]);
  return rows.length > 0;
}

export async function createEquipo(equipo) {
  const placeholders = columnasEditables.map(() => "?").join(", ");
  const [result] = await pool.execute(
    `INSERT INTO equipo (${columnasEditables.join(", ")}) VALUES (${placeholders})`,
    valores(equipo),
  );
  return result.insertId;
}

export async function updateEquipo(id, equipo) {
  const asignaciones = columnasEditables.map((columna) => `${columna} = ?`).join(", ");
  const [result] = await pool.execute(
    `UPDATE equipo SET ${asignaciones} WHERE id_equipo = ?`,
    [...valores(equipo), id],
  );
  return result.affectedRows > 0;
}

export async function hasDependencias(id) {
  const [rows] = await pool.execute(
    `SELECT EXISTS (SELECT 1 FROM detalle_solicitud WHERE id_equipo = ?)
         OR EXISTS (SELECT 1 FROM archivo_multimedia WHERE id_equipo = ?) AS tiene`,
    [id, id],
  );
  return Boolean(rows[0]?.tiene);
}

export async function deleteEquipo(id) {
  const [result] = await pool.execute("DELETE FROM equipo WHERE id_equipo = ?", [id]);
  return result.affectedRows > 0;
}
