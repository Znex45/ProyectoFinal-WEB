# Sistema web de préstamos de equipos multimedia — UAO

## Estado Andy — base del proyecto

Esta etapa contiene la base de una aplicación web con React, Vite y Express. Incluye una landing pública adaptable, navegación de inicio y un servidor API básico. Todavía no incluye base de datos, autenticación, inventario ni solicitudes.

## Requisitos

- Node.js 20.19+ o 22.12+ (24 también funciona).
- npm.

## Instalación y ejecución

Desde la raíz del proyecto:

```bash
npm install
npm run dev
```

El frontend y el backend se ejecutan juntos. También pueden iniciarse por separado con `npm run frontend` y `npm run backend`. La landing está disponible en la dirección local que indique Vite; la API base usa el puerto 3001 y responde en `/`.

Para compilar el frontend:

```bash
npm run build
```

## Estructura

- `frontend/`: React, Vite, landing y estilos.
- `backend/`: servidor Express inicial.

Las siguientes etapas incorporarán el modelo de base de datos, la comprobación de conexión y las pantallas públicas de acceso y registro.

## Aporte de Sergio — modelo MySQL

Sobre la base de Andy se agregan el modelo de datos y su inicialización:

- `database/schema.sql`: tablas, relaciones y restricciones para roles, usuarios, categorías, equipos, solicitudes, detalles y metadatos de archivos.
- `database/seed.sql`: catálogos iniciales de roles, estados y categorías; no crea usuarios ni contraseñas.
- `database/init.js`: inicializador disponible mediante el nuevo comando `npm run db:init` en `package.json`.
- `docs/Modelo ER.uxf` y `docs/migracion-desde-escritorio.md`: diagrama y decisiones del modelo de datos.

### Inicialización de la base de datos

Con MySQL 8 iniciado, crea localmente `backend/.env` con los datos de tu instalación:

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=prestamos_uao_web
```

Usa una base nueva y dedicada al proyecto web. No subas `.env` ni credenciales a GitHub.

Desde la raíz del proyecto ejecuta:

```bash
npm run db:init
```

El comando crea la base si no existe, aplica el esquema y carga los catálogos. La aplicación conserva los comandos de ejecución anteriores. Esta etapa aún no implementa `/health`, autenticación, CRUD, préstamos ni subida de archivos desde la web.
