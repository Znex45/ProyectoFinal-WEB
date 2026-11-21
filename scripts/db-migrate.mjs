// Aplica, en orden alfabético, los .sql de database/migrations sobre la base de backend/.env.
// Las migraciones deben ser idempotentes.  Uso: node scripts/db-migrate.mjs
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, "backend/.env") });
for (const key of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
  if (!process.env[key]) throw new Error(`Falta ${key} en backend/.env`);
}

const dir = path.join(root, "database/migrations");
const archivos = (await fs.readdir(dir)).filter((nombre) => nombre.endsWith(".sql")).sort();

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

try {
  for (const nombre of archivos) {
    await connection.query(await fs.readFile(path.join(dir, nombre), "utf8"));
    console.log(`✓ ${nombre}`);
  }
  console.log(`${archivos.length} migración(es) aplicada(s) en ${process.env.DB_NAME}.`);
} finally {
  await connection.end();
}
