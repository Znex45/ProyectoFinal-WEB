import { consultarSolicitudes } from "../repositories/solicitudRepository.js";
import { cambiarEstado, crearSolicitud } from "../services/solicitudService.js";
import { HttpError } from "../utils/http.js";

function filtroVisibilidad(usuario) {
  return usuario.rol === "Administrador" ? {} : { propietario: usuario.id_usuario };
}

export async function crear(request, response) {
  const data = await crearSolicitud(request.session.user.id_usuario, request.validated.body);
  response.status(201).json({ data });
}

export async function listar(request, response) {
  const data = await consultarSolicitudes(filtroVisibilidad(request.session.user));
  response.json({ data });
}

export async function obtener(request, response) {
  const { id } = request.validated.params;
  const [data] = await consultarSolicitudes({ id, ...filtroVisibilidad(request.session.user) });
  if (!data) throw new HttpError(404, "Solicitud no encontrada");
  response.json({ data });
}

export async function actualizarEstado(request, response) {
  const { id } = request.validated.params;
  const { estado } = request.validated.body;
  const data = await cambiarEstado(id, estado, request.session.user);
  response.json({ data });
}
