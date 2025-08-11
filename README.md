# Security Suite (Frontend Next.js)

Frontend **Next.js** contenedizado con **Docker**. Todo el tráfico a backend **GeneXus/Tomcat** se hace vía **rewrites**: el frontend llama a `/api/*` y Next lo proxy-ea a `BACKEND_BASE_URL`.

---

## Requisitos

- Docker Desktop / Engine (Compose v2)
- (Opcional) Node 20+ y pnpm si querés correr local sin Docker

---

## Archivos clave

- `next.config.ts` → `output: "standalone"` + rewrites a `BACKEND_BASE_URL`
- `Dockerfile` → multi-stage con **pnpm** y healthcheck (incluye `wget`)
- `docker-compose.yml` → servicio `security-users`
- `.dockerignore` → reduce el build context
- `pnpm-lock.yaml` → **versionado** (necesario para builds reproducibles)

---

## Variables

**Build-time** (las evalúa Next al **construir** la imagen):

- `BACKEND_BASE_URL` → base del Tomcat/GeneXus, se pasa en `build.args` del compose

**Runtime** (ambiente del contenedor):

- `NEXT_PUBLIC_MENU_API_URL=/api/Menu`
- `NEXT_PUBLIC_PERMISOS_API_URL=/api/Permisos`
- `NODE_ENV=production`
- (Opcional) `SENTRY_DSN=...`

> `BACKEND_BASE_URL` se define en `docker-compose.yml → build.args`.

---

## Primer arranque (build + run)

```bash
docker compose up -d --build
docker logs -f security-users
# Navegar: http://localhost:3000


Actualizar con cambios

# Build incremental + recreate
docker compose up -d --build

Build limpio (sin caché):

docker compose --progress=plain build --no-cache
docker compose up -d

Parar / limpiar

docker compose down
# (opcional) limpiar imágenes huérfanas
docker image prune -f

Logs, shell, estado

docker ps
docker logs -f security-users
docker exec -it security-users sh

Healthcheck

El contenedor chequea GET /api/health. Si no existe, crealo:

// src/app/api/health/route.ts (App Router)
export async function GET() {
  return new Response("ok", { status: 200 });
}

Desarrollo local (sin Docker)

pnpm install
pnpm dev         # http://localhost:3000
pnpm build
pnpm start

    Si usás rewrites en local, asegurate de que BACKEND_BASE_URL exista (o dejá el fallback en next.config.ts).

Cambiar el backend (Tomcat/GeneXus)

Editá docker-compose.yml:

services:
  security-users:
    build:
      args:
        BACKEND_BASE_URL: "http://<host>:<puerto>/servicios/SecuritySuite"

Rebuild:

docker compose up -d --build

Escalar (opcional)

Para múltiples réplicas, quitá container_name del compose (Docker necesita nombres únicos) y luego:

docker compose up -d --scale security-users=3 --build

Poné un reverse proxy (Nginx/Traefik) delante para balanceo.
Sentry (opcional)

    Slug en next.config.ts: project: "security-suite".

    DSN por env en docker-compose.yml → environment: { SENTRY_DSN: ... }.

Comandos útiles

# Rebuild + levantar + logs
docker compose up -d --build && docker logs -f security-users

# Build con progreso detallado
docker compose --progress=plain build

# Reset duro del builder (borra caché)
docker builder prune -af

Windows (PowerShell) – limpiar dependencias pnpm:

Remove-Item -Recurse -Force node_modules
Remove-Item -Force pnpm-lock.yaml
pnpm install

Troubleshooting

1) Build context gigante

    Confirmá que .dockerignore esté en la raíz y no ignore archivos necesarios.

    El Dockerfile copia solo lo necesario (no usamos COPY . .). Si agregás carpetas nuevas para el build, sumalas explícitamente.

2) Falla de lockfile

    Asegurate de commitear pnpm-lock.yaml. El Dockerfile usa pnpm install --frozen-lockfile.

3) Header Authorization no llega al backend

    El rewrite de Next reenvía headers. Si agregás un proxy externo, pasá el header:

        Nginx: proxy_set_header Authorization $http_authorization;

4) CanceledError: canceled en navegación

    Axios cancela requests al abortar. Ignoralo en tus catch:

    if (axios.isCancel(err) || err?.code === "ERR_CANCELED") return;

5) Puerto 3000 ocupado

ports:
  - "8080:3000"

Estructura recomendada

/
├─ Dockerfile
├─ docker-compose.yml
├─ .dockerignore
├─ next.config.ts
├─ package.json
├─ pnpm-lock.yaml
├─ public/
├─ src/            # (y/o app/)
└─ README.md

Listo. Con esto: docker compose up -d --build y a rodar. 🚀