
import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { sessionMiddleware } from "./middleware/session.js";

import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { equipoRoutes } from "./routes/equipoRoutes.js";

export const app = express();

// Configuracion de CORS
app.use(
  cors({
    origin: env.frontendOrigin || "http://localhost:5173",
    credentials: true,
  })
);

// Middleware para procesar JSON
app.use(express.json());

// Middleware de sesiones
app.use(sessionMiddleware);

// Rutas existentes
app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);

// Rutas del modulo de inventario - Elam
app.use("/api/equipos", equipoRoutes);

// Manejo de rutas inexistentes
app.use((_request, response) => {
  response.status(404).json({
    error: "Ruta no encontrada",
  });
});

// Manejo general de errores
app.use((error, _request, response, _next) => {
  console.error("Error en la API:", error.message);

  response.status(500).json({
    error: "Error interno del servidor",
  });
});
