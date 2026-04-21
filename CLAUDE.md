# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev              # Start dev server on port 4005
pnpm build            # prisma generate + next build
pnpm start            # Start production server on port 4005
pnpm lint             # ESLint

# Docker
pnpm dev_docker       # docker compose up --build (port 4000)

# Database / Prisma
pnpm prisma:generate  # Regenerate Prisma client
pnpm prisma:studio    # Open Prisma Studio
pnpm prisma:pull      # Sync schema from existing DB
pnpm prisma:push      # Apply schema changes to DB
```

Package manager is **pnpm** (not npm/yarn). Build always requires `prisma generate` first (included in the `build` script).

## Architecture

**Security Suite** is a role-based access control (RBAC) management UI for RíoGas. It manages users, roles, applications, functionalities, actions, and permissions.

### Dual backend pattern

All API traffic flows through two distinct paths:

1. **`/api/[...proxy]`** — Dynamic catch-all that proxies to the external **GeneXus/Tomcat** backend at `BACKEND_BASE_URL`. Supports GET/POST/PUT/DELETE/PATCH. Used for auth, menu, and legacy permission operations.

2. **`/api/db/*`** — Direct **PostgreSQL** endpoints via Prisma. These bypass the GeneXus backend entirely and hit the DB at `192.168.2.117:5432/securitysuite`. Modules: `usuarios`, `roles`, `aplicaciones`, `funcionalidades`, `accesos`, `login`.

### Middleware permission system

`src/middleware.ts` intercepts every request before it reaches a page:
- Extracts JWT from cookies
- Generates a route permission code (SHA-256, `XXXX-XXXX` format using a salt `'s'`) via `src/lib/routeCode.ts`
- Calls `NEXT_PUBLIC_PERMISOS_API_URL` (proxied to GeneXus) to verify access
- Redirects unauthorized users to `/no-autorizado`

### Frontend structure

```
src/
├── app/
│   ├── api/[...proxy]/   # GeneXus proxy route
│   ├── api/db/           # Direct Prisma DB endpoints
│   ├── dashboard/        # Protected pages (usuarios, roles, aplicaciones, etc.)
│   ├── login/
│   └── middleware.ts     # Permission guard (root level)
├── components/           # Radix UI + custom components
├── hooks/                # useAuth, useUser, useApiCall, useAppLoading
├── services/api.ts       # All API wrapper functions (~1800 lines)
└── lib/                  # axios instance, prisma singleton, routeCode, LoadingProvider
```

### Key tech

- **Next.js 16** (App Router), **TypeScript 5.9**, **pnpm**
- **Prisma ORM** over PostgreSQL — schema at `prisma/schema.prisma`
- **Radix UI** + **Tailwind CSS** + **Framer Motion**
- **Axios** with custom interceptors (`src/lib/axios.ts`, `src/lib/loadingInterceptor.ts`)
- TLS verification disabled globally (`NODE_TLS_REJECT_UNAUTHORIZED=0`) due to self-signed certs on the GeneXus backend

### Database models (Prisma)

Core entities: `Aplicacion`, `Usuario`, `Rol`, `Funcionalidad`, `Accion`, `FuncionalidadAccion`, `Acceso`, `RolFuncionalidad`, `UsuarioRol`, `UsuarioPreferencia`. Role assignments use date ranges (`fecha_desde`/`fecha_hasta`). Active/inactive state tracked as `estado: 'A' | 'I'`.

## Deployment

| Mode | Port | Config |
|------|------|--------|
| Local dev | 4005 | `.env.local` |
| Docker | 4000 (→ 3000 inside) | `docker-compose.yml` + `BACKEND_BASE_URL` build arg |
| PM2 (production) | 3001 | `pm2.config.js` — app name `securitySuite` |

`DATABASE_URL` must be set at runtime (included in `pm2.config.js`). Production env template: `.env.production.example`.
