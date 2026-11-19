import { pool } from "../config/database.js";

export async function conTransaccion(operacion) {
  const conexion = await pool.getConnection();
  try {
    // Cada lectura de colisiones debe ver las aprobaciones confirmadas antes
    // de adquirir los locks de equipo, aunque la transacción ya haya comenzado.
    await conexion.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conexion.beginTransaction();
    const resultado = await operacion(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

export async function consultarSolicitudes({ id, propietario } = {}, db = pool) {
  const filtros = [];
  const valores = [];
  if (id !== undefined) {
    filtros.push("s.id_solicitud = ?");
    valores.push(id);
  }
  if (propietario !== undefined) {
    filtros.push("s.id_usuario = ?");
    valores.push(propietario);
  }
  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const [filas] = await db.execute(
    `SELECT s.id_solicitud, s.id_usuario, s.fecha_solicitud, s.observacion,
            DATE_FORMAT(s.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
            DATE_FORMAT(s.fecha_fin, '%Y-%m-%d') AS fecha_fin,
            es.nombre_estado, CONCAT_WS(' ', u.nombres, u.apellidos) AS solicitante,
            e.id_equipo, e.nombre AS nombre_equipo
       FROM solicitud_prestamo s
       JOIN estado_solicitud es USING (id_estado_solicitud)
       JOIN usuario u USING (id_usuario)
       LEFT JOIN detalle_solicitud d USING (id_solicitud)
       LEFT JOIN equipo e USING (id_equipo)
       ${where}
       ORDER BY s.fecha_solicitud DESC, s.id_solicitud DESC, e.id_equipo`,
    valores,
  );

  const solicitudes = new Map();
  for (const { id_equipo, nombre_equipo, ...fila } of filas) {
    if (!solicitudes.has(fila.id_solicitud)) {
      solicitudes.set(fila.id_solicitud, { ...fila, equipos: [] });
    }
    if (id_equipo !== null) {
      solicitudes.get(fila.id_solicitud).equipos.push({ id_equipo, nombre: nombre_equipo });
    }
  }
  return [...solicitudes.values()];
}

export async function bloquearSolicitud(db, id) {
  const [[fila]] = await db.execute(
    "SELECT id_usuario, id_estado_solicitud FROM solicitud_prestamo WHERE id_solicitud = ? FOR UPDATE",
    [id],
  );
  return fila;
}

export async function idsDeEquipos(db, id) {
  const [filas] = await db.execute(
    "SELECT id_equipo FROM detalle_solicitud WHERE id_solicitud = ? ORDER BY id_equipo", [id],
  );
  return filas.map(({ id_equipo }) => id_equipo);
}

export async function bloquearEquipos(db, ids) {
  const equipos = [];
  // Todos los flujos adquieren locks por PK en orden ascendente.
  for (const id of [...ids].sort((a, b) => a - b)) {
    const [[equipo]] = await db.execute(
      "SELECT id_equipo, activo, id_estado_equipo FROM equipo WHERE id_equipo = ? FOR UPDATE", [id],
    );
    if (equipo) equipos.push(equipo);
  }
  return equipos;
}

export async function consultarEstados(db) {
  const [solicitudes] = await db.execute("SELECT id_estado_solicitud, nombre_estado FROM estado_solicitud");
  const [equipos] = await db.execute("SELECT id_estado_equipo, nombre_estado FROM estado_equipo");
  return {
    solicitud: new Map(solicitudes.map((fila) => [fila.nombre_estado, fila.id_estado_solicitud])),
    equipo: new Map(equipos.map((fila) => [fila.nombre_estado, fila.id_estado_equipo])),
  };
}

export async function insertarSolicitud(db, propietario, datos, pendiente) {
  const { fecha_inicio, fecha_fin, observacion, equipos } = datos;
  const [resultado] = await db.execute(
    `INSERT INTO solicitud_prestamo (fecha_inicio, fecha_fin, observacion, id_usuario, id_estado_solicitud)
     VALUES (?, ?, ?, ?, ?)`,
    [fecha_inicio, fecha_fin, observacion, propietario, pendiente],
  );
  const id = resultado.insertId;
  await db.execute(
    `INSERT INTO detalle_solicitud (id_solicitud, id_equipo)
     VALUES ${equipos.map(() => "(?, ?)").join(", ")}`,
    equipos.flatMap((equipo) => [id, equipo]),
  );
  return id;
}

export async function equiposConOtroPrestamo(db, ids, solicitudId, estadosActivos) {
  const [filas] = await db.execute(
    `SELECT DISTINCT d.id_equipo
       FROM detalle_solicitud d
       JOIN solicitud_prestamo s USING (id_solicitud)
      WHERE d.id_equipo IN (${ids.map(() => "?").join(", ")})
        AND s.id_solicitud <> ?
        AND s.id_estado_solicitud IN (?, ?)`,
    [...ids, solicitudId, ...estadosActivos],
  );
  return new Set(filas.map(({ id_equipo }) => id_equipo));
}

export async function actualizarEstadoSolicitud(db, id, estado) {
  await db.execute(
    "UPDATE solicitud_prestamo SET id_estado_solicitud = ? WHERE id_solicitud = ?", [estado, id],
  );
}

export async function actualizarEstadoEquipos(db, ids, estado) {
  if (!ids.length) return;
  await db.execute(
    `UPDATE equipo SET id_estado_equipo = ? WHERE id_equipo IN (${ids.map(() => "?").join(", ")})`,
    [estado, ...ids],
  );
}
