import { Router } from "express";
import { actualizarEstado, crear, listar, obtener } from "../controllers/solicitudController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { solicitudEstadoSchema, solicitudIdSchema, solicitudSchema } from "../schemas/solicitudSchemas.js";
import { asyncHandler } from "../utils/http.js";

export const solicitudRoutes = Router();
solicitudRoutes.use(requireAuth);
solicitudRoutes.post("/", validate({ body: solicitudSchema }), asyncHandler(crear));
solicitudRoutes.get("/", asyncHandler(listar));
solicitudRoutes.get("/:id", validate({ params: solicitudIdSchema }), asyncHandler(obtener));
solicitudRoutes.patch(
  "/:id/estado",
  validate({ params: solicitudIdSchema, body: solicitudEstadoSchema }),
  (request, response, next) => {
    if (request.validated.body.estado === "Cancelada") return next();
    return requireAdmin(request, response, next);
  },
  asyncHandler(actualizarEstado),
);
