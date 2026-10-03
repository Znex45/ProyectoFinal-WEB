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