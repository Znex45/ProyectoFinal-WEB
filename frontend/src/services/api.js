const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

// AuthContext registra aquí qué hacer cuando la API responde 401 (sesión vencida).
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(status, message, detalles = []) {
    super(message);
    this.status = status;
    this.detalles = detalles;
  }
}

/**
 * Cliente HTTP de la aplicación.
 * - Envía la cookie de sesión en cada petición.
 * - `body` se pasa como objeto: aquí se convierte a JSON (no usar JSON.stringify antes).
 * - Devuelve el contenido de `data` de la respuesta, o null si es 204.
 * - Lanza ApiError con el mensaje del servidor y los `detalles` de validación.
 */
export async function api(path, { method = "GET", body, headers = {}, signal } = {}) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      signal,
      headers: {
        Accept: "application/json",
        ...(body && !isFormData && { "Content-Type": "application/json" }),
        ...headers,
      },
      body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "No fue posible conectar con el servidor. Revisa que la API esté encendida.");
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const detalles = payload?.detalles ?? [];
    const message = detalles.length
      ? detalles.map((detalle) => detalle.mensaje).join(". ")
      : payload?.error || `Error del servidor (${response.status})`;

    if (response.status === 401 && onUnauthorized && !path.startsWith("/api/auth/")) {
      onUnauthorized();
    }
    throw new ApiError(response.status, message, detalles);
  }

  return payload?.data ?? null;
}

export function fetchHealth(options) {
  return api("/api/health", options);
}
