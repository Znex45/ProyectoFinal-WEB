import { z } from "zod";

const idPositivo = (campo) =>
  z.coerce
    .number({ error: `${campo} debe ser un número` })
    .int(`${campo} debe ser un entero`)
    .positive(`${campo} es obligatorio`);

// Los campos multipart llegan como texto: "true"/"1"/"on" = verdadero; ausente/"" = falso.
const booleanoMultipart = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "on", "off", ""])], {
    error: "principal debe ser verdadero o falso",
  })
  .optional()
  .transform((value) => value === true || value === "true" || value === "1" || value === "on");

/** Campos de texto del formulario multipart de POST /api/archivos (el binario va en `archivo`). */
export const archivoCamposSchema = z.object({
  id_equipo: idPositivo("El equipo"),
  descripcion: z
    .string({ error: "La descripción debe ser texto" })
    .trim()
    .max(2000, "La descripción admite máximo 2000 caracteres")
    .nullish()
    .transform((value) => value || null),
  principal: booleanoMultipart,
});

export const archivoIdParamSchema = z.object({
  id: idPositivo("El id del archivo"),
});

export const archivoListQuerySchema = z.object({
  equipo_id: idPositivo("El equipo").optional(),
});
