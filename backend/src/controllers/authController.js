import bcrypt from "bcryptjs";
import { sessionCookieName, sessionCookieOptions } from "../middleware/session.js";
import {
  createUsuario,
  existsByCodigoOrCorreo,
  findActiveByCorreo,
  findRolIdByName,
} from "../repositories/usuarioRepository.js";
import { HttpError } from "../utils/http.js";

const ROL_POR_DEFECTO = "Estudiante";

const regenerarSesion = (request) =>
  new Promise((resolve, reject) => request.session.regenerate((error) => (error ? reject(error) : resolve())));
const guardarSesion = (request) =>
  new Promise((resolve, reject) => request.session.save((error) => (error ? reject(error) : resolve())));
const destruirSesion = (request) =>
  new Promise((resolve, reject) => request.session.destroy((error) => (error ? reject(error) : resolve())));

// POST /api/auth/register
export async function register(request, response) {
  const { codigo, nombres, apellidos, correo, password } = request.validated.body;

  if (await existsByCodigoOrCorreo(codigo, correo)) {
    throw new HttpError(409, "Código o correo ya registrado");
  }

  const idRol = await findRolIdByName(ROL_POR_DEFECTO);
  if (!idRol) throw new Error(`Falta el rol ${ROL_POR_DEFECTO} en la base de datos`);

  const passwordHash = await bcrypt.hash(password, 12);
  const idUsuario = await createUsuario({ codigo, nombres, apellidos, correo, passwordHash, idRol });

  response.status(201).json({ data: { id_usuario: idUsuario }, message: "Usuario registrado" });
}

// POST /api/auth/login
export async function login(request, response) {
  const { correo, password } = request.validated.body;
  const usuario = await findActiveByCorreo(correo);

  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    throw new HttpError(401, "Credenciales incorrectas");
  }

  // Nueva sesión para evitar fijación de sesión.
  await regenerarSesion(request);
  request.session.user = {
    id_usuario: usuario.id_usuario,
    nombres: usuario.nombres,
    correo: usuario.correo,
    rol: usuario.rol,
  };
  await guardarSesion(request);

  response.json({ data: { user: request.session.user } });
}

// GET /api/auth/me
export function me(request, response) {
  response.json({ data: { user: request.session.user } });
}

// POST /api/auth/logout — idempotente: funciona aunque la sesión ya haya vencido.
export async function logout(request, response) {
  if (request.session) await destruirSesion(request);
  response.clearCookie(sessionCookieName, sessionCookieOptions);
  response.status(204).end();
}
