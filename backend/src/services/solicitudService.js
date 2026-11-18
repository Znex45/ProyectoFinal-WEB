import { HttpError } from "../utils/http.js";
import {
  actualizarEstadoEquipos, actualizarEstadoSolicitud, bloquearEquipos, bloquearSolicitud,
  consultarEstados, consultarSolicitudes, conTransaccion, equiposConOtroPrestamo,
  idsDeEquipos, insertarSolicitud,
} from "../repositories/solicitudRepository.js";

const transiciones = {
  Pendiente: ["Aprobada", "Rechazada", "Cancelada"],
  Aprobada: ["En préstamo", "Cancelada"],
  "En préstamo": ["Finalizada"],
};

function estado(catalogo, nombre) {
  const id = catalogo.get(nombre);
  if (!id) throw new Error(`Falta el estado ${nombre} en el catálogo`);
  return id;
}

export function crearSolicitud(propietario, datos) {
  return conTransaccion(async (db) => {
    const catalogos = await consultarEstados(db);
    const equipos = await bloquearEquipos(db, datos.equipos);
    if (equipos.length !== datos.equipos.length || equipos.some((equipo) => !equipo.activo)) {
      throw new HttpError(400, "Todos los equipos deben existir y estar activos");
    }
    if (equipos.some((equipo) => equipo.id_estado_equipo === estado(catalogos.equipo, "Mantenimiento"))) {
      throw new HttpError(409, "Un equipo está en mantenimiento");
    }
    const id = await insertarSolicitud(db, propietario, datos, estado(catalogos.solicitud, "Pendiente"));
    const [solicitud] = await consultarSolicitudes({ id }, db);
    return solicitud;
  });
}

export function cambiarEstado(id, destino, usuario) {
  return conTransaccion(async (db) => {
    const solicitud = await bloquearSolicitud(db, id);
    if (!solicitud) throw new HttpError(404, "Solicitud no encontrada");
    if (usuario.rol !== "Administrador" && solicitud.id_usuario !== usuario.id_usuario) {
      throw new HttpError(403, "No tienes permisos para modificar esta solicitud");
    }

    const catalogos = await consultarEstados(db);
    const actual = [...catalogos.solicitud].find(([, valor]) => valor === solicitud.id_estado_solicitud)?.[0];
    if (!transiciones[actual]?.includes(destino)) {
      throw new HttpError(409, "Transición de estado no permitida");
    }

    const liberar = (actual === "Aprobada" && destino === "Cancelada") || destino === "Finalizada";
    if (liberar || destino === "Aprobada" || destino === "En préstamo") {
      const ids = await idsDeEquipos(db, id);
      const equipos = await bloquearEquipos(db, ids);
      if (!ids.length || equipos.length !== ids.length) {
        throw new HttpError(409, "La solicitud no tiene equipos válidos asociados");
      }
      const catalogo = catalogos.equipo;
      const disponibles = estado(catalogo, "Disponible");
      const reservados = estado(catalogo, "Reservado");
      const prestados = estado(catalogo, "Prestado");
      const ocupados = await equiposConOtroPrestamo(db, ids, id, [
        estado(catalogos.solicitud, "Aprobada"),
        estado(catalogos.solicitud, "En préstamo"),
      ]);

      if (liberar) {
        const esperado = actual === "Aprobada" ? reservados : prestados;
        const liberables = equipos
          .filter((equipo) => equipo.id_estado_equipo === esperado && !ocupados.has(equipo.id_equipo))
          .map(({ id_equipo }) => id_equipo);
        await actualizarEstadoEquipos(db, liberables, disponibles);
      } else {
        const esperado = destino === "Aprobada" ? disponibles : reservados;
        if (ocupados.size || equipos.some((equipo) => !equipo.activo || equipo.id_estado_equipo !== esperado)) {
          throw new HttpError(409, "Uno o más equipos no están disponibles para esta operación");
        }
        await actualizarEstadoEquipos(db, ids, destino === "Aprobada" ? reservados : prestados);
      }
    }

    await actualizarEstadoSolicitud(db, id, estado(catalogos.solicitud, destino));
    const [actualizada] = await consultarSolicitudes({ id }, db);
    return actualizada;
  });
}
