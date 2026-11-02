import { z } from "zod";

const texto = (campo, max) =>
  z
    .string({ error: `${campo} es obligatorio` })
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(max, `${campo} admite máximo ${max} caracteres`);

const correo = z
  .string({ error: "El correo es obligatorio" })
  .trim()
  .toLowerCase()
  .max(190, "El correo admite máximo 190 caracteres")
  .pipe(z.email("Correo electrónico inválido"));

export const registerSchema = z.object({
  codigo: texto("El código", 50),
  nombres: texto("Nombres", 100),
  apellidos: texto("Apellidos", 100),
  correo,
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(8, "La contraseña debe tener mínimo 8 caracteres")
    // bcrypt sólo usa los primeros 72 bytes.
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "La contraseña es demasiado larga"),
});

export const loginSchema = z.object({
  correo,
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});
