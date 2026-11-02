import * as equipos from "../repositories/equipoRepository.js";
import { HttpError } from "../utils/http.js";

async function validarCatalogos({ id_categoria, id_estado_equipo }) {
  const detalles = [];
  if (!(await equipos.categoriaExists(id_categoria))) {
    detalles.push({ campo: "id_categoria", mensaje: "La categoría seleccionada no existe" });
  }
  if (!(await equipos.estadoExists(id_estado_equipo))) {
    detalles.push({ campo: "id_estado_equipo", mensaje: "El estado seleccionado no existe" });
  }
  if (detalles.length) throw new HttpError(400, "Datos inválidos", detalles);
}

// GET /api/equipos — los administradores ven también los equipos inactivos.
export async function listarEquipos(request, response) {
  const soloActivos = request.session.user.rol !== "Administrador";
  response.json({ data: await equipos.findAll({ soloActivos }) });
}

// GET /api/equipos/catalogos
export async function obtenerCatalogos(_request, response) {
  response.json({ data: await equipos.findCatalogos() });
}

// GET /api/equipos/:id
export async function obtenerEquipo(request, response) {
  const equipo = await equipos.findById(request.validated.params.id);
  if (!equipo) throw new HttpError(404, "Equipo no encontrado");
  response.json({ data: equipo });
}

// POST /api/equipos
export async function crearEquipo(request, response) {
  const datos = request.validated.body;
  await validarCatalogos(datos);
  const id = await equipos.createEquipo(datos);
  response.status(201).location(`/api/equipos/${id}`).json({ data: await equipos.findById(id) });
}

// PUT /api/equipos/:id
export async function actualizarEquipo(request, response) {
  const { id } = request.validated.params;
  const datos = request.validated.body;
  if (!(await equipos.findById(id))) throw new HttpError(404, "Equipo no encontrado");
  await validarCatalogos(datos);
  await equipos.updateEquipo(id, datos);
  response.json({ data: await equipos.findById(id) });
}

// DELETE /api/equipos/:id
export async function eliminarEquipo(request, response) {
  const { id } = request.validated.params;
  if (await equipos.hasDependencias(id)) {
    throw new HttpError(409, "No se puede eliminar: el equipo tiene préstamos o archivos asociados");
  }
  if (!(await equipos.deleteEquipo(id))) throw new HttpError(404, "Equipo no encontrado");
  response.status(204).end();
}
