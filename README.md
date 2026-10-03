# Sistema web de préstamos de equipos multimedia — UAO

## Estado después de SERGIO — modelo de datos

Esta etapa parte de la base React + Express de ANDY e incorpora la estructura MySQL para roles, usuarios, categorías, equipos, solicitudes, detalles y metadatos de archivos. Incluye catálogos de prueba y un inicializador. Aún no hay operaciones de inventario, autenticación ni solicitudes desde la web.

## Requisitos e instalación

Se requiere Node.js 20.19+ o 22.12+ y npm. Desde la raíz:

```bash
npm install
```

Crea localmente `backend/.env` con estas variables, usando los datos de tu instalación MySQL:

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=prestamos_uao_web
```

No subas archivos `.env` a GitHub.

Con MySQL iniciado, ejecuta:

```bash
npm run db:init
```

El comando crea la base si no existe, aplica el esquema y carga catálogos. Usa una base dedicada y vacía para este proyecto. No crea usuarios.

La aplicación web base se ejecuta con `npm run dev`; el frontend se abre en la URL local informada por Vite.