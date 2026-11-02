// Error con código HTTP. El manejador global de app.js lo convierte en { error, detalles? }.
export class HttpError extends Error {
  constructor(status, message, detalles) {
    super(message);
    this.status = status;
    this.detalles = detalles;
  }
}

// Envuelve controladores async para que cualquier error llegue al manejador global (Express 4).
export const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);
