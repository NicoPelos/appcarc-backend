# AppCARC Backend

Este README describe el backend de la aplicación Club Andino Río Cuarto.

## Estructura del backend

*   `src/index.js` - punto de entrada del servidor Express.
*   `src/appRoutes.js` - agrega los routers de cada recurso bajo `/api`.
*   `src/middleware/auth.js` - middleware de autenticación JWT y autorización por roles.
*   `src/resources/usuarios/` - auth, usuarios y roles.
*   `src/resources/socios/` - CRUD de socios y sincronización con Google Sheets.
*   `src/services/googleSheetsService.js` - integración con la API de Google Sheets.
*   `src/services/tokenBlacklistService.js` - invalidación de tokens (Redis o memoria).

## Arquitectura

El backend está organizado por recursos (`resources`) y usa una arquitectura basada en funcionalidades:

*   `models/` - modelos Mongoose.
*   `handlers/` - lógica por endpoint.
*   `routes.js` - rutas de Express y OpenAPI docs.
*   `tests/unit/` - pruebas unitarias.
*   `tests/int/` - pruebas de integración.

## CRUD de Socios

Rutas principales:

*   `POST /api/socios` - crear socio.
*   `GET /api/socios` - listar socios activos del club.
*   `GET /api/socios/:id` - obtener socio por ID.
*   `PUT /api/socios/:id` - actualizar socio.
*   `DELETE /api/socios/:id` - desactivar socio.

## Roles

Roles actuales:

*   `admin` - acceso total.
*   `secretary` - CRUD de socios.
*   `viewer` - solo lectura.

## Setup

1.  Instala dependencias:
    ```bash
    cd backend
    npm install
    ```
2.  Configura `.env` con:
    ```bash
    MONGO_URI=<URL_DE_CONEXION_A_MONGODB>
    PORT=3001
    JWT_SECRET=<SECRETO_PARA_JWT>
    GOOGLE_SHEETS_SOCIOS_ID=<ID_DE_TU_PLANILLA>
    GOOGLE_SHEETS_SOCIOS_SHEET_NAME=Socios
    DEFAULT_CLUB_ID=<CLUB_ID_POR_DEFECTO_PARA_IMPORT>
    REDIS_URL=<URL_REDIS_OPCIONAL>
    ```
3.  Coloca `google-credentials.json` en la raíz de `backend/`.

## Scripts

*   `npm run dev` - arranca backend con nodemon.
*   `npm start` - arranca backend en modo producción.
*   `npm test` - corre pruebas.
*   `npm run import-socios` - importa socios desde Google Sheets a MongoDB.

## Testing

Corre las pruebas unitarias/finales con:

```bash
npm test
```
