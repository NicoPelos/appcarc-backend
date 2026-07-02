# AppCARC Backend

Backend de la aplicación Club Andino Río Cuarto, consumido por una app móvil Expo.

## Estructura

```
src/
├── index.js                          # Entrada del servidor Express
├── appRoutes.js                      # Router principal bajo /api
├── middleware/auth.js                # JWT + autorización por rol
├── jobs/
│   ├── syncInstagram.job.js          # Cron: sync Instagram RSS (cada 30 min)
│   ├── recordatorioCuotas.job.js     # Cron: recordatorio deudas (1° de cada mes, 9am)
│   └── syncSheets.job.js             # Cron: exportación a Google Sheets (todos los días, 3am)
├── services/
│   ├── tokenBlacklistService.js      # Blacklist de tokens (Redis o memoria)
│   ├── googleSheetsService.js        # Integración Google Sheets (importación)
│   ├── sheetsExport.service.js       # Exportación a Google Sheets (panel autoridades)
│   ├── pushNotification.service.js   # Expo Push API
│   └── permisosCache.js              # Cache in-process de permisos por club (TTL 5 min)
└── resources/
    ├── usuarios/       # Auth, registro, cambio de contraseña, push token
    ├── socios/         # CRUD socios, QR, verificación, deuda, foto de perfil
    ├── cobros/         # Cobros de cuotas (batch), anulación
    ├── cuotas/         # Cuotas, cálculo de deuda y catálogo de precios
    ├── movimientos/    # Registro de caja
    ├── asistencias/    # Asistencias unificadas (muro libre + escuelita)
    ├── muroLibre/      # Registro y check-in de muro libre
    ├── horarios/       # Horas del personal, etiquetas y cálculo de deuda al staff
    ├── escuelita/      # Alumnos inscriptos + categorías vinculadas a precios
    ├── novedades/      # Canal de noticias + sync con Instagram RSS
    ├── roles/          # CRUD de roles y permisos por club
    ├── audit/          # Audit log: historial de cambios con revert
    └── export/         # Exportación de datos (Google Sheets)
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

# Google Sheets export — panel para autoridades (opcional)
CLUB_NAME=CARC
GOOGLE_SHEET_EXPORT_ID=<ID_del_sheet_generado_en_primer_export>
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
npm run seed-roles         # Sembrar roles iniciales para CARC (idempotente)
```

## Roles y permisos

Los usuarios pueden tener **más de un rol simultáneamente** (array `roles`). Los roles y sus permisos son **dinámicos por club** — se almacenan en la colección `Rol` de MongoDB y se gestionan desde la app.

La autorización usa permisos granulares en formato `recurso:accion` (ej: `socios:read`, `cobros:write`). Cada rol tiene un array de permisos. El middleware `authorize(permiso)` consulta la BD con cache in-process (TTL 5 min).

Roles predeterminados para CARC:

| Rol           | Acceso principal                                                                 |
|---------------|----------------------------------------------------------------------------------|
| `admin`       | Total — todos los permisos                                                       |
| `autoridad`   | Solo lectura: socios, cobros, movimientos, escuelita, asistencias, export/sheets |
| `secretaria`  | CRUD socios, cobros, asistencias, escuelita, suscripciones, novedades            |
| `profesor`    | Check-in y vista de alumnos de escuelita, horarios propios                       |
| `palestrero`  | CRUD muro libre + check-in, horarios del personal                                |
| `limpieza`    | Horarios del personal (registro de horas)                                        |
| `arreglos`    | Horarios del personal (registro de horas)                                        |
| `colaborador` | Check-in y vista de muro libre + escuelita                                       |
| `socio`       | Solo lectura de sus propios datos y QR. Es el rol por defecto.                   |

## Roles API

| Endpoint               | Descripción                                          |
|------------------------|------------------------------------------------------|
| `GET /api/roles`       | Listar roles del club (requiere `roles:read`)        |
| `POST /api/roles`      | Crear rol con permisos (requiere `roles:write`)      |
| `PUT /api/roles/:id`   | Actualizar nombre o permisos (requiere `roles:write`)|
| `DELETE /api/roles/:id`| Desactivar rol — soft delete (requiere `roles:delete`)|

Los permisos válidos están definidos en `src/constants/permisos.js` (44 permisos). Cualquier cambio de rol invalida el cache del club inmediatamente.

## Auth

