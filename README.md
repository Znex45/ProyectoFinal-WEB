# Sistema Web de Gestión de Préstamos de Equipos Multimedia y Audiovisuales — UAO

Aplicación web para organizar el préstamo de cámaras, micrófonos, trípodes, luces y otros recursos de apoyo académico.

**Estado actual:** registro e inicio de sesión integrados con MySQL, sesiones en servidor, rutas públicas y privadas con redirección automática, cierre de sesión, e inventario de equipos (CRUD) con permisos por rol. Las solicitudes de préstamo y la carga de archivos están modeladas en la base, pero aún no tienen API.

## Arquitectura y tecnologías

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 19, Vite, React Router, JavaScript, CSS |
| Backend | Node.js, Express, `express-session`, `bcryptjs`, `zod`, `mysql2`, Swagger UI |
| Base de datos | MySQL 8, SQL explícito sin ORM |

```
backend/src/
├── app.js              Configuración de Express, rutas y manejador global de errores
├── server.js           Arranque del servidor
├── config/             Variables de entorno (env.js) y pool de MySQL (database.js)
├── middleware/         Sesión en MySQL, requireAuth/requireAdmin, validate (Zod)
├── schemas/            Esquemas de validación de entrada (auth, equipos)
├── routes/             Definición de endpoints
├── controllers/        Lógica de cada endpoint
├── repositories/       Consultas SQL (usuarios, equipos, salud)
├── docs/openapi.js     Especificación OpenAPI 3 (se ve en /api/docs)
└── utils/http.js       HttpError y asyncHandler

frontend/src/
├── services/api.js     Cliente HTTP (fetch con cookie, errores, manejo de 401)
├── context/            AuthContext: usuario, login, registro, logout
├── components/         Layout, ProtectedRoute y PublicOnlyRoute
└── pages/              Inicio, Login, Registro, Panel, Inventario, 404
```

## Requisitos

- Node.js 20.19+ o 22.12+ (24 también funciona) y npm.
- MySQL 8.

## Instalación y configuración

Desde la raíz del proyecto:

```bash
npm install
```

Crea `backend/.env` (puedes copiar `backend/.env.example`):

```text
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=prestamos_uao_web
FRONTEND_ORIGIN=http://localhost:5173
SESSION_SECRET=una_cadena_aleatoria_de_al_menos_32_caracteres
SESSION_COOKIE_NAME=prestamos.sid
NODE_ENV=development
```

Para generar `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Crea `frontend/.env`:

```text
VITE_API_URL=http://localhost:3001
```

> Abre el frontend en `http://localhost:5173` (no en `127.0.0.1`): la cookie de sesión sólo viaja si frontend y API usan el mismo host. **No subas archivos `.env` a GitHub**; `.gitignore` ya los excluye.

## Base de datos

```bash
npm run db:init
```

Crea la base `DB_NAME` si no existe, aplica `database/schema.sql` (tablas del dominio y tabla `sessions`) y carga los catálogos de `database/seed.sql` (roles, categorías y estados). No crea usuarios.

Los usuarios que se registran desde la web reciben el rol **Estudiante**. Para crear un administrador, regístrate y luego ejecuta:

```bash
npm run db:admin -- tu_correo@uao.edu.co
```

## Ejecución

```bash
npm run dev          # frontend (5173) y backend (3001) juntos
npm run backend      # sólo la API
npm run frontend     # sólo el cliente
npm run build        # compilación de producción del frontend
```

## Rutas del frontend

| Ruta | Tipo | Comportamiento |
| --- | --- | --- |
| `/` | Pública | Página de inicio; muestra el estado del servicio |
| `/login`, `/registro` | Sólo visitantes | Con sesión activa redirigen a `/dashboard` |
| `/dashboard` | Privada | Panel del usuario y botón de cerrar sesión |
| `/inventario` | Privada | Lista de equipos; los administradores pueden crear, editar y eliminar |
| `*` | Pública | Página 404 |

- Sin sesión, cualquier ruta privada redirige a `/login` y, tras iniciar sesión, vuelve a la página que se había pedido.
- Si la sesión vence mientras se usa la app (la API responde 401), el usuario se envía a `/login` con un aviso.
- **Salir** cierra la sesión en el servidor y siempre limpia la sesión en el cliente.

## API REST

