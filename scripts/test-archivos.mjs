// Pruebas de extremo a extremo de /api/archivos (persistencia dual MySQL + disco).
// Usa la base de backend/.env y una carpeta temporal como FILE_STORAGE_DIR; al terminar borra
// filas, usuarios, equipos, sesiones y archivos creados.   Uso: node scripts/test-archivos.mjs
//
// Monta sus propias rutas (como test-prestamos.mjs), así funciona aunque app.js aún no
// tenga /api/archivos.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const esServidorHijo = process.argv.includes("--servidor");
if (!esServidorHijo) {
  process.env.FILE_STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "test-archivos-"));
}

// Importaciones dinámicas: FILE_STORAGE_DIR debe estar definido antes de cargar el módulo.
const { default: express } = await import("express");
const { default: bcrypt } = await import("bcryptjs");
const { pool } = await import("../backend/src/config/database.js");
const { sessionMiddleware, sessionStore } = await import("../backend/src/middleware/session.js");
const { authRoutes } = await import("../backend/src/routes/authRoutes.js");
const { archivoRoutes } = await import("../backend/src/routes/archivoRoutes.js");
const { HttpError } = await import("../backend/src/utils/http.js");
const storage = await import("../backend/src/services/archivoStorage.js");
const repo = await import("../backend/src/repositories/archivoRepository.js");

function crearApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use(sessionMiddleware);
  app.use("/api/auth", authRoutes);
  app.use("/api/archivos", archivoRoutes);
  app.use((error, _request, response, _next) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ error: error.message, ...(error.detalles && { detalles: error.detalles }) });
    }
    console.error(error);
    return response.status(500).json({ error: "Error interno del servidor" });
  });
  return app;
}

