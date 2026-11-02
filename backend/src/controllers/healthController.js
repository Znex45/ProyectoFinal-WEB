import { checkDatabase } from "../repositories/healthRepository.js";

// GET /health y GET /api/health
export async function getHealth(_request, response) {
  try {
    if (!(await checkDatabase())) throw new Error("DB check failed");
    response.status(200).json({ data: { status: "ok", database: "connected" } });
  } catch {
    response.status(503).json({
      error: "Base de datos no disponible",
      data: { status: "unavailable", database: "disconnected" },
    });
  }
}
