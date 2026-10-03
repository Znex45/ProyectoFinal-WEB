import express from "express";
import cors from "cors";

export const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (_request, response) => {
  response.json({ status: "ok", message: "API de Préstamos UAO" });
});
app.use((_request, response) => {
  response.status(404).json({ error: "Ruta no encontrada" });
});