async function escuchar(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

// ── Modo "servidor reiniciado": proceso nuevo que sólo sirve la API ──────────────────────
if (esServidorHijo) {
  const server = await escuchar(crearApp());
  console.log(`PUERTO ${server.address().port}`);
  process.on("SIGTERM", async () => {
    sessionStore.close();
    server.close();
    await pool.end();
    process.exit(0);
  });
} else {
  await ejecutarPruebas();
}

async function ejecutarPruebas() {
  const server = await escuchar(crearApp());
  let base = `http://127.0.0.1:${server.address().port}/api`;
  const sufijo = randomUUID().slice(0, 8);
  const password = randomUUID();
  const usuarios = [];
  const equipos = [];
  let aprobadas = 0;
  let hijo = null;

  const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
  const MAX = storage.MAX_FILE_BYTES;

  // Bytes de prueba con firma real.
  const JPEG = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  );
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const conRelleno = (buffer, n) => Buffer.concat([buffer, Buffer.from(randomUUID().repeat(n))]);

  async function test(nombre, fn) {
    await fn();
    aprobadas += 1;
    console.log(`  ✓ ${nombre}`);
  }

  async function request(method, ruta, { cookie, form, json } = {}) {
    const response = await fetch(base + ruta, {
      method,
      headers: { ...(cookie && { Cookie: cookie }), ...(json && { "Content-Type": "application/json" }) },
      body: form ?? (json ? JSON.stringify(json) : undefined),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const tipo = response.headers.get("content-type") || "";
    return {
      status: response.status,
      headers: response.headers,
      buffer,
      body: tipo.includes("application/json") && buffer.length ? JSON.parse(buffer) : null,
    };
  }

  function formulario({ bytes, nombre, tipo = "application/octet-stream", campos = {} }) {
    const form = new FormData();
    for (const [clave, valor] of Object.entries(campos)) form.append(clave, String(valor));
    if (bytes) form.append("archivo", new Blob([bytes], { type: tipo }), nombre);
    return form;
  }

  async function crearUsuario(rol) {
    const correo = `arch.${rol.toLowerCase()}.${sufijo}@uao.edu.co`;
    const [result] = await pool.execute(
      `INSERT INTO usuario (codigo, nombres, apellidos, correo, password_hash, id_rol)
       VALUES (?, ?, 'Prueba', ?, ?, (SELECT id_rol FROM rol WHERE nombre_rol = ?))`,
      [`ARCH-${rol.slice(0, 3)}-${sufijo}`, `${rol} archivos`, correo, await bcrypt.hash(password, 4), rol],
    );
    usuarios.push(result.insertId);
    const r = await request("POST", "/auth/login", { json: { correo, password } });
    assert.equal(r.status, 200);
    return { id: result.insertId, cookie: r.headers.get("set-cookie").split(";")[0] };
  }

  async function crearEquipo(activo) {
    const [result] = await pool.execute(
      `INSERT INTO equipo (codigo_interno, nombre, activo, id_categoria, id_estado_equipo)
       VALUES (?, 'Equipo prueba archivos', ?, (SELECT MIN(id_categoria) FROM categoria_equipo),
               (SELECT MIN(id_estado_equipo) FROM estado_equipo))`,
      [`ARCH-${activo ? "A" : "I"}-${sufijo}`, activo ? 1 : 0],
    );
    equipos.push(result.insertId);
    return result.insertId;
  }

  const filasDe = async (idEquipo) =>
    (await pool.execute("SELECT * FROM archivo_multimedia WHERE id_equipo = ? ORDER BY id_archivo", [idEquipo]))[0];
  const archivosEnDisco = async () =>
    (await fs.readdir(storage.STORAGE_DIR)).filter((nombre) => !nombre.startsWith("."));
  const temporales = async () => fs.readdir(storage.TMP_DIR).catch(() => []);

  try {
    console.log(`Prueba de archivos (FILE_STORAGE_DIR=${storage.STORAGE_DIR})\n`);
    const admin = await crearUsuario("Administrador");
    const estudiante = await crearUsuario("Estudiante");
    const idEquipo = await crearEquipo(true);
    const idEquipoInactivo = await crearEquipo(false);
    const subidos = {};

    await test("Sin sesión: GET /api/archivos → 401", async () => {
      assert.equal((await request("GET", `/archivos?equipo_id=${idEquipo}`)).status, 401);
    });

    await test("Estudiante: POST → 403 y no escribe nada en disco", async () => {
      const r = await request("POST", "/archivos", {
        cookie: estudiante.cookie,
        form: formulario({ bytes: JPEG, nombre: "x.jpg", tipo: "image/jpeg", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r.status, 403);
      assert.deepEqual(await temporales(), []);
      assert.deepEqual(await archivosEnDisco(), []);
    });

    await test("Admin: POST JPG → 201 + fila MySQL + archivo físico con los mismos bytes", async () => {
      const bytes = conRelleno(JPEG, 3);
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({
          bytes,
          nombre: "foto equipo.jpg",
          tipo: "image/jpeg",
          campos: { id_equipo: idEquipo, descripcion: "  Vista frontal  ", principal: "true" },
        }),
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.headers.get("location"), `/api/archivos/${r.body.data.id_archivo}`);
      assert.equal(r.body.data.sha256, sha256(bytes));
      assert.equal(r.body.data.ruta_archivo, undefined);
      assert.equal(r.body.data.nombre_almacenado, undefined);

      const [fila] = await filasDe(idEquipo);
      assert.equal(fila.nombre_original, "foto equipo.jpg");
      assert.match(fila.nombre_almacenado, /^[0-9a-f-]{36}\.jpg$/);
      assert.equal(fila.ruta_archivo, fila.nombre_almacenado);
      assert.equal(fila.tipo_mime, "image/jpeg");
      assert.equal(Number(fila.tamano_bytes), bytes.length);
      assert.equal(fila.descripcion, "Vista frontal");
      assert.equal(Boolean(fila.principal), true);
      assert.equal(fila.id_usuario_carga, admin.id);
      assert.ok(fila.fecha_subida);
      const fisico = await fs.readFile(path.join(storage.STORAGE_DIR, fila.nombre_almacenado));
      assert.equal(sha256(fisico), sha256(bytes));
      subidos.jpg1 = { id: fila.id_archivo, bytes, almacenado: fila.nombre_almacenado };
    });

    await test("Dos archivos con el mismo nombre original no se sobrescriben", async () => {
      const bytes = conRelleno(JPEG, 5);
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes, nombre: "foto equipo.jpg", tipo: "image/jpeg", campos: { id_equipo: idEquipo, principal: "1" } }),
      });
      assert.equal(r.status, 201);
      const filas = await filasDe(idEquipo);
      assert.equal(filas.length, 2);
      assert.notEqual(filas[0].nombre_almacenado, filas[1].nombre_almacenado);
      assert.equal(filas[0].nombre_original, filas[1].nombre_original);
      const primero = await fs.readFile(path.join(storage.STORAGE_DIR, subidos.jpg1.almacenado));
      assert.equal(sha256(primero), sha256(subidos.jpg1.bytes), "el primer archivo cambió");
      // Sólo un principal por equipo: el nuevo reemplaza al anterior.
      assert.deepEqual(filas.map((f) => Boolean(f.principal)), [false, true]);
      subidos.jpg2 = { id: r.body.data.id_archivo, bytes };
    });

    await test("Admin: POST PDF → 201 (tipo por firma aunque el navegador diga octet-stream)", async () => {
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: PDF, nombre: "../../manual ñandú.pdf", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.tipo_mime, "application/pdf");
      assert.equal(r.body.data.nombre_original, "manual ñandú.pdf"); // sin ../
      subidos.pdf = { id: r.body.data.id_archivo, bytes: PDF };
    });

    await test("PNG con extensión equivocada se guarda como PNG", async () => {
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: PNG, nombre: "diagrama.jpg", tipo: "image/jpeg", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.tipo_mime, "image/png");
      subidos.png = { id: r.body.data.id_archivo, bytes: PNG };
    });

    await test("415: texto disfrazado de PNG; no deja fila ni archivo", async () => {
      const antes = (await archivosEnDisco()).length;
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: Buffer.from("<script>alert(1)</script>"), nombre: "falso.png", tipo: "image/png", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r.status, 415);
      assert.equal((await archivosEnDisco()).length, antes);
      assert.equal((await filasDe(idEquipo)).length, 4);
      assert.deepEqual(await temporales(), []);
    });

    await test("413: archivo de 10 MiB + 1 byte (límite de Multer) y cuerpo enorme (Content-Length)", async () => {
      const grande = Buffer.alloc(MAX + 1);
      PNG.copy(grande);
      const r1 = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: grande, nombre: "grande.png", tipo: "image/png", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r1.status, 413);
      const enorme = Buffer.alloc(MAX + 2 * 1024 * 1024);
      const r2 = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: enorme, nombre: "enorme.png", campos: { id_equipo: idEquipo } }),
      });
      assert.equal(r2.status, 413);
      assert.equal((await filasDe(idEquipo)).length, 4);
      assert.deepEqual(await temporales(), []);
    });

    await test("400: sin archivo, archivo vacío, equipo inválido o inexistente", async () => {
      const casos = [
        formulario({ campos: { id_equipo: idEquipo } }),
        formulario({ bytes: Buffer.alloc(0), nombre: "vacio.png", campos: { id_equipo: idEquipo } }),
        formulario({ bytes: PNG, nombre: "a.png", campos: { id_equipo: "abc" } }),
        formulario({ bytes: PNG, nombre: "a.png", campos: { id_equipo: 999999999 } }),
        formulario({ bytes: PNG, nombre: "a.png", campos: { id_equipo: idEquipo, principal: "quizás" } }),
      ];
      for (const form of casos) {
        assert.equal((await request("POST", "/archivos", { cookie: admin.cookie, form })).status, 400);
      }
      assert.deepEqual(await temporales(), []);
    });

    await test("GET lista sin ruta_archivo ni nombre_almacenado; estudiante ve equipo activo", async () => {
      for (const usuario of [admin, estudiante]) {
        const r = await request("GET", `/archivos?equipo_id=${idEquipo}`, { cookie: usuario.cookie });
        assert.equal(r.status, 200);
        assert.equal(r.body.data.length, 4);
        for (const item of r.body.data) {
          assert.equal(item.ruta_archivo, undefined);
          assert.equal(item.nombre_almacenado, undefined);
          assert.equal(item.url_descargar, `/api/archivos/${item.id_archivo}/descargar`);
        }
      }
    });

    await test("Equipo inactivo: estudiante 404 (lista y descarga), admin sí accede", async () => {
      const r = await request("POST", "/archivos", {
        cookie: admin.cookie,
        form: formulario({ bytes: PNG, nombre: "oculto.png", campos: { id_equipo: idEquipoInactivo } }),
      });
      assert.equal(r.status, 201);
      const id = r.body.data.id_archivo;
      assert.equal((await request("GET", `/archivos?equipo_id=${idEquipoInactivo}`, { cookie: estudiante.cookie })).status, 404);
      assert.equal((await request("GET", `/archivos/${id}/descargar`, { cookie: estudiante.cookie })).status, 404);
      assert.equal((await request("GET", `/archivos/${id}/descargar`, { cookie: admin.cookie })).status, 200);
      const todos = await request("GET", "/archivos", { cookie: estudiante.cookie });
      assert.ok(!todos.body.data.some((a) => a.id_archivo === id));
    });

    await test("Descarga y visualización: bytes idénticos y cabeceras seguras", async () => {
      for (const { id, bytes } of Object.values(subidos)) {
        const r = await request("GET", `/archivos/${id}/descargar`, { cookie: estudiante.cookie });
        assert.equal(r.status, 200);
        assert.equal(sha256(r.buffer), sha256(bytes));
        assert.match(r.headers.get("content-disposition"), /^attachment; filename="/);
        assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      }
      const v = await request("GET", `/archivos/${subidos.pdf.id}/visualizar`, { cookie: estudiante.cookie });
      assert.equal(v.headers.get("content-type"), "application/pdf");
      assert.match(v.headers.get("content-disposition"), /^inline; .*filename\*=UTF-8''manual%20%C3%B1and%C3%BA\.pdf$/);
    });

    await test("404: id inexistente; 400: id no numérico o con ../", async () => {
      assert.equal((await request("GET", "/archivos/999999999/descargar", { cookie: admin.cookie })).status, 404);
      assert.equal((await request("GET", "/archivos/abc/visualizar", { cookie: admin.cookie })).status, 400);
      assert.equal((await request("GET", "/archivos/..%2F..%2Fetc%2Fpasswd/descargar", { cookie: admin.cookie })).status, 400);
    });

    await test("Ruta interna manipulada en MySQL (../../etc/passwd) no se sirve → 404", async () => {
      const [[fila]] = await pool.execute("SELECT ruta_archivo FROM archivo_multimedia WHERE id_archivo = ?", [subidos.png.id]);
      await pool.execute("UPDATE archivo_multimedia SET ruta_archivo = '../../../../etc/passwd' WHERE id_archivo = ?", [subidos.png.id]);
      try {
        const r = await request("GET", `/archivos/${subidos.png.id}/descargar`, { cookie: admin.cookie });
        assert.equal(r.status, 404);
        assert.ok(!r.buffer.toString().includes("root:"));
      } finally {
        await pool.execute("UPDATE archivo_multimedia SET ruta_archivo = ? WHERE id_archivo = ?", [fila.ruta_archivo, subidos.png.id]);
      }
    });

    await test("404 si la fila existe pero faltan los bytes físicos", async () => {
      const ruta = path.join(storage.STORAGE_DIR, (await repo.findInternoById(subidos.jpg2.id)).ruta_archivo);
      const respaldo = await fs.readFile(ruta);
      await fs.rm(ruta);
      try {
        assert.equal((await request("GET", `/archivos/${subidos.jpg2.id}/visualizar`, { cookie: admin.cookie })).status, 404);
      } finally {
        await fs.writeFile(ruta, respaldo);
      }
    });

    await test("Compensación: si el INSERT falla (FK real de MySQL), se borra el archivo físico", async () => {
      const temp = path.join(storage.TMP_DIR, `${randomUUID()}.upload`);
      await fs.writeFile(temp, PNG);
      const antes = await archivosEnDisco();
      await assert.rejects(
        storage.guardarConCompensacion({ rutaTemporal: temp, ext: "png" }, ({ nombreAlmacenado, rutaArchivo }) =>
          repo.insertArchivo({
            nombre_original: "fallo.png", nombre_almacenado: nombreAlmacenado, tipo_mime: "image/png",
            tamano_bytes: PNG.length, ruta_archivo: rutaArchivo, descripcion: null, principal: false,
            id_equipo: 999999999, id_usuario_carga: admin.id, // equipo inexistente → error de FK
          }),
        ),
        (error) => error.code?.startsWith("ER_NO_REFERENCED_ROW"),
      );
      assert.deepEqual(await archivosEnDisco(), antes);
      assert.deepEqual(await temporales(), []);
    });

    await test("Compensación: si el disco falla, no se inserta ninguna fila", async () => {
      let insertado = false;
      await assert.rejects(
        storage.guardarConCompensacion({ rutaTemporal: path.join(storage.TMP_DIR, "no-existe.upload"), ext: "png" }, async () => {
          insertado = true;
        }),
      );
      assert.equal(insertado, false);
    });

    await test("Compensación en DELETE: si falla el SQL, el archivo se restaura", async () => {
      const fila = await repo.findInternoById(subidos.pdf.id);
      await assert.rejects(
        storage.eliminarConCompensacion(fila.ruta_archivo, async () => {
          throw new Error("fallo simulado de MySQL");
        }),
        /fallo simulado/,
      );
      const r = await request("GET", `/archivos/${subidos.pdf.id}/descargar`, { cookie: admin.cookie });
      assert.equal(sha256(r.buffer), sha256(PDF));
      assert.deepEqual(await fs.readdir(storage.PAPELERA_DIR), []);
    });

    await test("Reconciliación: restaura papelera con fila y aparta huérfanos antiguos", async () => {
      const fila = await repo.findInternoById(subidos.png.id);
      await fs.rename(path.join(storage.STORAGE_DIR, fila.ruta_archivo), path.join(storage.PAPELERA_DIR, `${fila.ruta_archivo}.123`));
      const huerfano = `${randomUUID()}.png`;
      await fs.writeFile(path.join(storage.STORAGE_DIR, huerfano), PNG);
      const viejo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(path.join(storage.STORAGE_DIR, huerfano), viejo, viejo);
      const informe = await storage.reconciliarAlmacenamiento(repo.rutaExists);
      assert.equal(informe.restaurados, 1);
      assert.equal(informe.huerfanos, 1);
      assert.ok((await archivosEnDisco()).includes(fila.ruta_archivo));
      assert.deepEqual(await fs.readdir(storage.HUERFANOS_DIR), [huerfano]);
    });

    await test("Reinicio: un proceso nuevo del servidor entrega los mismos bytes", async () => {
      server.close();
      hijo = spawn(process.execPath, [fileURLToPath(import.meta.url), "--servidor"], {
        env: process.env,
        stdio: ["ignore", "pipe", "inherit"],
      });
      const puerto = await new Promise((resolve, reject) => {
        hijo.stdout.on("data", (chunk) => {
          const match = /PUERTO (\d+)/.exec(chunk.toString());
          if (match) resolve(match[1]);
        });
        hijo.once("exit", (code) => reject(new Error(`El servidor hijo terminó (${code})`)));
      });
      base = `http://127.0.0.1:${puerto}/api`;
      for (const { id, bytes } of Object.values(subidos)) {
        const r = await request("GET", `/archivos/${id}/descargar`, { cookie: admin.cookie });
        assert.equal(r.status, 200);
        assert.equal(sha256(r.buffer), sha256(bytes));
      }
    });

    await test("DELETE: estudiante 403; admin 204 borra fila y archivo; repetir → 404", async () => {
      const fila = await repo.findInternoById(subidos.jpg1.id);
      assert.equal((await request("DELETE", `/archivos/${subidos.jpg1.id}`, { cookie: estudiante.cookie })).status, 403);
      assert.equal((await request("DELETE", `/archivos/${subidos.jpg1.id}`, { cookie: admin.cookie })).status, 204);
      assert.equal(await repo.findInternoById(subidos.jpg1.id), null);
      assert.ok(!(await archivosEnDisco()).includes(fila.ruta_archivo));
      assert.equal((await request("DELETE", `/archivos/${subidos.jpg1.id}`, { cookie: admin.cookie })).status, 404);
      assert.deepEqual(await fs.readdir(storage.PAPELERA_DIR), []);
    });

    await test("DELETE de una fila cuyo archivo ya no existe → 204 (limpia la fila)", async () => {
      const fila = await repo.findInternoById(subidos.jpg2.id);
      await fs.rm(path.join(storage.STORAGE_DIR, fila.ruta_archivo));
      assert.equal((await request("DELETE", `/archivos/${subidos.jpg2.id}`, { cookie: admin.cookie })).status, 204);
      assert.equal(await repo.findInternoById(subidos.jpg2.id), null);
    });

    console.log(`\n${aprobadas} pruebas aprobadas.`);
  } catch (error) {
    console.error(`\n✗ Falló después de ${aprobadas} pruebas aprobadas:\n`, error);
    process.exitCode = 1;
  } finally {
    if (hijo && hijo.exitCode === null) {
      hijo.kill("SIGTERM");
      await new Promise((resolve) => hijo.once("exit", resolve));
    }
    if (equipos.length) {
      const marcas = equipos.map(() => "?").join(", ");
      await pool.execute(`DELETE FROM archivo_multimedia WHERE id_equipo IN (${marcas})`, equipos);
      await pool.execute(`DELETE FROM equipo WHERE id_equipo IN (${marcas})`, equipos);
    }
    for (const id of usuarios) {
      await pool.execute("DELETE FROM sessions WHERE data LIKE ?", [`%"id_usuario":${id},%`]);
      await pool.execute("DELETE FROM usuario WHERE id_usuario = ?", [id]);
    }
    await fs.rm(storage.STORAGE_DIR, { recursive: true, force: true });
    sessionStore.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}
