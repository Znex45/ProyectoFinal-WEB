import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

// Única fuente de configuración del backend.
export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3001),
  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "prestamos.sid",
};

export const isProduction = env.nodeEnv === "production";

export function requireDatabaseConfig() {
  const missing = [
    ["DB_HOST", env.dbHost],
    ["DB_USER", env.dbUser],
    ["DB_PASSWORD", env.dbPassword],
    ["DB_NAME", env.dbName],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Faltan variables de base de datos: ${missing.join(", ")}`);
  }
}

export function requireSessionConfig() {
  if (!env.sessionSecret || env.sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres en backend/.env");
  }
}
