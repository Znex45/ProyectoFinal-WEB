import { z } from "zod";

const idPositivo = z.number().int().positive().max(4_294_967_295);
const fecha = z.iso.date().refine((value) => value >= "1000-01-01", "Fecha fuera del rango de MySQL");

export const estadosSolicitud = [
  "Pendiente", "Aprobada", "Rechazada", "Cancelada", "En préstamo", "Finalizada",
];

export const solicitudIdSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number).pipe(idPositivo),
});

export const solicitudSchema = z.strictObject({
  fecha_inicio: fecha,
  fecha_fin: fecha,
  observacion: z.string().trim().max(2000).nullish().transform((value) => value || null),
  equipos: z.array(idPositivo).min(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "Los equipos no pueden repetirse",
  ),
}).refine(({ fecha_inicio, fecha_fin }) => fecha_fin >= fecha_inicio, {
  path: ["fecha_fin"],
  message: "La fecha final no puede ser anterior a la inicial",
});

export const solicitudEstadoSchema = z.strictObject({ estado: z.enum(estadosSolicitud) });
