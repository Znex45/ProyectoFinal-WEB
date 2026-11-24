import { api } from "./api.js";

export const listarSolicitudes = (options) => api("/api/solicitudes", options);

export const crearSolicitud = (body, options) =>
  api("/api/solicitudes", { method: "POST", body, ...options });

export const obtenerSolicitud = (id, options) => api(`/api/solicitudes/${id}`, options);

export const cancelarSolicitud = (id, options) =>
  api(`/api/solicitudes/${id}/estado`, {
    method: "PATCH",
    body: { estado: "Cancelada" },
    ...options,
  });

export const actualizarEstadoSolicitud = (id, estado) =>
  api(`/api/solicitudes/${id}/estado`, { method: "PATCH", body: { estado } });
