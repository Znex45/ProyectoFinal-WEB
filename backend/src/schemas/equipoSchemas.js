import { z } from "zod";

const idPositivo = (campo) =>
  z.coerce
    .number({ error: `${campo} debe ser un número` })
    .int(`${campo} debe ser un entero`)
    .positive(`${campo} es obligatorio`);

// Texto opcional: "", null o ausente se guardan como NULL.
const textoOpcional = (campo, max) =>
  z
    .string({ error: `${campo} debe ser texto` })
    .trim()
    .max(max, `${campo} admite máximo ${max} caracteres`)
    .nullish()
    .transform((value) => value || null);

const fechaOpcional = z
  .union([
    z.literal(""),
    z.iso.date("La fecha de compra debe tener formato AAAA-MM-DD"),
  ])
  .nullish()
  .transform((value) => value || null);

export const equipoSchema = z.object({
  codigo_interno: z
    .string({ error: "El código interno es obligatorio" })
    .trim()
    .min(1, "El código interno es obligatorio")
    .max(50, "El código interno admite máximo 50 caracteres"),
  nombre: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(100, "El nombre admite máximo 100 caracteres"),
  marca: textoOpcional("La marca", 100),
  modelo: textoOpcional("El modelo", 100),
  descripcion: textoOpcional("La descripción", 2000),
  fecha_compra: fechaOpcional,
  activo: z.boolean({ error: "Activo debe ser verdadero o falso" }).default(true),
  id_categoria: idPositivo("La categoría"),
  id_estado_equipo: idPositivo("El estado"),
});

export const idParamSchema = z.object({
  id: idPositivo("El id del equipo"),
});
