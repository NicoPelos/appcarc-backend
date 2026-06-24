# AppCARC Backend

Backend de la aplicación Club Andino Río Cuarto, consumido por una app móvil Expo.

## Estructura

```
src/
├── index.js                        # Entrada del servidor Express
├── appRoutes.js                    # Router principal bajo /api
├── middleware/auth.js              # JWT + autorización por rol
├── jobs/syncInstagram.job.js         # Cron job de sync con Instagram (cada 30 min)
├── jobs/recordatorioCuotas.job.js    # Cron job de recordatorio de deudas (1° de cada mes)
├── services/
│   ├── tokenBlacklistService.js    # Blacklist de tokens (Redis o memoria)
│   └── googleSheetsService.js      # Integración Google Sheets
└── resources/
    ├── usuarios/       # Auth, registro, cambio de contraseña
    ├── socios/         # CRUD socios, QR, verificación, deuda
    ├── cobros/         # Cobros de cuotas (batch), anulación
    ├── cuotas/         # Modelo de cuotas y cálculo de deuda
    ├── movimientos/    # Registro de caja
    ├── asistencias/    # Asistencias unificadas (muro libre + escuelita)
    ├── muroLibre/      # Registro y check-in de muro libre
    ├── escuelita/      # Alumnos inscriptos
    ├── novedades/      # Canal de noticias + sync con Instagram RSS
    └── muroLibre/      # Registro y check-in de muro libre + gestión de horarios
```

## Setup

```bash
npm install
```

Crear `.env` con:

```bash
MONGO_URI=<URL_MONGODB>
PORT=3001
JWT_SECRET=<SECRETO_JWT>
DEFAULT_CLUB_ID=<ID_DEL_CLUB>
REDIS_URL=<URL_REDIS_OPCIONAL>

# Google OAuth
GOOGLE_CLIENT_ID=<CLIENT_ID>
GOOGLE_CLIENT_SECRET=<CLIENT_SECRET>
GOOGLE_REDIRECT_URI=<REDIRECT_URI>

# Google Sheets (importación histórica)
GOOGLE_SHEETS_SOCIOS_ID=<ID_PLANILLA>
GOOGLE_SHEETS_SOCIOS_SHEET_NAME=Socios

# Instagram RSS (opcional — sync de noticias)
INSTAGRAM_RSS_URL=<URL_DEL_FEED_RSS>

# Google Sheets — hojas adicionales (opcional)
GOOGLE_SHEETS_HORARIOS_SHEET_NAME=Horarios
GOOGLE_SHEETS_MOVIMIENTOS_SHEET_NAME=Movimientos
```

Colocar `google-credentials.json` en la raíz del proyecto.

Para transacciones MongoDB (cobros, muro libre, anulaciones) se requiere replica set:

```bash
docker-compose up -d
```

## Scripts

```bash
npm run dev            # Servidor con nodemon
npm start              # Servidor producción
npm test               # Suite de tests (Vitest)
npm run import-socios      # Importar socios desde Google Sheets
npm run import-cuotas      # Importar cuotas históricas desde Google Sheets
npm run import-horarios    # Importar horarios de trabajo desde Google Sheets
npm run import-movimientos # Importar movimientos históricos desde Google Sheets
npm run seed-admin         # Crear usuario admin inicial
```

## Roles

| Rol         | Acceso                                      |
|-------------|---------------------------------------------|
| `admin`     | Total                                       |
| `secretary` | CRUD socios, cobros, asistencias, novedades |
| `socio`     | Solo lectura de sus propios datos y QR      |

## Auth

| Endpoint                  | Descripción                                              |
|---------------------------|----------------------------------------------------------|
| `POST /api/auth/login`    | Email + contraseña. Rate limit: 10 intentos / 15 min    |
| `POST /api/auth/google`   | Login con Google ID Token                                |
| `POST /api/auth/register` | Crear usuario (solo admin). Vincula socioId automático   |
| `PUT /api/auth/password`  | Cambiar contraseña (requiere JWT)                        |
| `POST /api/auth/logout`   | Invalida el token (blacklist)                            |

El login devuelve `{ token, user, socio }`. Si el usuario tiene `mustChangePassword: true`, la app debe redirigir al cambio de contraseña antes de continuar.

Cuando se cambia la contraseña, todos los tokens emitidos anteriormente quedan inválidos de inmediato.

## Socios

| Endpoint                       | Descripción                                  |
|--------------------------------|----------------------------------------------|
| `GET /api/socios`              | Listar socios activos (paginado)             |
| `POST /api/socios`             | Crear socio                                  |
| `GET /api/socios/:id`          | Obtener socio                                |
| `PUT /api/socios/:id`          | Actualizar socio                             |
| `DELETE /api/socios/:id`       | Dar de baja (soft delete)                    |
| `GET /api/socios/:id/qr`       | Obtener token QR del socio (expira en 30 días) |
| `POST /api/socios/verify`      | Verificar socio por QR o DNI                 |
| `GET /api/socios/:id/deuda`    | Calcular deuda de cuotas social y escuelita  |

