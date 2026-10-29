import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { sessionMiddleware } from "./middleware/session.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";

export const app = express();

app.use(cors({
  origin: env.frontendOrigin || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);
app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);

app.use((_request, response) => {
  response.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error, _request, response, _next) => {
  console.error("Error en la API:", error.message);
  response.status(500).json({ error: "Error interno del servidor" });
});
