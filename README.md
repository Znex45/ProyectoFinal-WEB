# Sistema Web de Gestión de Préstamos de Equipos Multimedia y Audiovisuales — UAO

Aplicación web para organizar el préstamo de cámaras, micrófonos, trípodes, luces y otros recursos de apoyo académico. La versión actual entrega la base técnica y visual: landing, formularios públicos maquetados, modelo MySQL e indicador de conexión del servicio. Los formularios y las operaciones de préstamo aún no persisten información.

## Arquitectura y tecnologías

- **Frontend:** React, Vite, React Router, JavaScript y CSS.
- **Backend:** Node.js, Express, `mysql2`, CORS y `dotenv`.
- **Base de datos:** MySQL 8, SQL explícito sin ORM.

El frontend consulta la API REST. `GET /health` ejecuta `SELECT 1` contra MySQL y responde con el estado de la conexión. El esquema y los catálogos están en `database/`; el diagrama E/R y las decisiones de migración están en `docs/`.

## Requisitos

- Node.js 20.19+ o 22.12+ (24 también funciona).
- npm.
- MySQL 8 para inicializar la base y consultar `/health`.

## Instalación y configuración

Desde la raíz del proyecto:

```bash
npm install
```

Crea localmente `backend/.env` con los datos de tu servidor MySQL:

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=prestamos_uao_web
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
```

Crea localmente `frontend/.env`:

```text
VITE_API_URL=http://localhost:3001
```

Ajusta estos valores a tu entorno. **NO SUBIR ARCHIVOS `.env` A GITHUB.** `.gitignore` ya los excluye.

## Base de datos

Con MySQL iniciado y `backend/.env` configurado, ejecuta:

```bash
npm run db:init
```

El comando crea la base indicada por `DB_NAME` si no existe, aplica `database/schema.sql` y carga `database/seed.sql`. Usa una base dedicada a esta aplicación. No crea cuentas ni contraseñas.

## Ejecución

Inicia frontend y backend juntos:

```bash
npm run dev
```

También puedes usar terminales separadas con `npm run backend` y `npm run frontend`. Vite informa la dirección local del frontend; el backend usa el puerto `3001` por defecto.

Rutas públicas: `/`, `/login` y `/registro`. Login y registro son formularios de demostración con validación del navegador; no envían datos ni crean cuentas.

## Comprobar la API

Con backend y MySQL disponibles, consulta:

```text
http://localhost:3001/health
```

Respuesta esperada: HTTP 200 con `{"status":"ok","database":"connected"}`. Si MySQL no está disponible, responde HTTP 503. La landing muestra el estado del servicio. También existe `npm run health:check`, que requiere configuración válida de base de datos.

## Alcance actual

El esquema contempla roles, usuarios, equipos, solicitudes, detalles y metadatos de archivos. En esta copia no están implementados la autenticación funcional, rutas privadas, CRUD, flujo de préstamos ni la subida y almacenamiento de archivos. Esas capacidades requieren desarrollo posterior.