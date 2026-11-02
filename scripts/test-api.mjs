// Prueba de extremo a extremo de la API contra la base MySQL configurada en backend/.env.
// Crea datos temporales y los elimina al terminar.  Uso: npm run test:api
import assert from "node:assert/strict";
import { app } from "../backend/src/app.js";
import { pool } from "../backend/src/config/database.js";
import { sessionStore } from "../backend/src/middleware/session.js";

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const sufijo = Date.now().toString(36);
const correo = `prueba.${sufijo}@uao.edu.co`;
const password = "secreto123";
let cookie = "";
let idUsuario;
let idEquipo;
let aprobadas = 0;

async function request(method, path, body, { raw } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function test(nombre, fn) {
  await fn();
  aprobadas += 1;
  console.log(`  ✓ ${nombre}`);
}

try {
  console.log("Prueba de la API\n");

  await test("GET /api/health responde 200", async () => {
    const r = await request("GET", "/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.database, "connected");
  });

  await test("GET /api/auth/me sin sesión → 401", async () => {
    assert.equal((await request("GET", "/api/auth/me")).status, 401);
  });

  await test("GET /api/equipos sin sesión → 401", async () => {
    assert.equal((await request("GET", "/api/equipos")).status, 401);
  });

  await test("POST /api/auth/register con datos inválidos → 400 con detalles", async () => {
    const r = await request("POST", "/api/auth/register", { correo: "x", password: "1" });
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.some((d) => d.campo === "correo"));
  });

  await test("POST con JSON mal formado → 400", async () => {
    assert.equal((await request("POST", "/api/auth/login", undefined, { raw: "{malo" })).status, 400);
  });

  await test("POST /api/auth/register → 201 y guarda en la base", async () => {
    const r = await request("POST", "/api/auth/register", {
      codigo: `T-${sufijo}`,
      nombres: "Prueba",
      apellidos: "Automática",
      correo: correo.toUpperCase(),
      password,
    });
    assert.equal(r.status, 201);
    idUsuario = r.body.data.id_usuario;
    const [[fila]] = await pool.execute("SELECT correo, password_hash FROM usuario WHERE id_usuario = ?", [idUsuario]);
    assert.equal(fila.correo, correo);
    assert.notEqual(fila.password_hash, password);
  });

  await test("POST /api/auth/register duplicado → 409", async () => {
    const r = await request("POST", "/api/auth/register", {
      codigo: `T-${sufijo}`, nombres: "P", apellidos: "A", correo, password,
    });
    assert.equal(r.status, 409);
  });

  await test("POST /api/auth/login con contraseña incorrecta → 401", async () => {
    assert.equal((await request("POST", "/api/auth/login", { correo, password: "otra-clave" })).status, 401);
  });

  await test("POST /api/auth/login → 200 y cookie de sesión", async () => {
    const r = await request("POST", "/api/auth/login", { correo, password });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.user.rol, "Estudiante");
    assert.ok(cookie);
  });

  await test("GET /api/auth/me con sesión → 200", async () => {
    const r = await request("GET", "/api/auth/me");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.user.correo, correo);
  });

  await test("Estudiante: GET /api/equipos → 200, POST → 403", async () => {
    assert.equal((await request("GET", "/api/equipos")).status, 200);
    assert.equal((await request("POST", "/api/equipos", {})).status, 403);
  });

  // Promover a administrador y volver a iniciar sesión.
  await pool.execute(
    "UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre_rol = 'Administrador') WHERE id_usuario = ?",
    [idUsuario],
  );
  await request("POST", "/api/auth/login", { correo, password });

  const equipo = {
    codigo_interno: `T-${sufijo}`,
    nombre: "Cámara de prueba",
    marca: "Sony",
    modelo: "",
    fecha_compra: "2025-03-14",
    id_categoria: 1,
    id_estado_equipo: 1,
  };

  await test("Admin: POST /api/equipos → 201 con el equipo creado", async () => {
    const r = await request("POST", "/api/equipos", equipo);
    assert.equal(r.status, 201);
    idEquipo = r.body.data.id_equipo;
    assert.equal(r.body.data.modelo, null);
    assert.equal(r.body.data.fecha_compra, "2025-03-14");
    assert.equal(r.body.data.activo, true);
  });

  await test("Admin: POST /api/equipos con código repetido → 409", async () => {
    assert.equal((await request("POST", "/api/equipos", equipo)).status, 409);
  });

  await test("Admin: POST /api/equipos con categoría inexistente → 400", async () => {
    const r = await request("POST", "/api/equipos", { ...equipo, codigo_interno: `X-${sufijo}`, id_categoria: 99999 });
    assert.equal(r.status, 400);
    assert.equal(r.body.detalles[0].campo, "id_categoria");
  });

  await test("Admin: PUT /api/equipos/:id → 200", async () => {
    const r = await request("PUT", `/api/equipos/${idEquipo}`, { ...equipo, nombre: "Editada", activo: false });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.nombre, "Editada");
    assert.equal(r.body.data.activo, false);
  });

  await test("GET /api/equipos/abc → 400 y /api/equipos/999999 → 404", async () => {
    assert.equal((await request("GET", "/api/equipos/abc")).status, 400);
    assert.equal((await request("GET", "/api/equipos/999999")).status, 404);
  });

  await test("Admin: DELETE /api/equipos/:id → 204", async () => {
    assert.equal((await request("DELETE", `/api/equipos/${idEquipo}`)).status, 204);
    idEquipo = null;
  });

  await test("POST /api/auth/logout → 204 y la sesión deja de ser válida", async () => {
    assert.equal((await request("POST", "/api/auth/logout")).status, 204);
    assert.equal((await request("GET", "/api/auth/me")).status, 401);
  });

  await test("POST /api/auth/logout sin sesión también → 204", async () => {
    cookie = "";
    assert.equal((await request("POST", "/api/auth/logout")).status, 204);
  });

  await test("Ruta inexistente → 404", async () => {
    assert.equal((await request("GET", "/api/no-existe")).status, 404);
  });

  console.log(`\n${aprobadas} pruebas aprobadas.`);
} catch (error) {
  console.error(`\n✗ Falló después de ${aprobadas} pruebas aprobadas:\n`, error);
  process.exitCode = 1;
} finally {
  if (idEquipo) await pool.execute("DELETE FROM equipo WHERE id_equipo = ?", [idEquipo]);
  if (idUsuario) await pool.execute("DELETE FROM usuario WHERE id_usuario = ?", [idUsuario]);
  sessionStore.close();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
