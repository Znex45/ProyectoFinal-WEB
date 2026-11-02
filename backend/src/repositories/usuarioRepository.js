import { pool } from "../config/database.js";

export async function existsByCodigoOrCorreo(codigo, correo) {
  const [rows] = await pool.execute(
    "SELECT id_usuario FROM usuario WHERE codigo = ? OR correo = ? LIMIT 1",
    [codigo, correo],
  );
  return rows.length > 0;
}

export async function findRolIdByName(nombreRol) {
  const [rows] = await pool.execute(
    "SELECT id_rol FROM rol WHERE nombre_rol = ? LIMIT 1",
    [nombreRol],
  );
  return rows[0]?.id_rol ?? null;
}

export async function createUsuario({ codigo, nombres, apellidos, correo, passwordHash, idRol }) {
  const [result] = await pool.execute(
    `INSERT INTO usuario (codigo, nombres, apellidos, correo, password_hash, id_rol)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [codigo, nombres, apellidos, correo, passwordHash, idRol],
  );
  return result.insertId;
}

export async function findActiveByCorreo(correo) {
  const [rows] = await pool.execute(
    `SELECT u.id_usuario, u.nombres, u.correo, u.password_hash, r.nombre_rol AS rol
     FROM usuario u
     JOIN rol r ON r.id_rol = u.id_rol
     WHERE u.correo = ? AND u.activo = 1
     LIMIT 1`,
    [correo],
  );
  return rows[0] ?? null;
}