| Endpoint                  | Descripción                                              |
|---------------------------|----------------------------------------------------------|
| `POST /api/auth/login`    | Email + contraseña. Rate limit: 10 intentos / 15 min    |
| `POST /api/auth/google`   | Login con Google ID Token                                |
| `POST /api/auth/register` | Crear usuario (solo admin). Vincula socioId automático   |
| `PUT /api/auth/password`  | Cambiar contraseña (requiere JWT)                        |
| `POST /api/auth/logout`   | Invalida el token (blacklist)                            |

El login devuelve `{ token, user, permisos, socio }`. `permisos` es el array de strings `recurso:accion` que el usuario puede usar — el front lo usa para saber qué mostrar. Si el usuario tiene `mustChangePassword: true`, la app debe redirigir al cambio de contraseña antes de continuar.

Cuando se cambia la contraseña, todos los tokens emitidos anteriormente quedan inválidos de inmediato.

**Creación automática de usuario**: al crear un socio con `correoElectronico` y `dni`, el sistema crea automáticamente un usuario con `roles: ['socio']`, contraseña = DNI y `mustChangePassword: true`.

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
| `PUT /api/muro-libre/:id`         | Editar registro (fecha, monto, formaPago, obs) |
| `DELETE /api/muro-libre/:id`      | Anular registro — soft delete + anula movimiento |

Todos los endpoints de escaneo aceptan `{ token }` (QR) o `{ dni }` en el body.

El pase mensual de muro libre se gestiona a través del sistema de Etiquetas/Suscripciones. Al hacer check-in mensual, el backend verifica que el socio tenga una cuota pagada vinculada a la etiqueta `muro_libre_mensual_socio` para el período actual.

## Escuelita

| Endpoint                              | Descripción                                      |
|---------------------------------------|--------------------------------------------------|
| `GET /api/escuelita`                  | Listar alumnos                                   |
| `POST /api/escuelita`                 | Inscribir alumno                                 |
| `PUT /api/escuelita/:id`              | Actualizar inscripción (incluye categoriaId)     |
| `DELETE /api/escuelita/:id`           | Dar de baja                                      |
| `POST /api/escuelita/checkin`         | Check-in por QR o DNI (valida cuota + frecuencia semanal) |
| `GET /api/escuelita/categorias`       | Listar categorías                                |
| `POST /api/escuelita/categorias`      | Crear categoría (solo admin)                     |
| `PUT /api/escuelita/categorias/:id`   | Actualizar categoría (solo admin)                |
| `DELETE /api/escuelita/categorias/:id`| Eliminar categoría — soft delete (solo admin)    |

Cada alumno tiene un `categoriaId` → `CategoriaEscuelita` con `frecuenciaSemanal` y `etiquetaId` para el precio. El checkin valida: cuota del mes pagada + límite de clases semanales según la categoría.

## Novedades

| Endpoint                    | Descripción                                        |
|-----------------------------|----------------------------------------------------|
| `GET /api/novedades`        | Listar novedades (filtros: `fuente`, `categoria`)  |
| `POST /api/novedades`       | Crear novedad manual (admin/secretary)             |
| `POST /api/novedades/sync`  | Forzar sync inmediato con Instagram RSS            |

El servidor sincroniza el feed de Instagram automáticamente cada 30 minutos si `INSTAGRAM_RSS_URL` está configurado. La sincronización es idempotente: no duplica posts ya importados. Cuando hay posts nuevos, se envía una push notification a todos los socios del club.

## Horarios

Registro de horas trabajadas por el staff. Cada tipo de tarea tiene una `Etiqueta` de precio asociada, lo que permite calcular cuánto le debe el club a cada persona.

| Endpoint                        | Descripción                                              |
|---------------------------------|----------------------------------------------------------|
| `GET /api/horarios`             | Listar (filtros: `nombre`, `tipoTarea`, `desde`, `hasta`, `trash`) |
| `POST /api/horarios`            | Registrar horario                                        |
| `PUT /api/horarios/:id`         | Actualizar horario                                       |
| `DELETE /api/horarios/:id`      | Eliminar horario (soft delete)                           |
| `GET /api/horarios/deuda`       | Deuda del club con el staff para un período (`?periodo=YYYY-MM`) |
| `GET /api/horarios/etiquetas`   | Listar tipos de tarea / nombres de staff                 |
| `POST /api/horarios/etiquetas`  | Crear tipo de tarea con precio o nombre de staff con socio |
| `DELETE /api/horarios/etiquetas/:id` | Eliminar etiqueta de horario                        |

