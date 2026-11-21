// Almacenamiento físico de archivos de equipos (fuera de MySQL y fuera de carpetas públicas).
//
// Estructura dentro de FILE_STORAGE_DIR:
//   <uuid>.<ext>   archivos definitivos (nombre generado por el servidor, nunca por el usuario)
//   .tmp/          cargas en curso (Multer escribe aquí; se mueven o se borran al terminar)
//   .papelera/     archivos en proceso de borrado (compensación de DELETE)
//   .huerfanos/    archivos sin fila en MySQL detectados por la reconciliación (cuarentena)
//
// No existe una transacción ACID conjunta entre MySQL y el disco. Este módulo aplica
// COMPENSACIÓN: cada operación deja el sistema consistente si falla una de las dos partes,
// y reconciliarAlmacenamiento() repara lo que haya quedado a medias por una caída del proceso.
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../config/env.js"; // carga backend/.env antes de leer las variables

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Directorio raíz absoluto. Una ruta relativa se interpreta desde la carpeta backend/. */
export const STORAGE_DIR = path.resolve(backendDir, process.env.FILE_STORAGE_DIR || "storage");
export const TMP_DIR = path.join(STORAGE_DIR, ".tmp");
export const PAPELERA_DIR = path.join(STORAGE_DIR, ".papelera");
export const HUERFANOS_DIR = path.join(STORAGE_DIR, ".huerfanos");

const MIB = 1024 * 1024;
/** Tamaño máximo por archivo (por defecto 10 MiB). */
export const MAX_FILE_BYTES = Number(process.env.FILE_MAX_BYTES) > 0 ? Number(process.env.FILE_MAX_BYTES) : 10 * MIB;

/** Tipos admitidos, identificados por la firma real del contenido (magic bytes). */
const FIRMAS = [
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];
export const MIME_PERMITIDOS = FIRMAS.map((firma) => firma.mime);

// Sólo se aceptan rutas internas con esta forma exacta: <uuid v4>.<ext permitida>.
const NOMBRE_ALMACENADO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|pdf)$/;

/**
 * Crea las carpetas de almacenamiento si no existen. Se llama en cada operación (mkdir recursivo
 * es barato) para recuperarse si la carpeta o el volumen se eliminan con el servidor encendido.
 */
export async function prepararAlmacenamiento() {
  await Promise.all([STORAGE_DIR, TMP_DIR, PAPELERA_DIR, HUERFANOS_DIR].map((dir) => fs.mkdir(dir, { recursive: true })));
}

/** Lee los primeros bytes y devuelve { mime, ext } si es PNG/JPEG/PDF real; si no, null. */
export async function detectarTipo(rutaTemporal) {
  const handle = await fs.open(rutaTemporal, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firma = FIRMAS.find(
      ({ bytes }) => bytesRead >= bytes.length && bytes.every((byte, i) => buffer[i] === byte),
    );
    return firma ? { mime: firma.mime, ext: firma.ext } : null;
  } finally {
    await handle.close();
  }
}

/** Huella SHA-256 de un archivo (evidencia de integridad). */
export async function sha256Archivo(ruta) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(ruta)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Normaliza el nombre original para guardarlo como metadato y usarlo en la descarga.
 * Nunca se usa para construir rutas físicas.
 */
export function normalizarNombreOriginal(nombre, ext) {
  const base = String(nombre ?? "")
    .normalize("NFC")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const limpio = base || `archivo.${ext}`;
  if (limpio.length <= 255) return limpio;
  const extension = path.extname(limpio).slice(0, 10);
  return limpio.slice(0, 255 - extension.length) + extension;
}

/**
 * Convierte la ruta interna guardada en MySQL en ruta absoluta, comprobando que tenga la forma
 * <uuid>.<ext> y que quede dentro de STORAGE_DIR. Cualquier otro valor se rechaza (null).
 */
export function resolverRutaSegura(rutaInterna) {
  if (typeof rutaInterna !== "string" || !NOMBRE_ALMACENADO.test(rutaInterna)) return null;
  const absoluta = path.resolve(STORAGE_DIR, rutaInterna);
  if (path.dirname(absoluta) !== STORAGE_DIR) return null;
  return absoluta;
}

/** Mueve sin sobrescribir jamás un archivo existente. */
async function moverSinSobrescribir(origen, destino) {
  try {
    await fs.link(origen, destino); // falla con EEXIST si el destino ya existe
  } catch (error) {
    if (error.code === "EEXIST") throw error;
    // Sistemas de archivos sin enlaces duros: copia exclusiva.
    await fs.copyFile(origen, destino, constants.COPYFILE_EXCL);
  }
  await fs.rm(origen, { force: true });
}

/**
 * Persistencia dual de una carga.
 *   1. Mueve el temporal validado a <uuid>.<ext> (si el disco falla, NO se llama a insertar).
 *   2. Llama a insertar(metadatos) para crear la fila en MySQL.
 *   3. Si insertar falla, borra el archivo definitivo (compensación) y relanza el error.
 * Devuelve lo que devuelva insertar.
 */
