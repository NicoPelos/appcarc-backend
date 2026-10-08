# appCARC — mapa del proyecto (4 repos)

Sistema de gestión del Club Andino Río Cuarto (CARC). Multi-club: casi todo se filtra por `clubId`, aunque hoy en producción corre un solo club real (CARC) más un club demo que se resetea todas las noches.

Esta copia vive en `appcarc-backend/docs/CLAUDE-general.md` (versionada). El original sin versionar está en `/home/nicolas/Trabajos/appCARC/CLAUDE.md` — Claude Code lee los `CLAUDE.md` de carpetas superiores al abrir una sesión dentro de cualquiera de los 4 repos, así que ese aplica a los 4 sin tener que duplicarlo en cada uno.

| Repo | Qué es | Stack |
|---|---|---|
| appcarc-backend | API única para todo | Node 20, Express 5, Mongoose 9, MongoDB (Raspberry Pi), Docker, vitest |
| appCARC-mobile | App de socios y staff (+ PWA) | Expo SDK 56, React Native, Expo Router, TypeScript, jest |
| appCARC-web | Panel de staff para pantalla grande | React 19, TypeScript, Vite, Tailwind v4 |
| appcarc-superadmin | Panel del superadmin (clubes, roles, usuarios, audit) | React, JavaScript, Vite, Tailwind |

## Cómo se conectan

- El backend expone `/api/<recurso>`; las rutas se montan en `src/appRoutes.js` y cada recurso vive en `src/resources/<recurso>/`.
- Los 3 clientes usan el mismo login (JWT) y los mismos permisos por rol (strings tipo `inventario:read`).
- Cada cliente tiene su propia capa de API: mobile `src/api.ts`; web `src/api/<recurso>.ts`; superadmin `src/api/<recurso>.js`.
- Cambiaste un endpoint del backend → revisá y actualizá el/los cliente(s) que lo usan, y enlazá los issues entre repos si el cambio cruza repos.
- Producción corre en una Raspberry Pi, un solo `docker-compose.yml` (en `appcarc-backend/`) orquesta los 6 containers (backend, mongo, mongo-express, y los 3 frontends vía nginx detrás de un gateway común).

## Reglas

- Issues, commits y texto de UI en español.
- Nunca commitear `.env`, credenciales, tokens ni IPs/hostnames internos de producción como si fueran públicos.
- Antes de borrar código "sin uso": verificar con `grep` en todo el repo (knip/jscpd dan falsos positivos conocidos) y revisar `git log` del archivo — puede ser un entry point manual o un export usado desde otro camino.
- Preguntar antes de tocar migraciones, scripts `backfill-*`/`migrar-*`, o cualquier cosa que escriba directo en la base de producción.
- Builds pesados (`npm ci`, `vite build`, `gradle`) siempre corren en la PC, nunca dentro de un container en la Raspi — le pasó dos veces (a `appCARC-web` y después a `appcarc-superadmin`, el 07/10/2026) que un build ahí la dejó sin responder, con que reiniciarla físicamente. El backend es la única excepción razonable: su build (`npm ci --omit=dev`, sin bundler de frontend) es liviano.

## Comandos

- backend: `npx vitest run` (unit), `npm run test:integration` (necesita Mongo con `--replSet rs0`). No usar `npm test` a secas esperando modo watch — corre `vitest run`.
- mobile: `npm test` (jest), `npm run lint`, `npm run typecheck`.
- web / superadmin: `npm run lint`, `npm run build` (en web ya incluye el typecheck vía `tsc -b`).

## CI

Los 4 repos tienen `ci.yml` (lint/typecheck/build/tests en cada PR y push a `main`) además de los workflows nocturnos de revisión con Claude (`claude-nightly-review.yml`, y `claude-manual-review.yml` solo en backend, que mantiene el manual de usuario al día).

# Compact instructions
Al compactar, conservar: qué repo(s) y archivo(s) se tocaron, decisiones de diseño que tomó el usuario explícitamente, comandos que fallaron y por qué, y el estado de los issues de GitHub enlazados (abiertos/cerrados, en qué repo).