El modelo `HorarioEtiqueta` gestiona dos catálogos: `tipo_tarea` (con `etiquetaId` de precio) y `nombre` (con `socioId` del staff). El cálculo de deuda cruza `totalHoras × precio/hora` para cada persona y tipo de tarea.

## Precios

Catálogo de precios vigentes del club, con historial por fecha.

| Endpoint               | Descripción                              |
|------------------------|------------------------------------------|
| `GET /api/precios`     | Listar precios (filtros: `categoria`, `codigo`, `trash`) |
| `POST /api/precios`    | Crear precio (solo admin)                |
| `PUT /api/precios/:id` | Actualizar precio (solo admin)           |
| `DELETE /api/precios/:id` | Eliminar precio — soft delete (solo admin) |

El código (`codigo`) puede ser cualquier string en minúsculas, números y guiones bajos (`[a-z0-9_]+`). Códigos base recomendados:

| Código | Descripción |
|--------|-------------|
| `cuota_social` | Cuota mensual del socio |
| `cuota_escuelita` | Cuota mensual de escuelita (precio base genérico) |
| `cuota_escuelita_<categoria>` | Precio específico por categoría (ej: `cuota_escuelita_ninos_2x`) |
| `muro_libre_diario_socio` / `muro_libre_diario_no_socio` | Entrada diaria al muro |
| `muro_libre_mensual_socio` / `muro_libre_mensual_no_socio` | Pase mensual al muro |
| `hora_palestrero` / `hora_profesor` / `hora_secretaria` | Horas de personal |

Cada precio tiene `vigenteDesde` / `vigenteHasta`. Los cobros guardan snapshots del monto al momento del pago. Para calcular deuda de escuelita, el sistema busca el precio por `CategoriaEscuelita.codigoPrecio`; si no tiene, usa `cuota_escuelita` como fallback.

## Push Notifications

El backend usa Expo Push API para enviar notificaciones a la app móvil. Los tokens se registran con `PUT /api/auth/push-token`.

Disparadores automáticos:
- **Actualización de socio**: cuando cambia `estado`, `correoElectronico`, `telefono` o `domicilioCompleto`
- **Cobro registrado**: confirmación al socio con detalle de cuotas pagadas
- **Novedades de Instagram**: cuando el sync detecta posts nuevos
- **Recordatorio mensual**: el 1° de cada mes a las 9am, a todos los socios con cuotas pendientes

## Export a Google Sheets

Panel de datos para autoridades del club que no usan la app.

| Endpoint                  | Descripción                               |
|---------------------------|-------------------------------------------|
| `POST /api/export/sheets` | Exportar datos al Google Sheet (admin, autoridad) |

El servidor también ejecuta la exportación automáticamente **todos los días a las 3am** si `GOOGLE_SHEET_EXPORT_ID` está configurado.

**Primera vez:**
1. Llamar a `POST /api/export/sheets`
2. El backend crea un nuevo Google Sheet y loguea en consola: `GOOGLE_SHEET_EXPORT_ID=1Bxi...`
3. Agregar ese ID al `.env`
4. Compartir el sheet manualmente desde Google Drive con las autoridades (solo lectura)

**Pestañas generadas:**

| Pestaña | Contenido |
|---------|-----------|
| Socios | Lista completa con estado y fecha de asociado |
| Cuotas Sociales | Matriz 24 meses: ✓ pagada (verde) / ✗ pendiente (rojo) + deuda estimada |
| Cuotas Escuelita | Igual que Cuotas Sociales, solo alumnos inscriptos |
| Cobros | Historial de pagos expandido por ítem |
| Escuelita | Alumnos con categoría y estado |
| Movimientos | Caja general |
| Horarios | Horas trabajadas por el personal |

## Audit Log

Registro de todas las operaciones de escritura (CREATE, UPDATE, DELETE) con snapshot antes/después.

| Endpoint                      | Descripción                                                    |
|-------------------------------|----------------------------------------------------------------|
| `GET /api/audit`              | Listar logs (admin, autoridad). Filtros: `resource`, `userId`, `action`, `from`, `to`, `page`, `limit` |
| `POST /api/audit/:id/revert`  | Revertir un cambio (solo admin). Restaura el estado `before`.  |

La reversión funciona así:
- **CREATE revertido** → soft-delete del documento creado
- **UPDATE revertido** → restaura el snapshot `before` del documento
- **DELETE revertido** → reactiva el documento con el snapshot `before`

Cada reversión queda registrada como un nuevo log de `UPDATE` en el audit.

## Testing

```bash
npm test
```

Los tests unitarios mockean modelos Mongoose y no requieren conexión a MongoDB.