export async function guardarConCompensacion({ rutaTemporal, ext }, insertar) {
  await prepararAlmacenamiento();
  const nombreAlmacenado = `${randomUUID()}.${ext}`;
  const destino = resolverRutaSegura(nombreAlmacenado);
  if (!destino) throw new Error("No se pudo generar una ruta interna válida");

  await moverSinSobrescribir(rutaTemporal, destino); // si falla: no hay fila falsa

  try {
    return await insertar({ nombreAlmacenado, rutaArchivo: nombreAlmacenado });
  } catch (error) {
    await fs.rm(destino, { force: true }).catch((rmError) => {
      // Si ni siquiera se puede compensar, la reconciliación lo moverá a .huerfanos/.
      console.error(`[archivos] Compensación pendiente: no se pudo borrar ${destino}:`, rmError.message);
    });
    throw error;
  }
}

/**
 * Eliminación con compensación.
 *   1. Mueve el archivo a .papelera/ (no se pierde nada todavía).
 *   2. Llama a borrarFila() (DELETE en MySQL).
 *   3. Si el DELETE falla, restaura el archivo a su lugar y relanza el error.
 *   4. Si el DELETE confirma, borra definitivamente el archivo de la papelera.
 * Si el archivo ya no existía, se elimina igualmente la fila (se registra el problema).
 */
export async function eliminarConCompensacion(rutaInterna, borrarFila) {
  await prepararAlmacenamiento();
  const original = resolverRutaSegura(rutaInterna);
  let enPapelera = null;

  if (original) {
    enPapelera = path.join(PAPELERA_DIR, `${rutaInterna}.${Date.now()}`);
    try {
      await fs.rename(original, enPapelera);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      console.warn(`[archivos] Integridad: ${rutaInterna} no existía en disco al eliminar su fila.`);
      enPapelera = null;
    }
  } else {
    console.warn(`[archivos] Integridad: ruta interna inválida "${rutaInterna}"; sólo se elimina la fila.`);
  }

  let resultado;
  try {
    resultado = await borrarFila();
  } catch (error) {
    if (enPapelera) {
      await fs.rename(enPapelera, original).catch((restoreError) => {
        console.error(`[archivos] No se pudo restaurar ${enPapelera}; la reconciliación lo reintentará:`, restoreError.message);
      });
    }
    throw error;
  }

  if (enPapelera) {
    await fs.rm(enPapelera, { force: true }).catch((rmError) => {
      console.error(`[archivos] Borrado pendiente en papelera (${enPapelera}):`, rmError.message);
    });
  }
  return resultado;
}

/** Información del archivo físico para servirlo, o null si no existe. */
export async function infoArchivo(rutaInterna) {
  const absoluta = resolverRutaSegura(rutaInterna);
  if (!absoluta) return null;
  try {
    const stat = await fs.stat(absoluta);
    return stat.isFile() ? { ruta: absoluta, tamano: stat.size } : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export const abrirLectura = (rutaAbsoluta) => createReadStream(rutaAbsoluta);

export const borrarTemporal = (ruta) => (ruta ? fs.rm(ruta, { force: true }).catch(() => {}) : Promise.resolve());

/**
 * Repara estados intermedios dejados por una caída del proceso:
 *  - .papelera/: si la fila sigue existiendo, restaura el archivo; si no, lo borra.
 *  - .tmp/: borra cargas abandonadas con más de 1 hora.
 *  - raíz: archivos <uuid>.<ext> sin fila y con más de 1 hora pasan a .huerfanos/ (no se borran).
 * existeRuta(rutaInterna) debe consultar MySQL.
 */
export async function reconciliarAlmacenamiento(existeRuta, { antiguedadMs = 60 * 60 * 1000 } = {}) {
  await prepararAlmacenamiento();
  const ahora = Date.now();
  const informe = { restaurados: 0, purgados: 0, temporales: 0, huerfanos: 0 };

  for (const nombre of await fs.readdir(PAPELERA_DIR)) {
    const rutaInterna = nombre.replace(/\.\d+$/, "");
    const enPapelera = path.join(PAPELERA_DIR, nombre);
    const destino = resolverRutaSegura(rutaInterna);
    if (destino && (await existeRuta(rutaInterna))) {
      await fs.rename(enPapelera, destino);
      informe.restaurados += 1;
    } else {
      await fs.rm(enPapelera, { force: true });
      informe.purgados += 1;
    }
  }

  for (const nombre of await fs.readdir(TMP_DIR)) {
    const ruta = path.join(TMP_DIR, nombre);
    const stat = await fs.stat(ruta).catch(() => null);
    if (stat && ahora - stat.mtimeMs > antiguedadMs) {
      await fs.rm(ruta, { force: true });
      informe.temporales += 1;
    }
  }

  for (const nombre of await fs.readdir(STORAGE_DIR)) {
    if (!NOMBRE_ALMACENADO.test(nombre)) continue;
    const ruta = path.join(STORAGE_DIR, nombre);
    const stat = await fs.stat(ruta).catch(() => null);
    if (stat?.isFile() && ahora - stat.mtimeMs > antiguedadMs && !(await existeRuta(nombre))) {
      await fs.rename(ruta, path.join(HUERFANOS_DIR, nombre));
      informe.huerfanos += 1;
    }
  }

  return informe;
}
