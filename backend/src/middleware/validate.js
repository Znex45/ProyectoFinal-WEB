import { HttpError } from "../utils/http.js";

/**
 * Valida params, query y/o body contra esquemas Zod.
 * Los datos ya limpios (trim, coerción de tipos) quedan en request.validated.
 *
 *   router.post("/", validate({ body: equipoSchema }), controlador)
 */
export function validate(schemas) {
  return (request, _response, next) => {
    request.validated = request.validated ?? {};

    for (const part of ["params", "query", "body"]) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(request[part] ?? {});
      if (!result.success) {
        const detalles = result.error.issues.map((issue) => ({
          campo: issue.path.join(".") || part,
          mensaje: issue.message,
        }));
        return next(new HttpError(400, "Datos inválidos", detalles));
      }
      request.validated[part] = result.data;
    }

    next();
  };
}