Documentación interactiva (Swagger UI): **http://localhost:3001/api/docs** · Especificación OpenAPI: `GET /api/openapi.json`.

### Convenciones

- Cuerpos de petición y respuesta en JSON.
- Respuesta exitosa: `{ "data": ... }` (las de registro incluyen además `message`). `204 No Content` en logout y eliminación.
- Respuesta de error: `{ "error": "mensaje", "detalles": [{ "campo": "correo", "mensaje": "Correo electrónico inválido" }] }`. `detalles` sólo aparece en errores de validación.
- Autenticación por sesión: cookie `httpOnly` `prestamos.sid`. En el cliente se usa `fetch(url, { credentials: "include" })`.
- Toda entrada se valida con esquemas **Zod** (`backend/src/schemas/`) antes de llegar al controlador.

### Endpoints

| Método | Ruta | Acceso | Cuerpo | Respuestas |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Público | — | 200 `{ data: { status, database } }`, 503 |
| POST | `/api/auth/register` | Público | `codigo`, `nombres`, `apellidos`, `correo`, `password` (mín. 8) | 201 `{ data: { id_usuario } }`, 400, 409 |
| POST | `/api/auth/login` | Público | `correo`, `password` | 200 `{ data: { user } }` + cookie, 400, 401 |
| GET | `/api/auth/me` | Sesión | — | 200 `{ data: { user } }`, 401 |
| POST | `/api/auth/logout` | Público | — | 204 |
| GET | `/api/equipos` | Sesión | — | 200 `{ data: Equipo[] }`, 401 |
| GET | `/api/equipos/catalogos` | Sesión | — | 200 `{ data: { categorias, estados } }`, 401 |
| GET | `/api/equipos/:id` | Sesión | — | 200 `{ data: Equipo }`, 400, 401, 404 |
| POST | `/api/equipos` | Administrador | `EquipoEntrada` | 201 `{ data: Equipo }`, 400, 401, 403, 409 |
| PUT | `/api/equipos/:id` | Administrador | `EquipoEntrada` | 200 `{ data: Equipo }`, 400, 401, 403, 404, 409 |
| DELETE | `/api/equipos/:id` | Administrador | — | 204, 400, 401, 403, 404, 409 |

`/health` (sin `/api`) sigue respondiendo igual que `/api/health` por compatibilidad.

**EquipoEntrada**

| Campo | Tipo | Regla |
| --- | --- | --- |
| `codigo_interno` | string | Obligatorio, máx. 50, único |
| `nombre` | string | Obligatorio, máx. 100 |
| `marca`, `modelo` | string \| null | Opcional, máx. 100 |
| `descripcion` | string \| null | Opcional, máx. 2000 |
| `fecha_compra` | string \| null | Opcional, `AAAA-MM-DD` |
| `activo` | boolean | Opcional, por defecto `true` |
| `id_categoria`, `id_estado_equipo` | integer | Obligatorios; deben existir en los catálogos |

**Equipo** = `EquipoEntrada` + `id_equipo`, `nombre_categoria`, `nombre_estado`. Los estudiantes y docentes sólo ven equipos activos; los administradores ven todos.

### Ejemplo

```bash
# Iniciar sesión y guardar la cookie
curl -c cookie.txt -H "Content-Type: application/json" \
  -d '{"correo":"admin@uao.edu.co","password":"secreto123"}' \
  http://localhost:3001/api/auth/login

# Crear un equipo (requiere rol Administrador)
curl -b cookie.txt -H "Content-Type: application/json" \
  -d '{"codigo_interno":"CAM-001","nombre":"Cámara Sony A6400","id_categoria":1,"id_estado_equipo":1}' \
  http://localhost:3001/api/equipos
```

## Pruebas

```bash
npm run health:check   # comprueba la conexión con MySQL
npm run test:api       # 20 pruebas de extremo a extremo: registro, login, sesión, permisos, CRUD y logout
```

`test:api` usa la base configurada en `backend/.env`, crea un usuario y un equipo temporales y los elimina al terminar.

## Alcance pendiente

El esquema ya contempla solicitudes de préstamo (`solicitud_prestamo`, `detalle_solicitud`) y archivos (`archivo_multimedia`). Sus endpoints, el flujo de aprobación y la carga de archivos quedan para las siguientes entregas.
