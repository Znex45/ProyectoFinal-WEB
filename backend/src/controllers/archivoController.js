import { pipeline } from "node:stream/promises";
import * as archivos from "../repositories/archivoRepository.js";
import {
  abrirLectura,
  borrarTemporal,
  detectarTipo,
  eliminarConCompensacion,
  guardarConCompensacion,
  infoArchivo,
  normalizarNombreOriginal,
  sha256Archivo,
} from "../services/archivoStorage.js";
import { HttpError } from "../utils/http.js";

const esAdmin = (request) => request.session.user.rol === "Administrador";

// Content-Disposition seguro: ASCII de respaldo + nombre UTF-8 (RFC 6266 / 5987).
function contentDisposition(tipo, nombre) {
  const ascii = nombre.normalize("NFKD").replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_");
  const utf8 = encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// POST /api/archivos  (multipart: archivo, id_equipo, descripcion?, principal?)
export async function subirArchivo(request, response) {
  const archivo = request.file;
  try {
    if (!archivo) {
      throw new HttpError(400, "Datos inválidos", [{ campo: "archivo", mensaje: "Debes adjuntar un archivo" }]);
    }
    if (archivo.size === 0) {
      throw new HttpError(400, "Datos inválidos", [{ campo: "archivo", mensaje: "El archivo está vacío" }]);
    }

    const { id_equipo, descripcion, principal } = request.validated.body;
    if (!(await archivos.findEquipo(id_equipo))) {
      throw new HttpError(400, "Datos inválidos", [{ campo: "id_equipo", mensaje: "El equipo no existe" }]);
    }
    const idUsuario = request.session.user.id_usuario;
    if (!(await archivos.usuarioActivoExists(idUsuario))) {
      throw new HttpError(403, "Tu usuario no está activo");
    }

    // Tipo real según la firma del contenido; el mimetype del navegador no se usa.
    const tipo = await detectarTipo(archivo.path);
    if (!tipo) throw new HttpError(415, "Tipo de archivo no permitido. Sólo se aceptan PNG, JPEG y PDF");

    const nombreOriginal = normalizarNombreOriginal(archivo.originalname, tipo.ext);
    const sha256 = await sha256Archivo(archivo.path);

    const id = await guardarConCompensacion({ rutaTemporal: archivo.path, ext: tipo.ext }, ({ nombreAlmacenado, rutaArchivo }) =>
      archivos.insertArchivo({
        nombre_original: nombreOriginal,
        nombre_almacenado: nombreAlmacenado,
        tipo_mime: tipo.mime,
        tamano_bytes: archivo.size,
        ruta_archivo: rutaArchivo,
        descripcion,
        principal,
        id_equipo,
        id_usuario_carga: idUsuario,
      }),
    );

    const creado = await archivos.findPublicoById(id);
    response.status(201).location(`/api/archivos/${id}`).json({ data: { ...creado, sha256 } });
  } finally {
    await borrarTemporal(archivo?.path);
  }
}

// GET /api/archivos?equipo_id=  — estudiantes y docentes sólo ven archivos de equipos activos.
export async function listarArchivos(request, response) {
  const { equipo_id: idEquipo } = request.validated.query;
  const admin = esAdmin(request);
  if (idEquipo) {
    const equipo = await archivos.findEquipo(idEquipo);
    if (!equipo || (!admin && !equipo.activo)) throw new HttpError(404, "Equipo no encontrado");
  }
  response.json({ data: await archivos.findAll({ idEquipo, soloActivos: !admin }) });
}

async function servirArchivo(request, response, disposicion) {
  const { id } = request.validated.params;
  const fila = await archivos.findInternoById(id);
  if (!fila || (!esAdmin(request) && !fila.equipo_activo)) throw new HttpError(404, "Archivo no encontrado");

  const info = await infoArchivo(fila.ruta_archivo);
  if (!info) {
    console.warn(`[archivos] Integridad: la fila ${fila.id_archivo} no tiene bytes en el almacenamiento.`);
    throw new HttpError(404, "El archivo no está disponible en el almacenamiento");
  }
  if (info.tamano !== fila.tamano_bytes) {
    console.error(
      `[archivos] Integridad: la fila ${fila.id_archivo} declara ${fila.tamano_bytes} bytes y el disco tiene ${info.tamano}.`,
    );
    throw new HttpError(500, "El archivo almacenado no coincide con sus metadatos");
  }

  response.set({
    "Content-Type": fila.tipo_mime,
    "Content-Length": String(info.tamano),
    "Content-Disposition": contentDisposition(disposicion, fila.nombre_original),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
  });

  try {
    await pipeline(abrirLectura(info.ruta), response);
  } catch (error) {
    if (!response.headersSent) throw error;
    // El cliente cortó la descarga o falló la lectura a mitad: sólo se cierra la conexión.
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") console.error("[archivos] Error al transmitir:", error.message);
    response.destroy();
  }
}

// GET /api/archivos/:id/visualizar
export const visualizarArchivo = (request, response) => servirArchivo(request, response, "inline");

// GET /api/archivos/:id/descargar
export const descargarArchivo = (request, response) => servirArchivo(request, response, "attachment");

// DELETE /api/archivos/:id
export async function eliminarArchivo(request, response) {
  const { id } = request.validated.params;
  const fila = await archivos.findInternoById(id);
  if (!fila) throw new HttpError(404, "Archivo no encontrado");
  const borrado = await eliminarConCompensacion(fila.ruta_archivo, () => archivos.deleteArchivo(id));
  if (!borrado) throw new HttpError(404, "Archivo no encontrado");
  response.status(204).end();
}