`POST /api/socios/verify` devuelve:
```json
{
  "socio": { "...datos" },
  "debtSummary": { "pendingCount": 2, "pendingAmount": 5000 },
  "lastMuroLibre": { "...última visita" },
  "paseMuroLibre": { "vigente": true, "periodo": "2026-06" }
}
```

## Cobros

| Endpoint                       | Descripción                               |
|--------------------------------|-------------------------------------------|
| `GET /api/cobros`              | Listar cobros (socios solo ven los suyos) |
| `POST /api/cobros`             | Registrar cobro batch                     |
| `POST /api/cobros/:id/anular`  | Anular cobro (soft delete + rollback)     |

`POST /api/cobros` es all-or-nothing: si alguna cuota del batch ya está pagada devuelve 409. El responsable se toma de `req.user.email` (no se envía en el body).

```json
{
  "paymentMethod": "Efectivo",
  "items": [
    { "socioId": "ID", "tipo": "social", "periodo": "2026-06" },
    { "socioId": "ID", "tipo": "escuelita", "periodoDesde": "2026-05", "cantidad": 2 }
  ]
}
```

Tipos válidos: `social`, `escuelita`, `muro_libre`.

## Asistencias

Colección unificada para muro libre y escuelita.

| Endpoint                          | Descripción                                   |
|-----------------------------------|-----------------------------------------------|
| `GET /api/asistencias`            | Listar (filtros: `tipo`, `socioId`, `from`, `to`, `categoria`) |
| `POST /api/asistencias/escuelita` | Registrar presente en escuelita               |
| `GET /api/muro-libre`             | Listar asistencias de muro libre              |
| `POST /api/muro-libre`            | Registrar asistencia/pago de muro libre       |
| `POST /api/muro-libre/checkin`    | Check-in por QR o DNI                         |

Todos los endpoints de escaneo aceptan `{ token }` (QR) o `{ dni }` en el body.

El pase mensual de muro libre se gestiona como una `Cuota` de tipo `muro_libre`. Al hacer check-in mensual, el backend verifica que el socio tenga esa cuota pagada para el período actual.

## Escuelita

| Endpoint                  | Descripción               |
|---------------------------|---------------------------|
| `GET /api/escuelita`      | Listar alumnos            |
| `POST /api/escuelita`     | Inscribir alumno          |
| `PUT /api/escuelita/:id`  | Actualizar inscripción    |
| `DELETE /api/escuelita/:id` | Dar de baja             |

## Novedades

| Endpoint                    | Descripción                                        |
|-----------------------------|----------------------------------------------------|
| `GET /api/novedades`        | Listar novedades (filtros: `fuente`, `categoria`)  |
| `POST /api/novedades`       | Crear novedad manual (admin/secretary)             |
| `POST /api/novedades/sync`  | Forzar sync inmediato con Instagram RSS            |

El servidor sincroniza el feed de Instagram automáticamente cada 30 minutos si `INSTAGRAM_RSS_URL` está configurado. La sincronización es idempotente: no duplica posts ya importados. Cuando hay posts nuevos, se envía una push notification a todos los socios del club.

## Horarios

Registro de horas trabajadas por el personal (palestrero, profesor, secretaria).

| Endpoint                  | Descripción                                              |
|---------------------------|----------------------------------------------------------|
| `GET /api/horarios`       | Listar (filtros: `nombre`, `tipoTarea`, `desde`, `hasta`, `trash`) |
| `POST /api/horarios`      | Registrar horario                                        |
| `PUT /api/horarios/:id`   | Actualizar horario                                       |
| `DELETE /api/horarios/:id`| Eliminar horario (soft delete)                           |

## Precios

El modelo `Precios` es el catálogo económico del club. Códigos usados:

- `cuota_social`
- `cuota_escuelita`
- `muro_libre_diario_socio` / `muro_libre_diario_no_socio`
- `muro_libre_mensual_socio` / `muro_libre_mensual_no_socio`

Cada precio tiene `vigenteDesde` / `vigenteHasta`. Los cobros guardan snapshots del monto al momento del pago.

## Push Notifications

El backend usa Expo Push API para enviar notificaciones a la app móvil. Los tokens se registran con `PUT /api/auth/push-token`.

Disparadores automáticos:
- **Actualización de socio**: cuando cambia `estado`, `correoElectronico`, `telefono` o `domicilioCompleto`
- **Cobro registrado**: confirmación al socio con detalle de cuotas pagadas
- **Novedades de Instagram**: cuando el sync detecta posts nuevos
- **Recordatorio mensual**: el 1° de cada mes a las 9am, a todos los socios con cuotas pendientes

## Testing

```bash
npm test
```

Los tests unitarios mockean modelos Mongoose y no requieren conexión a MongoDB.
