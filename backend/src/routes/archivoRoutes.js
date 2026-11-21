import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import {
  descargarArchivo,
  eliminarArchivo,
  listarArchivos,
  subirArchivo,
  visualizarArchivo,
} from "../controllers/archivoController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rutaExists } from "../repositories/archivoRepository.js";
import { archivoCamposSchema, archivoIdParamSchema, archivoListQuerySchema } from "../schemas/archivoSchemas.js";
import {
  MAX_FILE_BYTES,
  TMP_DIR,
  borrarTemporal,
  prepararAlmacenamiento,
  reconciliarAlmacenamiento,
} from "../services/archivoStorage.js";
import { HttpError, asyncHandler } from "../utils/http.js";

// Multer escribe en .tmp/ con un nombre aleatorio; el nombre del usuario nunca llega al disco.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, done) => prepararAlmacenamiento().then(() => done(null, TMP_DIR), done),
    filename: (_request, _file, done) => done(null, `${randomUUID()}.upload`),
  }),
  defParamCharset: "utf8", // nombres con tildes/ñ enviados por el navegador
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10, fieldSize: 8 * 1024, parts: 12 },
}).single("archivo");

const mensajesMulter = {
  LIMIT_FILE_SIZE: [413, `El archivo supera el máximo de ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MiB`],
  LIMIT_FILE_COUNT: [400, "Sólo se admite un archivo por petición"],
  LIMIT_UNEXPECTED_FILE: [400, "El archivo debe enviarse en el campo \"archivo\""],
  LIMIT_PART_COUNT: [400, "El formulario tiene demasiadas partes"],
  LIMIT_FIELD_COUNT: [400, "El formulario tiene demasiados campos"],
  LIMIT_FIELD_KEY: [400, "Nombre de campo demasiado largo"],
  LIMIT_FIELD_VALUE: [400, "Un campo de texto es demasiado largo"],
};

// Traduce los errores de Multer/Busboy al formato { error } de la API.
function recibirArchivo(request, response, next) {
  const declarado = Number(request.headers["content-length"]);
  if (declarado > MAX_FILE_BYTES + 64 * 1024) {
    // Se rechaza sin escribir nada; el resto del cuerpo se descarta y se cierra la conexión.
    response.set("Connection", "close");
    request.resume();
    return next(new HttpError(413, mensajesMulter.LIMIT_FILE_SIZE[1]));
  }
  upload(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const [status, mensaje] = mensajesMulter[error.code] ?? [400, "Formulario multipart inválido"];
      return next(new HttpError(status, mensaje));
    }
    if (/multipart|boundary|Unexpected end of form/i.test(error.message ?? "")) {
      return next(new HttpError(400, "Formulario multipart inválido"));
    }
    next(error); // fallo de disco u otro error interno → 500, sin fila en MySQL
  });
}

// Una reconciliación al primer uso del módulo repara cortes de proceso anteriores.
let reconciliacion = null;
function reconciliarUnaVez(_request, _response, next) {
  reconciliacion ??= reconciliarAlmacenamiento(rutaExists)
    .then((informe) => {
      if (Object.values(informe).some(Boolean)) console.log("[archivos] Reconciliación:", informe);
    })
    .catch((error) => console.error("[archivos] Reconciliación fallida:", error.message));
  next();
}

export const archivoRoutes = Router();

archivoRoutes.use(requireAuth, reconciliarUnaVez);

archivoRoutes.get("/", validate({ query: archivoListQuerySchema }), asyncHandler(listarArchivos));
archivoRoutes.get("/:id/visualizar", validate({ params: archivoIdParamSchema }), asyncHandler(visualizarArchivo));
archivoRoutes.get("/:id/descargar", validate({ params: archivoIdParamSchema }), asyncHandler(descargarArchivo));
archivoRoutes.post(
  "/",
  requireAdmin, // se comprueba antes de leer el cuerpo: un estudiante no llega a subir bytes
  recibirArchivo,
  validate({ body: archivoCamposSchema }),
  asyncHandler(subirArchivo),
);
archivoRoutes.delete("/:id", requireAdmin, validate({ params: archivoIdParamSchema }), asyncHandler(eliminarArchivo));

// Si algo falla después de recibir el archivo (validación, etc.), el temporal no queda en disco.
archivoRoutes.use((error, request, _response, next) => {
  borrarTemporal(request.file?.path).finally(() => next(error));
});
