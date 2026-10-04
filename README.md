# Sistema web de préstamos de equipos multimedia — UAO

## Estado después de ELAM — conexión y comprobación de salud

Esta etapa parte del modelo MySQL incorporado por SERGIO. El backend usa variables de entorno, conecta con MySQL y ofrece `GET /health`. La landing consulta el endpoint y muestra si el servicio y la base están disponibles. Los formularios de acceso y registro se incorporarán en el siguiente avance; aquí todavía no hay autenticación ni CRUD.

## Instalación y configuración

Se requiere Node.js 20.19+ o 22.12+ y npm. Ejecuta `npm install` desde la raíz. Crea localmente `backend/.env`:

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

Ajusta los valores a tu entorno. NO SUBIR ARCHIVOS `.env` A GITHUB. Inicializa la base con `npm run db:init` y luego inicia ambos servicios con `npm run dev`.

## Comprobación

Con MySQL iniciado, `GET http://localhost:3001/health` debe responder HTTP 200 y `{"status":"ok","database":"connected"}`. Si MySQL no está disponible, responde HTTP 503. También puedes ejecutar `npm run health:check` con la configuración local completa.

El frontend muestra el estado de la consulta en la landing. El login, registro, inventario y solicitudes aún no son funcionales en esta etapa.