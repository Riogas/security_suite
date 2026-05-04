# Orchestrator Report — 20260430-205200-r4t

## Auditoría completa de reads — Security Suite

### Inventario de pantallas/paneles auditados (12 total)

| Pantalla | Componente | Read API | Estado |
|----------|-----------|----------|--------|
| Usuarios — locales/todos | Usuarios.tsx | apiUsuariosDB → /api/db/usuarios | PRISMA OK |
| Usuarios — sin importar | Usuarios.tsx | apiUsuarios → /usuarios (GeneXus) | INTENCIONAL (lista SGM externo) |
| Roles listado | Roles.tsx | apiRolesDB → /api/db/roles | PRISMA OK |
| Aplicaciones listado | aplicaciones.tsx | apiAplicacionesDB → /api/db/aplicaciones | PRISMA OK |
| Funcionalidades listado | Funcionalidades.tsx | apiFuncionalidadesDB → /api/db/funcionalidades | PRISMA OK |
| Objetos listado | Objetos.tsx | apiObjetosDB → /api/db/objetos | PRISMA OK |
| Permisos/Accesos | Permisos.tsx | apiAccesosDB → /api/db/accesos | PRISMA OK |
| Eventos | Eventos.tsx | apiEventos → /eventos (GeneXus) | GAP — sin endpoint Prisma |
| Editar Usuario | UsuarioForm.tsx | apiUsuarioDBById → /api/db/usuarios/{id} | PRISMA OK |
| **Editar Rol (carga inicial)** | **EditRoleForm.tsx** | ~~apiObtenerRol~~ → **apiRolDBById** | **MIGRADO** |
| Editar Aplicación | AplicacionForm.tsx | apiAplicacionDBById → /api/db/aplicaciones/{id} | PRISMA OK |
| Editar Funcionalidad | FuncionalidadForm.tsx | apiObjetosDB → /api/db/objetos | PRISMA OK |

### Modales auditados (5 total)

| Modal | API de read | Estado |
|-------|------------|--------|
| Ver Permisos (usuario) | apiRolesUsuarioDB → /api/db/usuarios/{id}/roles | PRISMA OK |
| Asignar Roles | apiRolesDB + apiRolesUsuarioDB | PRISMA OK |
| Atributos | apiAtributosDB → /api/db/usuarios/{id}/atributos | PRISMA OK |
| Sync Usuarios | apiSyncUsuarios → /api/db/usuarios/sync | PRISMA OK |

### Dashboard home (widgets)
- Stats (usuarios, accesos, alertas, uptime): **HARDCODED MOCK** — GAP
- Charts (bar, line): **HARDCODED MOCK** — GAP
- Alerts/Activities/Status/ServerInfo widgets: static/hardcoded props — sin API

## Cambio implementado
- **EditRoleForm.tsx**: reemplazado `apiObtenerRol` (GeneXus) por `apiRolDBById` (Prisma)
- Commit: `10262d0` en branch `dev`
- Build: pnpm build PASSED, tsc PASSED

## GAPS declarados (requieren trabajo futuro)

### GAP 1: /api/db/eventos — PRIORIDAD MEDIA
- **Qué**: `Eventos.tsx` llama `apiEventos` → GeneXus proxy `/eventos`
- **Por qué no migrado**: no existe tabla de eventos en el schema Prisma
- **Para migrar**: requiere DBA + `prisma db pull` o nueva migración de schema
- **Datos afectados**: historial de eventos/auditoría del sistema

### GAP 2: Dashboard stats — PRIORIDAD BAJA
- **Qué**: `dashboard/page.tsx` usa datos hardcodeados ("142 usuarios activos", etc.)
- **Por qué no migrado**: requiere tabla de auditoría/accesos en Prisma para calcular
  métricas reales (accesos por día, usuarios activos, etc.)
- **Para migrar**: 
  - Crear endpoint `/api/db/stats` que consulte COUNT de usuarios activos, accesos, etc.
  - Reemplazar staticData en DashboardPage por fetch real
  - Alcance: estimado 150-200 LOC

### GAP 3: FuncionalidadForm.tsx.backup
- Archivo de backup con código viejo (apiListarObjetos → GeneXus) — el archivo activo ya usa apiObjetosDB (Prisma)
- Recomendación: eliminar el .backup para evitar confusión (`git rm`)

## Notas
- Auth y proxy.ts: intactos (GeneXus por diseño, correcto)
- Dual-write del run s9k: intacto (no tocado)
- El cambio mejora la UI: nombres de funcionalidades ahora son reales en EditRoleForm
