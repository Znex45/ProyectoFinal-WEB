// Especificación OpenAPI 3.0 de la API. Se sirve en /api/openapi.json y se visualiza en /api/docs.

const json = (schema) => ({ "application/json": { schema } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const dataOf = (schema) => ({
  type: "object",
  required: ["data"],
  properties: { data: schema },
});
const errorResponse = (description) => ({ description, content: json(ref("Error")) });

const err = {
  400: errorResponse("Datos inválidos (incluye `detalles` por campo)"),
  401: errorResponse("No hay sesión iniciada"),
  403: errorResponse("El usuario no tiene rol Administrador"),
  404: errorResponse("Recurso no encontrado"),
  409: errorResponse("Conflicto con datos existentes"),
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
  description: "id_equipo",
};

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "API Préstamos UAO",
    version: "1.0.0",
    description: [
      "API REST del sistema de préstamos de equipos multimedia.",
      "",
      "**Autenticación:** sesión en servidor con cookie `httpOnly` (`prestamos.sid`). " +
        "Inicia sesión con `POST /api/auth/login`; el navegador envía la cookie automáticamente " +
        "(en el cliente: `fetch(..., { credentials: \"include\" })`).",
      "",
      "**Formato:** las respuestas exitosas tienen la forma `{ \"data\": ... }`; " +
        "los errores, `{ \"error\": \"mensaje\", \"detalles\"?: [{ \"campo\", \"mensaje\" }] }`.",
    ].join("\n"),
  },
  servers: [{ url: "http://localhost:3001" }],
  tags: [
    { name: "Estado", description: "Salud del servicio" },
    { name: "Autenticación", description: "Registro, inicio y cierre de sesión" },
    { name: "Equipos", description: "Inventario de equipos (requiere sesión)" },
  ],
  components: {
    securitySchemes: {
      cookieSesion: { type: "apiKey", in: "cookie", name: "prestamos.sid" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Datos inválidos" },
          detalles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                campo: { type: "string", example: "correo" },
                mensaje: { type: "string", example: "Correo electrónico inválido" },
              },
            },
          },
        },
      },
      Usuario: {
        type: "object",
        properties: {
          id_usuario: { type: "integer", example: 1 },
          nombres: { type: "string", example: "Ana" },
          correo: { type: "string", format: "email", example: "ana@uao.edu.co" },
          rol: { type: "string", enum: ["Estudiante", "Docente", "Administrador"] },
        },
      },
      RegistroEntrada: {
        type: "object",
        required: ["codigo", "nombres", "apellidos", "correo", "password"],
        properties: {
          codigo: { type: "string", maxLength: 50, example: "2215001" },
          nombres: { type: "string", maxLength: 100, example: "Ana" },
          apellidos: { type: "string", maxLength: 100, example: "Ruiz" },
          correo: { type: "string", format: "email", maxLength: 190, example: "ana@uao.edu.co" },
          password: { type: "string", minLength: 8, description: "Máximo 72 bytes", example: "secreto123" },
        },
      },
      LoginEntrada: {
        type: "object",
        required: ["correo", "password"],
        properties: {
          correo: { type: "string", format: "email", example: "ana@uao.edu.co" },
          password: { type: "string", example: "secreto123" },
        },
      },
      EquipoEntrada: {
        type: "object",
        required: ["codigo_interno", "nombre", "id_categoria", "id_estado_equipo"],
        properties: {
          codigo_interno: { type: "string", maxLength: 50, example: "CAM-001" },
          nombre: { type: "string", maxLength: 100, example: "Cámara Sony A6400" },
          marca: { type: "string", maxLength: 100, nullable: true, example: "Sony" },
          modelo: { type: "string", maxLength: 100, nullable: true, example: "A6400" },
          descripcion: { type: "string", maxLength: 2000, nullable: true },
          fecha_compra: { type: "string", format: "date", nullable: true, example: "2025-03-14" },
          activo: { type: "boolean", default: true },
          id_categoria: { type: "integer", minimum: 1, example: 1 },
          id_estado_equipo: { type: "integer", minimum: 1, example: 1 },
        },
      },
      Equipo: {
        allOf: [
          ref("EquipoEntrada"),
          {
            type: "object",
            properties: {
              id_equipo: { type: "integer", example: 1 },
              nombre_categoria: { type: "string", example: "Cámaras" },
              nombre_estado: { type: "string", example: "Disponible" },
            },
          },
        ],
      },
      Catalogos: {
        type: "object",
        properties: {
          categorias: {
            type: "array",
            items: {
              type: "object",
              properties: { id_categoria: { type: "integer" }, nombre_categoria: { type: "string" } },
            },
          },
          estados: {
            type: "array",
            items: {
              type: "object",
              properties: { id_estado_equipo: { type: "integer" }, nombre_estado: { type: "string" } },
            },
          },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Estado"],
        summary: "Comprueba la API y la conexión con MySQL",
        responses: {
          200: {
            description: "Servicio y base de datos disponibles",
            content: json(
              dataOf({
                type: "object",
                properties: {
                  status: { type: "string", example: "ok" },
                  database: { type: "string", example: "connected" },
                },
              }),
            ),
          },
          503: errorResponse("La base de datos no responde"),
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Autenticación"],
        summary: "Registra un usuario con rol Estudiante",
        requestBody: { required: true, content: json(ref("RegistroEntrada")) },
        responses: {
          201: {
            description: "Usuario creado",
            content: json({
              type: "object",
              properties: {
                data: { type: "object", properties: { id_usuario: { type: "integer" } } },
                message: { type: "string", example: "Usuario registrado" },
              },
            }),
          },
          400: err[400],
          409: errorResponse("Código o correo ya registrado"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Autenticación"],
        summary: "Inicia sesión y crea la cookie de sesión",
        requestBody: { required: true, content: json(ref("LoginEntrada")) },
        responses: {
          200: {
            description: "Sesión iniciada; responde con Set-Cookie",
            content: json(dataOf({ type: "object", properties: { user: ref("Usuario") } })),
          },
          400: err[400],
          401: errorResponse("Credenciales incorrectas"),
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Autenticación"],
        summary: "Devuelve el usuario de la sesión actual",
        security: [{ cookieSesion: [] }],
        responses: {
          200: {
            description: "Usuario autenticado",
            content: json(dataOf({ type: "object", properties: { user: ref("Usuario") } })),
          },
          401: err[401],
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Autenticación"],
        summary: "Cierra la sesión (idempotente)",
        responses: { 204: { description: "Sesión cerrada y cookie eliminada" } },
      },
    },
    "/api/equipos": {
      get: {
        tags: ["Equipos"],
        summary: "Lista los equipos (los administradores también ven los inactivos)",
        security: [{ cookieSesion: [] }],
        responses: {
          200: { description: "Lista de equipos", content: json(dataOf({ type: "array", items: ref("Equipo") })) },
          401: err[401],
        },
      },
      post: {
        tags: ["Equipos"],
        summary: "Crea un equipo (Administrador)",
        security: [{ cookieSesion: [] }],
        requestBody: { required: true, content: json(ref("EquipoEntrada")) },
        responses: {
          201: { description: "Equipo creado", content: json(dataOf(ref("Equipo"))) },
          400: err[400],
          401: err[401],
          403: err[403],
          409: errorResponse("Ya existe un equipo con ese código interno"),
        },
      },
    },
    "/api/equipos/catalogos": {
      get: {
        tags: ["Equipos"],
        summary: "Categorías y estados disponibles para los formularios",
        security: [{ cookieSesion: [] }],
        responses: {
          200: { description: "Catálogos", content: json(dataOf(ref("Catalogos"))) },
          401: err[401],
        },
      },
    },
    "/api/equipos/{id}": {
      parameters: [idParam],
      get: {
        tags: ["Equipos"],
        summary: "Obtiene un equipo",
        security: [{ cookieSesion: [] }],
        responses: {
          200: { description: "Equipo", content: json(dataOf(ref("Equipo"))) },
          400: err[400],
          401: err[401],
          404: err[404],
        },
      },
      put: {
        tags: ["Equipos"],
        summary: "Reemplaza los datos de un equipo (Administrador)",
        security: [{ cookieSesion: [] }],
        requestBody: { required: true, content: json(ref("EquipoEntrada")) },
        responses: {
          200: { description: "Equipo actualizado", content: json(dataOf(ref("Equipo"))) },
          400: err[400],
          401: err[401],
          403: err[403],
          404: err[404],
          409: errorResponse("Ya existe un equipo con ese código interno"),
        },
      },
      delete: {
        tags: ["Equipos"],
        summary: "Elimina un equipo sin préstamos ni archivos asociados (Administrador)",
        security: [{ cookieSesion: [] }],
        responses: {
          204: { description: "Equipo eliminado" },
          400: err[400],
          401: err[401],
          403: err[403],
          404: err[404],
          409: errorResponse("El equipo tiene préstamos o archivos asociados"),
        },
      },
    },
  },
};
