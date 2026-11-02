import { Router } from "express";
import {
  actualizarEquipo,
  crearEquipo,
  eliminarEquipo,
  listarEquipos,
  obtenerCatalogos,
  obtenerEquipo,
} from "../controllers/equipoController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { equipoSchema, idParamSchema } from "../schemas/equipoSchemas.js";
import { asyncHandler } from "../utils/http.js";

export const equipoRoutes = Router();

// Todas las rutas de inventario requieren sesión; las de escritura, rol Administrador.
equipoRoutes.use(requireAuth);

equipoRoutes.get("/", asyncHandler(listarEquipos));
equipoRoutes.get("/catalogos", asyncHandler(obtenerCatalogos));
equipoRoutes.get("/:id", validate({ params: idParamSchema }), asyncHandler(obtenerEquipo));
equipoRoutes.post("/", requireAdmin, validate({ body: equipoSchema }), asyncHandler(crearEquipo));
equipoRoutes.put(
  "/:id",
  requireAdmin,
  validate({ params: idParamSchema, body: equipoSchema }),
  asyncHandler(actualizarEquipo),
);
equipoRoutes.delete("/:id", requireAdmin, validate({ params: idParamSchema }), asyncHandler(eliminarEquipo));
