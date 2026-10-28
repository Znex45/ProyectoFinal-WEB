import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { sessionCookieName, sessionCookieOptions } from "../middleware/session.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trimmed = (value) => typeof value === "string" ? value.trim() : null;

export async function register(request, response) {
  const { password } = request.body ?? {};
  const codigo = trimmed(request.body?.codigo);
  const nombres = trimmed(request.body?.nombres);
  const apellidos = trimmed(request.body?.apellidos);
  const correo = trimmed(request.body?.correo)?.toLowerCase();

  if (
    typeof codigo !== "string" || !codigo || codigo.length > 50 ||
    typeof nombres !== "string" || !nombres || nombres.length > 100 ||
    typeof apellidos !== "string" || !apellidos || apellidos.length > 100 ||
    typeof correo !== "string" || correo.length > 190 || !emailPattern.test(correo) ||
    typeof password !== "string" || password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return response.status(400).json({ error: "Datos de registro inválidos" });
  }

  try {
    const [existing] = await pool.execute(
      "SELECT id_usuario FROM usuario WHERE codigo = ? OR correo = ? LIMIT 1",
      [codigo, correo],
    );
    if (existing.length) {
      return response.status(409).json({ error: "Código o correo ya registrado" });
    }

    const [roles] = await pool.execute(
      "SELECT id_rol FROM rol WHERE nombre_rol = 'Estudiante' LIMIT 1",
    );
    if (!roles.length) throw new Error("Falta el rol Estudiante en la base de datos");

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "INSERT INTO usuario (codigo, nombres, apellidos, correo, password_hash, id_rol) VALUES (?, ?, ?, ?, ?, ?)",
      [codigo, nombres, apellidos, correo, passwordHash, roles[0].id_rol],
    );
    return response.status(201).json({ message: "Usuario registrado", id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return response.status(409).json({ error: "Código o correo ya registrado" });
    }
    throw error;
  }
}

export async function login(request, response) {
  const correo = trimmed(request.body?.correo)?.toLowerCase();
  const password = request.body?.password;
  if (typeof correo !== "string" || !emailPattern.test(correo) || typeof password !== "string" || !password) {
    return response.status(400).json({ error: "Correo y contraseña requeridos" });
  }

  const [rows] = await pool.execute(
    "SELECT u.id_usuario, u.nombres, u.correo, u.password_hash, r.nombre_rol AS rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.correo = ? AND u.activo = 1 LIMIT 1",
    [correo],
  );
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    return response.status(401).json({ error: "Credenciales incorrectas" });
  }

  await new Promise((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()));
  request.session.user = {
    id_usuario: usuario.id_usuario,
    nombres: usuario.nombres,
    correo: usuario.correo,
    rol: usuario.rol,
  };
  await new Promise((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()));
  return response.json({ user: request.session.user });
}

export function me(request, response) {
  response.json({ user: request.session.user });
}

export async function logout(request, response) {
  await new Promise((resolve, reject) => request.session.destroy((error) => error ? reject(error) : resolve()));
  response.clearCookie(sessionCookieName, sessionCookieOptions);
  return response.json({ message: "Sesión cerrada" });
}
