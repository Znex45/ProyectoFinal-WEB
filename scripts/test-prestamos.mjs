// Ejecutar con Node contra una base MySQL de desarrollo inicializada con schema y seed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "../backend/src/config/database.js";
import { sessionMiddleware, sessionStore } from "../backend/src/middleware/session.js";
import { authRoutes } from "../backend/src/routes/authRoutes.js";
import { solicitudRoutes } from "../backend/src/routes/solicitudRoutes.js";
import { conTransaccion, insertarSolicitud } from "../backend/src/repositories/solicitudRepository.js";
import { HttpError } from "../backend/src/utils/http.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(sessionMiddleware);
app.use("/api/auth", authRoutes);
app.use("/api/solicitudes", solicitudRoutes);
app.use((error, _request, response, _next) => {
  if (!(error instanceof HttpError)) console.error(error);
  response.status(error.status ?? 500).json({ error: error.message });
});

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const base = `http://127.0.0.1:${server.address().port}/api`;
let checks = 0;
const sufijo = randomUUID();
const password = randomUUID();
const usuarios = [];
const equipos = [];
const sesiones = [];

async function request(method, path, expected, body, session) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(session?.cookie && { Cookie: session.cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookie = r.headers.get("set-cookie");
  if (cookie && session) session.cookie = cookie.split(";")[0];
  const json = r.status === 204 ? null : await r.json();
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
  checks++;
  return json?.data;
}

async function crearUsuario(tipo, rol = "Estudiante") {
  const correo = `prestamos.${tipo}.${sufijo}@uao.edu.co`;
  const { id_usuario } = await request("POST", "/auth/register", 201, {
    codigo: `TEST-${tipo}-${sufijo}`, nombres: "Prueba", apellidos: "Préstamos", correo, password,
  });
  usuarios.push(id_usuario);
  if (rol !== "Estudiante") {
    await pool.execute(
      "UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre_rol = ?) WHERE id_usuario = ?",
      [rol, id_usuario],
    );
  }
  const session = { id: id_usuario };
  sesiones.push(session);
  await request("POST", "/auth/login", 200, { correo, password }, session);
  return session;
}

async function crearEquipo(numero, estado = "Disponible", activo = true) {
  const [resultado] = await pool.execute(
    `INSERT INTO equipo (codigo_interno, nombre, id_categoria, id_estado_equipo, activo)
     VALUES (?, ?, (SELECT MIN(id_categoria) FROM categoria_equipo),
             (SELECT id_estado_equipo FROM estado_equipo WHERE nombre_estado = ?), ?)`,
    [`TEST-${numero}-${sufijo}`, "Equipo temporal", estado, activo],
  );
  equipos.push(resultado.insertId);
  return resultado.insertId;
}

async function estadoEquipo(id) {
  const [[fila]] = await pool.execute(
    `SELECT nombre_estado FROM equipo JOIN estado_equipo USING (id_estado_equipo) WHERE id_equipo = ?`,
    [id],
  );
  return fila.nombre_estado;
}

const body = (equipos) => ({
  fecha_inicio: "2026-11-20", fecha_fin: "2026-11-22", observacion: "Trabajo de clase", equipos,
});
const ruta = (solicitud) => `/solicitudes/${solicitud.id_solicitud}`;
const cambiar = (solicitud, estado, usuario, status = 200) =>
  request("PATCH", ruta(solicitud) + "/estado", status, { estado }, usuario);
const crear = (ids, usuario) => request("POST", "/solicitudes", 201, body(ids), usuario);

try {
  await pool.query("SELECT 1");
  const estudiante = await crearUsuario("prop");
  const docente = await crearUsuario("otro", "Docente");
  const admin = await crearUsuario("adm", "Administrador");
  const a = await crearEquipo(1);
  const b = await crearEquipo(2);
  const mantenimiento = await crearEquipo(3, "Mantenimiento");
  const inactivo = await crearEquipo(4, "Disponible", false);
  const inexistente = 4_294_967_295;

  for (const [method, path] of [
    ["GET", "/solicitudes"], ["POST", "/solicitudes"], ["GET", "/solicitudes/1"],
    ["PATCH", "/solicitudes/1/estado"],
  ]) await request(method, path, 401);

  for (const invalido of [
    { ...body([a]), fecha_inicio: "2026-02-30" }, { ...body([a]), fecha_fin: "2026-11-19" },
    body([]), body([a, a]), body([true]), body([inexistente]), body([inactivo]),
    { ...body([a]), id_usuario: docente.id },
  ]) await request("POST", "/solicitudes", 400, invalido, estudiante);
  await request("POST", "/solicitudes", 409, body([mantenimiento]), estudiante);
  await request("GET", "/solicitudes/abc", 400, undefined, estudiante);
  await request("GET", `/solicitudes/${inexistente}`, 404, undefined, admin);

  const primera = await crear([b, a], estudiante);
  const segunda = await crear([a], docente);
  assert.equal(primera.nombre_estado, "Pendiente");
  assert.equal(primera.id_usuario, estudiante.id);
  assert.equal(primera.fecha_inicio, body([]).fecha_inicio);
  const [detalles] = await pool.execute(
    "SELECT id_equipo FROM detalle_solicitud WHERE id_solicitud = ? ORDER BY id_equipo", [primera.id_solicitud],
  );
  assert.deepEqual(detalles.map(({ id_equipo }) => id_equipo), [a, b]);
  const [propia] = await request("GET", "/solicitudes", 200, undefined, estudiante);
  assert.deepEqual(propia, primera);
  await request("GET", ruta(primera), 404, undefined, docente);
  assert.deepEqual(await request("GET", ruta(primera), 200, undefined, admin), primera);
  const listado = await request("GET", "/solicitudes", 200, undefined, admin);
  assert.ok(listado.findIndex((s) => s.id_solicitud === segunda.id_solicitud) <
    listado.findIndex((s) => s.id_solicitud === primera.id_solicitud));
  await cambiar(primera, "Aprobada", estudiante, 403);
  await cambiar(primera, "Cancelada", docente, 403);
  await cambiar(primera, "Finalizada", admin, 409);

  // Ambos cambios usan conexiones diferentes y compiten por el mismo equipo.
  const resultados = await Promise.all([
    fetch(base + ruta(primera) + "/estado", {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ estado: "Aprobada" }),
    }),
    fetch(base + ruta(segunda) + "/estado", {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ estado: "Aprobada" }),
    }),
  ]);
  await Promise.all(resultados.map((r) => r.json()));
  assert.deepEqual(resultados.map((r) => r.status).sort(), [200, 409]);
  const [ganadora, perdedora] = resultados[0].ok ? [primera, segunda] : [segunda, primera];
  assert.equal(await estadoEquipo(a), "Reservado");
  assert.equal(await estadoEquipo(b), ganadora === primera ? "Reservado" : "Disponible");
  assert.equal((await request("GET", ruta(perdedora), 200, undefined, admin)).nombre_estado, "Pendiente");
  await cambiar(ganadora, "Aprobada", admin, 409);
  assert.equal((await cambiar(ganadora, "En préstamo", admin)).nombre_estado, "En préstamo");
  assert.equal(await estadoEquipo(a), "Prestado");
  assert.equal((await cambiar(ganadora, "Finalizada", admin)).nombre_estado, "Finalizada");
  assert.equal(await estadoEquipo(a), "Disponible");
  await cambiar(ganadora, "Cancelada", admin, 409);
  assert.equal((await cambiar(perdedora, "Rechazada", admin)).nombre_estado, "Rechazada");

  const canceladaPendiente = await crear([a], estudiante);
  assert.equal((await cambiar(canceladaPendiente, "Cancelada", estudiante)).nombre_estado, "Cancelada");
  assert.equal(await estadoEquipo(a), "Disponible");
  const cancelada = await crear([a, b], estudiante);
  await cambiar(cancelada, "Aprobada", admin);
  await pool.execute(
    "UPDATE equipo SET id_estado_equipo = (SELECT id_estado_equipo FROM estado_equipo WHERE nombre_estado = ?) WHERE id_equipo = ?",
    ["Mantenimiento", b],
  );
  await cambiar(cancelada, "En préstamo", admin, 409);
  assert.equal(await estadoEquipo(a), "Reservado");
  assert.equal((await cambiar(cancelada, "Cancelada", estudiante)).nombre_estado, "Cancelada");
  assert.equal(await estadoEquipo(a), "Disponible");
  assert.equal(await estadoEquipo(b), "Mantenimiento");

  // Forzar un error de detalle después de insertar la cabecera en MySQL.
  const marca = `rollback-${sufijo}`;
  const [[{ id_estado_solicitud }]] = await pool.execute(
    "SELECT id_estado_solicitud FROM estado_solicitud WHERE nombre_estado = ?", ["Pendiente"],
  );
  await assert.rejects(conTransaccion((db) => insertarSolicitud(
    db, estudiante.id, { ...body([a, a]), observacion: marca }, id_estado_solicitud,
  )), { code: "ER_DUP_ENTRY" });
  const [[{ total }]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM solicitud_prestamo WHERE id_usuario = ? AND observacion = ?",
    [estudiante.id, marca],
  );
  assert.equal(total, 0);

  await request("POST", "/auth/logout", 204, undefined, estudiante);
  await request("GET", "/solicitudes", 401, undefined, estudiante);
  assert.equal((await request("GET", ruta(ganadora), 200, undefined, admin)).nombre_estado, "Finalizada");
  console.log(`OK: ${checks + 2} respuestas HTTP; persistencia, concurrencia y rollback verificados en MySQL.`);
} finally {
  try {
    // IDs de cuentas/equipos creados por esta ejecución y sin datos de terceros.
    const limpieza = await Promise.allSettled(sesiones.filter((s) => s.cookie).map((s) =>
      request("POST", "/auth/logout", 204, undefined, s),
    ));
    await conTransaccion(async (db) => {
      for (const usuario of usuarios) {
        await db.execute(
          `DELETE d FROM detalle_solicitud d
           JOIN solicitud_prestamo s USING (id_solicitud) WHERE s.id_usuario = ?`, [usuario],
        );
        await db.execute("DELETE FROM solicitud_prestamo WHERE id_usuario = ?", [usuario]);
        await db.execute("DELETE FROM usuario WHERE id_usuario = ?", [usuario]);
      }
      for (const equipo of equipos) await db.execute("DELETE FROM equipo WHERE id_equipo = ?", [equipo]);
    });
    const fallos = limpieza.filter((resultado) => resultado.status === "rejected");
    if (fallos.length) throw new AggregateError(fallos.map(({ reason }) => reason), "Falló la limpieza de sesiones");
  } finally {
    sessionStore.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}
