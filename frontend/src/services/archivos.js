import { api, ApiError } from "./api.js";

// Misma base que api.js: los binarios se piden con fetch directo (api() sólo maneja JSON).
const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;
export const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "application/pdf"];
export const ACCEPT_ARCHIVOS = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";

export const esImagen = (archivo) => archivo?.tipo_mime?.startsWith("image/");

/** Validación rápida en el navegador. El servidor vuelve a validar tamaño y firma real. */
export function validarArchivoLocal(archivo) {
  if (!archivo) return "Selecciona un archivo.";
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > MAX_ARCHIVO_BYTES) return "El archivo supera el máximo de 10 MiB.";
  const extensionValida = /\.(png|jpe?g|pdf)$/i.test(archivo.name);
  if (!TIPOS_PERMITIDOS.includes(archivo.type) && !extensionValida) {
    return "Sólo se permiten imágenes PNG o JPEG y documentos PDF.";
  }
  return null;
}

/** GET /api/archivos?equipo_id= → metadatos (sin rutas internas). */
export function listarArchivos(idEquipo, { signal } = {}) {
  return api(`/api/archivos?equipo_id=${encodeURIComponent(idEquipo)}`, { signal });
}

/** POST /api/archivos (multipart). Sólo administradores. */
export function subirArchivo({ idEquipo, archivo, descripcion = "", principal = false }, { signal } = {}) {
  const form = new FormData();
  form.append("id_equipo", String(idEquipo));
  if (descripcion.trim()) form.append("descripcion", descripcion.trim());
  form.append("principal", principal ? "true" : "false");
  form.append("archivo", archivo, archivo.name);
  return api("/api/archivos", { method: "POST", body: form, signal });
}

/** DELETE /api/archivos/:id. Sólo administradores. */
export function eliminarArchivo(idArchivo) {
  return api(`/api/archivos/${idArchivo}`, { method: "DELETE" });
}

/**
 * Descarga el binario con la cookie de sesión y devuelve un Blob.
 * modo: "visualizar" (inline) o "descargar" (attachment).
 * Lanza ApiError con status 401 si la sesión venció.
 */
export async function obtenerBlob(idArchivo, modo = "visualizar", { signal } = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/archivos/${idArchivo}/${modo}`, { credentials: "include", signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "No fue posible conectar con el servidor.");
  }
  if (!response.ok) {
    const tipo = response.headers.get("content-type") || "";
    const payload = tipo.includes("application/json") ? await response.json().catch(() => null) : null;
    const mensaje =
      response.status === 401
        ? "Tu sesión expiró. Inicia sesión de nuevo."
        : payload?.error || `No fue posible obtener el archivo (${response.status}).`;
    throw new ApiError(response.status, mensaje);
  }
  return response.blob();
}

/** Crea un object URL para el archivo. Quien lo use debe llamar a URL.revokeObjectURL(url). */
export async function crearObjectUrl(idArchivo, opciones) {
  return URL.createObjectURL(await obtenerBlob(idArchivo, "visualizar", opciones));
}

/** Descarga el archivo con su nombre original y libera el object URL. */
export async function descargarArchivo(archivo) {
  const url = URL.createObjectURL(await obtenerBlob(archivo.id_archivo, "descargar"));
  try {
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = archivo.nombre_original || `archivo-${archivo.id_archivo}`;
    enlace.rel = "noopener";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  } finally {
    // Se revoca en el siguiente ciclo para que el navegador alcance a iniciar la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
