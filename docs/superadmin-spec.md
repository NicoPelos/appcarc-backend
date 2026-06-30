# Super Admin — Especificación

## Contexto y rol

Panel de administración global por encima de los clubes. Opera sobre todos los tenants de la plataforma. Por ahora un solo usuario (`superadmin`), pensado para escalar.

El `superadmin` vive en la misma colección `User` con `roles: ['superadmin']`. No pertenece a ningún club (`clubId: null`). Sus endpoints viven bajo `/api/super/...` y están protegidos por un middleware que verifica exclusivamente ese rol.

Un script de migración inicial (`scripts/seed-superadmin.js`) crea el primer usuario desde variables de entorno (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`).

---

## Modelo de datos nuevo: `Club`

```
_id
nombre            String
slug              String (único, ej: "carc")
logoUrl           String
contacto          { email, telefono, direccion }
plan              enum ['free', 'basico', 'premium']
modulos           { escuelita, muroLibre, exportSheets, novedades }  ← booleans
active            Boolean
creadoAt          Date
suspendidoAt      Date | null
```

Todos los modelos existentes ya tienen `clubId` — no hay cambio de schema. Se agrega esta colección como el "registro maestro" de cada tenant.

---

## Backend — Endpoints `/api/super/`

### Clubes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/super/clubs` | Listar todos los clubes con métricas básicas |
| POST | `/api/super/clubs` | Crear nuevo club |
| GET | `/api/super/clubs/:id` | Detalle de un club |
| PATCH | `/api/super/clubs/:id` | Editar nombre, contacto, plan, módulos |
| PATCH | `/api/super/clubs/:id/suspend` | Suspender / reactivar |

### Usuarios globales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/super/users` | Listar usuarios (filtrable por club, rol, estado) |
| POST | `/api/super/users` | Crear usuario admin para un club |
| PATCH | `/api/super/users/:id` | Editar rol, estado, club |
| DELETE | `/api/super/users/:id` | Desactivar usuario |
| POST | `/api/super/users/:id/reset-password` | Forzar reset de contraseña |

### Auditoría global

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/super/audit` | Audit log cross-club (mismos filtros que `/api/audit` + filtro por clubId) |

### Sistema

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/super/health` | Uptime, versión, estado de MongoDB, jobs activos |
| POST | `/api/super/jobs/:nombre/run` | Ejecutar un job manualmente (syncSheets, recordatorioCuotas) |

---

## Frontend — Stack

- **Repo separado**: `appcarc-superadmin`
- **Stack**: React + Vite + TailwindCSS
- **Auth**: mismo JWT del backend, el panel verifica `roles: ['superadmin']`
- **Deploy**: mismo Raspberry Pi, puerto distinto (ej: 3002), contenedor Docker propio

---

## Frontend — Pantallas

### Dashboard
- Cantidad de clubes activos / suspendidos
- Total de usuarios en el sistema
- Actividad reciente (últimas acciones del audit log global)

### Clubes
- Tabla con nombre, plan, módulos activos, socios, último acceso, estado
- Formulario crear/editar club
- Toggle suspender/reactivar
- Vista detalle: métricas del club (socios activos, cobros del mes, usuarios)

### Usuarios
- Vista de solo lectura cross-club: cuántos usuarios tiene cada club, último login global
- Reset de contraseña de emergencia (solo si el admin del club no puede hacerlo)
- No gestiona roles ni permisos de usuarios — eso es responsabilidad del admin del club

### Auditoría
- Tabla del audit log global con filtros: club, usuario, recurso, acción, fecha

### Sistema
- Uptime y versión desplegada
- Estado de MongoDB
- Botones para ejecutar jobs manualmente

---

## Arranque inicial (punto 0)

1. Agregar `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` al `.env`
2. Correr `node scripts/seed-superadmin.js` — crea el usuario si no existe, no hace nada si ya existe (idempotente)
3. Correr `node scripts/seed-clubs.js` — crea el registro `Club` para CARC con todos los módulos activos, usando los datos ya existentes en la BD

---

## Sistema de roles y permisos por club

### Principios de diseño

- Los roles son **por club** — cada club define los suyos
- Los permisos viven en la **base de datos** — configurables sin deploy
- El middleware `authorize()` deja de recibir roles hardcodeados y consulta la BD
- El super admin panel expone una matriz visual para editar permisos

### Modelo de datos: `Rol`

```
_id
clubId          String (ref Club)
nombre          String (ej: "palestrero")
permisos        [String] (ej: ["muroLibre:read", "muroLibre:write", "horarios:read"])
active          Boolean
```

### Modelo de datos: `Permiso` (catálogo global)

```
_id
recurso         String (ej: "muroLibre")
accion          String (ej: "read" | "write" | "delete")
descripcion     String (ej: "Ver registros de muro libre")
```

El catálogo de permisos disponibles está definido globalmente (en código o en BD). Cada club asigna subconjuntos de ese catálogo a sus roles.

### Catálogo de recursos y acciones

| Recurso | Acciones |
|---|---|
| `socios` | read, write, delete, restore |
| `cobros` | read, write, delete |
| `movimientos` | read, write, delete |
| `escuelita` | read, write, delete, checkin |
| `muroLibre` | read, write, delete, checkin |
| `horarios` | read, write, delete |
| `etiquetas` | read, write, delete |
| `precios` | read, write, delete |
| `suscripciones` | read, write, delete, close |
| `audit` | read, revert |
| `export` | sheets |
| `novedades` | read, write |

### Cómo funciona authorize() con permisos en BD

```
Request → protect() → authorize('muroLibre:write')
                          ↓
                  Lee roles del usuario (req.user.roles)
                          ↓
                  Busca en BD los permisos de esos roles para ese clubId
                          ↓
                  Verifica si alguno incluye 'muroLibre:write'
                          ↓
                  next() o 403
```

Los permisos del rol se cachean en el JWT o en memoria (Redis/in-process) para no ir a la BD en cada request.

### Separación de responsabilidades

| Quién | Gestiona | No puede |
|---|---|---|
| **Superadmin** | Plan del club, módulos habilitados, suspensión | Tocar usuarios ni roles de cada club |
| **Admin del club** | Usuarios de su club, roles y permisos de su club | Salirse de los módulos que el superadmin habilitó |

Los permisos disponibles para un club están **acotados por sus módulos activos**. Si el superadmin deshabilitó `escuelita` para un club, el admin de ese club no puede asignar permisos `escuelita:*` a ningún rol — esas opciones directamente no aparecen en su panel.

### Pantalla de permisos en el super admin panel

Matriz editable por club:

```
                socios          cobros      muroLibre    escuelita
                r  w  d  rest   r  w  d     r  w  d  ch  r  w  d  ch

admin           ✓  ✓  ✓  ✓     ✓  ✓  ✓     ✓  ✓  ✓  ✓   ✓  ✓  ✓  ✓
secretaria      ✓  ✓     ✓     ✓  ✓        ✓  ✓     ✓   ✓  ✓     ✓
palestrero                                  ✓  ✓  ✓  ✓
profesor                                                   ✓        ✓
socio           ✓                 ✓                  ✓
```

Click en celda → toggle inmediato → guarda en BD.

### Panel de administración del club (app existente, no super admin)

El admin de cada club tiene su propia sección dentro de la app actual (`/admin/...`):

| Pantalla | Descripción |
|---|---|
| Usuarios | Crear, editar, desactivar usuarios de su club |
| Roles | Crear roles, editar permisos (acotado a módulos habilitados por superadmin) |
| Mi club | Ver el plan activo y módulos disponibles (solo lectura — los gestiona el superadmin) |

Endpoints correspondientes en el backend bajo `/api/admin/...`, protegidos con `authorize('admin:roles')` o similar.

### Migración desde el sistema actual

Al implementar este sistema:
1. Crear colección `Rol` para CARC con los roles actuales y sus permisos equivalentes
2. Script `seed-roles.js` — genera los roles y permisos a partir de la matriz de permisos actual (hardcodeada hoy en las rutas)
3. Reemplazar `authorize('admin', 'secretaria')` por `authorize('socios:write')` en cada ruta
4. El middleware nuevo resuelve qué roles tienen ese permiso en ese club

### Lo que cambia en el backend

- Nuevo modelo `Rol`
- Nuevo middleware `authorizePermission('recurso:accion')`
- Endpoints en `/api/super/clubs/:id/roles` para CRUD de roles y permisos
- Cache de permisos por club (in-process, TTL corto) para no impactar performance

---

## Lo que queda fuera por ahora
- Billing / pagos
- Múltiples superadmins
- Logs de errores del servidor (eso sería un stack de observabilidad aparte)
