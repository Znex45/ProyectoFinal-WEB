import { pool } from "../config/database.js";

// Columnas públicas: nunca se exponen ruta_archivo ni nombre_almacenado.
const selectPublico = `
  SELECT a.id_archivo, a.nombre_original, a.tipo_mime, a.tamano_bytes, a.descripcion,
         a.principal, a.fecha_subida, a.id_equipo, a.id_usuario_carga,
         CONCAT(u.nombres, ' ', u.apellidos) AS autor
  FROM archivo_multimedia a
  JOIN usuario u ON u.id_usuario = a.id_usuario_carga
  JOIN equipo e ON e.id_equipo = a.id_equipo`;

const mapPublico = (row) => ({
  ...row,
  tamano_bytes: Number(row.tamano_bytes),
  principal: Boolean(row.principal),
  url_visualizar: `/api/archivos/${row.id_archivo}/visualizar`,
  url_descargar: `/api/archivos/${row.id_archivo}/descargar`,
});

/** Lista metadatos. soloActivos = true para usuarios no administradores. */
export async function findAll({ idEquipo, soloActivos }) {
  const condiciones = [];
  const valores = [];
  if (idEquipo) {
    condiciones.push("a.id_equipo = ?");
    valores.push(idEquipo);
  }
  if (soloActivos) condiciones.push("e.activo = 1");
  const where = condiciones.length ? ` WHERE ${condiciones.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `${selectPublico}${where} ORDER BY a.principal DESC, a.fecha_subida DESC, a.id_archivo DESC`,
    valores,
  );
  return rows.map(mapPublico);
}

export async function findPublicoById(id) {
  const [rows] = await pool.execute(`${selectPublico} WHERE a.id_archivo = ?`, [id]);
  return rows[0] ? mapPublico(rows[0]) : null;
}

/** Fila completa (incluye ruta interna) para uso exclusivo del servidor. */
export async function findInternoById(id) {
  const [rows] = await pool.execute(
    `SELECT a.id_archivo, a.nombre_original, a.nombre_almacenado, a.tipo_mime, a.tamano_bytes,
            a.ruta_archivo, a.id_equipo, e.activo AS equipo_activo
     FROM archivo_multimedia a
     JOIN equipo e ON e.id_equipo = a.id_equipo
     WHERE a.id_archivo = ?`,
    [id],
  );
  const row = rows[0];
  return row ? { ...row, tamano_bytes: Number(row.tamano_bytes), equipo_activo: Boolean(row.equipo_activo) } : null;
}

export async function findEquipo(id) {
  const [rows] = await pool.execute("SELECT id_equipo, activo FROM equipo WHERE id_equipo = ?", [id]);
  return rows[0] ? { ...rows[0], activo: Boolean(rows[0].activo) } : null;
}

export async function usuarioActivoExists(id) {
  const [rows] = await pool.execute("SELECT 1 FROM usuario WHERE id_usuario = ? AND activo = 1", [id]);
  return rows.length > 0;
}

export async function rutaExists(rutaArchivo) {
  const [rows] = await pool.execute("SELECT 1 FROM archivo_multimedia WHERE ruta_archivo = ? LIMIT 1", [rutaArchivo]);
  return rows.length > 0;
}

/**
 * Inserta los metadatos en una transacción. Si principal = true, desmarca el principal
 * anterior del mismo equipo para que haya como máximo uno.
 */
export async function insertArchivo(archivo) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (archivo.principal) {
      await connection.execute(
        "UPDATE archivo_multimedia SET principal = 0 WHERE id_equipo = ? AND principal = 1",
        [archivo.id_equipo],
      );
    }
    const [result] = await connection.execute(
      `INSERT INTO archivo_multimedia
         (nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, ruta_archivo,
          descripcion, principal, id_equipo, id_usuario_carga)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        archivo.nombre_original,
        archivo.nombre_almacenado,
        archivo.tipo_mime,
        archivo.tamano_bytes,
        archivo.ruta_archivo,
        archivo.descripcion,
        archivo.principal ? 1 : 0,
        archivo.id_equipo,
        archivo.id_usuario_carga,
      ],
    );
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteArchivo(id) {
  const [result] = await pool.execute("DELETE FROM archivo_multimedia WHERE id_archivo = ?", [id]);
  return result.affectedRows > 0;
}
