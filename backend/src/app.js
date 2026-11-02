import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { openapi } from "./docs/openapi.js";
import { sessionMiddleware } from "./middleware/session.js";
import { authRoutes } from "./routes/authRoutes.js";
import { equipoRoutes } from "./routes/equipoRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { HttpError } from "./utils/http.js";

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// Documentación de la API (no necesita sesión).
app.get("/api/openapi.json", (_request, response) => response.json(openapi));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "API Préstamos UAO" }));

// Estado del servicio. /health se mantiene por compatibilidad.
app.use(["/health", "/api/health"], healthRoutes);

app.use(sessionMiddleware);
app.use("/api/auth", authRoutes);
app.use("/api/equipos", equipoRoutes);

// Ruta inexistente
app.use((_request, _response, next) => next(new HttpError(404, "Ruta no encontrada")));

// Manejador global: todas las respuestas de error tienen la forma { error, detalles? }.
app.use((error, _request, response, _next) => {
  if (error instanceof HttpError) {
    return response
      .status(error.status)
      .json({ error: error.message, ...(error.detalles && { detalles: error.detalles }) });
  }
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ error: "El cuerpo de la petición no es JSON válido" });
  }
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "El cuerpo de la petición es demasiado grande" });
  }
  if (error.code === "ER_DUP_ENTRY") {
    return response.status(409).json({ error: "Ya existe un registro con esos datos únicos" });
  }
  if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
    return response.status(409).json({ error: "El registro tiene datos asociados y no se puede eliminar" });
  }

  console.error("Error en la API:", error);
  return response.status(500).json({ error: "Error interno del servidor" });
});
