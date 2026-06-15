# AppCARC Backend

Este README describe el backend de la aplicación Club Andino Río Cuarto.

## Estructura del backend

*   `src/index.js` - punto de entrada del servidor Express.
*   `src/appRoutes.js` - agrega los routers de cada recurso bajo `/api`.
*   `src/middleware/auth.js` - middleware de autenticación JWT y autorización por roles.
*   `src/resources/usuarios/` - auth, usuarios y roles.
*   `src/resources/socios/` - CRUD de socios y sincronización con Google Sheets.
*   `src/resources/movimientos/` - registro y consulta de movimientos de caja.
*   `src/resources/cobros/` - cobros de cuotas con impacto automático en caja.
*   `src/resources/cuotas/` - modelos de cuotas, pagos y catálogo de precios.
*   `src/resources/muroLibre/` - registro de asistencia y pagos de muro libre.
*   `src/resources/escuelita/` - listado de alumnos vinculados a socios.
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

## Movimientos de Caja

Rutas principales:

*   `GET /api/movimientos` - listar movimientos activos del club con paginación.
*   `POST /api/movimientos` - registrar un ingreso o egreso.

Los movimientos se aíslan por `clubId`, registran el usuario que los creó y requieren autenticación JWT. Actualmente pueden operar usuarios con rol `admin` o `secretary`.

Todo movimiento debe indicar `paymentMethod` con valor `Efectivo` o `Transferencia`, tanto para ingresos como para egresos.

## Cobros de Cuotas

Rutas principales:

*   `GET /api/cobros` - listar cobros registrados del club con paginación.
*   `POST /api/cobros` - registrar un cobro de cuotas.

`POST /api/cobros` es una operación de negocio: recibe uno o varios ítems de cuotas sociales y/o escuelita, valida socios del club, evita duplicados ya pagados, guarda snapshots de importes, crea las cuotas pagadas y genera un único movimiento de caja por el total cobrado.

El cobro también debe indicar `paymentMethod` con valor `Efectivo` o `Transferencia`; ese valor se copia al movimiento de caja y a las cuotas pagadas.

Ejemplo:

```json
{
  "responsable": "Secretaría CARC",
  "paymentMethod": "Efectivo",
  "items": [
    {
      "socioId": "ID_SOCIO",
      "tipo": "social",
      "periodo": "2026-06",
      "amount": 15000,
      "precioSugeridoSnapshot": 15000
    }
  ]
}
```

Para cobrar varias cuotas consecutivas, puede enviarse `cantidad` junto con `periodoDesde`:

```json
{
  "responsable": "Secretaría CARC",
  "paymentMethod": "Efectivo",
  "items": [
    {
      "socioId": "ID_SOCIO",
      "tipo": "social",
      "periodoDesde": "2026-06",
      "cantidad": 2
    }
  ]
}
```

Si no se envía `amount`, el backend busca el precio vigente (`cuota_social` o `cuota_escuelita`), multiplica por la cantidad de cuotas expandidas y genera el movimiento por el total. Cada cuota queda guardada con su propio snapshot.

## Precios

El modelo `Precios` funciona como catálogo económico por club. Debe registrar importes vigentes e históricos para:

*   `cuota_social`
*   `cuota_escuelita`
*   `hora_palestrero`
*   `hora_profesor`
*   `hora_secretaria`
*   `muro_libre_diario_socio`
*   `muro_libre_diario_no_socio`
*   `muro_libre_mensual_socio`
*   `muro_libre_mensual_no_socio`

Cada precio incluye `clubId`, `categoria`, `codigo`, `nombre`, `unidad`, `monto`, `moneda`, `vigenteDesde`, `vigenteHasta` y `active`. Estos valores se usan como sugerencias; los cobros y movimientos guardan snapshots del monto confirmado.

## Muro Libre

Rutas principales:

*   `GET /api/muro-libre` - listar registros de muro libre con paginación.
*   `POST /api/muro-libre` - registrar asistencia y, si corresponde, pago de muro libre.
*   `POST /api/muro-libre/checkin` - registrar presente en muro libre desde QR de socio o DNI.
*   `GET /api/socios/:id/qr` - generar token QR firmado para un socio.
*   `POST /api/socios/verify` - verificar socio por QR o DNI y devolver deuda/último registro.

Muro libre permite registrar personas socias y no socias. Para socios se usa `socioId`; para no socios se guardan datos básicos como nombre, apellido y DNI. Los pases pueden ser `diario` o `mensual`, con precios diferenciados para socio/no socio.

Si `estadoPago` es `pagado`, el backend crea un movimiento de caja de tipo `Ingreso`. Si el registro queda `pendiente` o `exento`, solo se guarda la asistencia.

## Escuelita

Rutas principales:

*   `GET /api/escuelita` - listar alumnos con paginación.
*   `POST /api/escuelita` - inscribir un socio como alumno.
*   `PUT /api/escuelita/:id` - actualizar estado, fecha u observaciones.
*   `DELETE /api/escuelita/:id` - dar de baja un alumno de escuelita.

Escuelita no duplica la ficha personal: cada alumno debe estar vinculado a un `socioId` activo del mismo club. El listado popula datos básicos del socio para mostrarlo como un listado similar al de socios.

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
4.  Para despliegues con Docker Compose y transacciones MongoDB, usa el archivo `docker-compose.yml` del repositorio. Este compose configura MongoDB como un replica set `rs0` de un solo nodo, lo que permite que operaciones como cobros y registros de muro libre sean atómicas.
3.  Coloca `google-credentials.json` en la raíz de `backend/`.

## Scripts

*   `npm run dev` - arranca backend con nodemon.
*   `npm start` - arranca backend en modo producción.
*   `npm test` - corre pruebas.
*   `npm run import-socios` - importa socios desde Google Sheets a MongoDB.

## Variables de entorno necesarias

Asegúrate de definir al menos:

```bash
MONGO_URI=<URL_DE_CONEXION_A_MONGODB>
PORT=3001
JWT_SECRET=<SECRETO_PARA_JWT>
GOOGLE_SHEETS_SOCIOS_ID=<ID_DE_TU_PLANILLA>
GOOGLE_SHEETS_SOCIOS_SHEET_NAME=Socios
DEFAULT_CLUB_ID=<CLUB_ID_POR_DEFECTO_PARA_IMPORT>
REDIS_URL=<URL_REDIS_OPCIONAL>
```

`JWT_SECRET` es indispensable para la autenticación JWT del login y la validación de tokens.

## Testing

Corre las pruebas unitarias e integración con:

```bash
npm test
```
