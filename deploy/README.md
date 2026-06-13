# Despliegue en Raspberry Pi 5 (con SSD)

Este directorio contiene los archivos necesarios para desplegar el backend en una Raspberry Pi 5 utilizando Docker Compose.

Requisitos en la Raspberry Pi:

- Raspberry Pi OS (64-bit) o Debian/Ubuntu arm64
- SSD montado en `/mnt/ssd` (o cambia la ruta según tu montaje)
- Docker y plugin `docker compose` instalados

Pasos resumidos:

1. Clona el repositorio en la Pi:

```bash
git clone git@github.com:NicoPelos/appcarc-backend.git
cd appcarc-backend
```

2. Ajusta `.env` con tus secretos (JWT, GOOGLE_CLIENT_ID, etc.)

3. Asegurate de tener el SSD montado, por ejemplo en `/mnt/ssd`.

4. Levantar los servicios de producción:

```bash
docker compose up -d --build
```

5. Para desarrollo local con solo Mongo y Mongo Express, usa:

```bash
cp .env.example .env
# ajusta .env con tus valores locales
mkdir -p data/mongo
docker compose -f docker-compose.dev.yml up -d
```

6. Ver logs del entorno de desarrollo:

```bash
docker compose -f docker-compose.dev.yml logs -f
```

MongoDB persistirá en `/mnt/ssd/mongo-data`. Los backups pueden guardarse en `/mnt/ssd/backups`.

----

Scripts útiles:

- `scripts/backup_mongo.sh` - hace `mongodump` a `/mnt/ssd/backups`

----

Notas de seguridad:

- Mantener SSH con llaves y firewall activo.
- Exponer puertos solo a través de reverse-proxy con TLS.
