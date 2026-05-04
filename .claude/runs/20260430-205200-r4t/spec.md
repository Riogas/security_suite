# Spec — Auditoría de Reads PostgreSQL vs GeneXus (20260430-205200-r4t)

## Pedido
Revisar todos los paneles/modales/pantallas del dashboard de Security Suite y verificar que están leyendo de PostgreSQL (Prisma) en lugar de GeneXus.

## Complementa
Run anterior `20260430-201700-s9k` cubrió dual-write en escrituras. Este run cubre reads.

## Inventario completo de pantallas y su estado de reads

### PANELES PRINCIPALES (tablas/listados)

| Panel | Componente | API de read | Estado |
|-------|-----------|-------------|--------|
| Usuarios (locales/todos) | `Usuarios.tsx` | `apiUsuariosDB` → `/api/db/usuarios` | PRISMA OK |
| Usuarios (sin importar) | `Usuarios.tsx` | `apiUsuarios` → `/usuarios` (GeneXus) | GENEXUS INTENCIONAL — lista del SGM externo para importar, correcto |
| Roles listado | `Roles.tsx` | `apiRolesDB` → `/api/db/roles` | PRISMA OK |
| Aplicaciones listado | `aplicaciones.tsx` | `apiAplicacionesDB` → `/api/db/aplicaciones` | PRISMA OK |
| Funcionalidades listado | `Funcionalidades.tsx` | `apiFuncionalidadesDB` → `/api/db/funcionalidades` | PRISMA OK |
| Objetos listado | `Objetos.tsx` | `apiObjetosDB` → `/api/db/objetos` | PRISMA OK |
| Permisos (Accesos) listado | `Permisos.tsx` | `apiAccesosDB` → `/api/db/accesos` | PRISMA OK |
| Eventos | `Eventos.tsx` | `apiEventos` → `/eventos` (GeneXus proxy) | **GAP — no hay /api/db/eventos** |

### FORMULARIOS DE EDICIÓN/DETALLE

| Pantalla | Componente | API de read | Estado |
|----------|-----------|-------------|--------|
| Editar Usuario | `UsuarioForm.tsx` | `apiUsuarioDBById` → `/api/db/usuarios/{id}` | PRISMA OK |
| Editar Rol — **CARGA INICIAL** | `EditRoleForm.tsx` | `apiObtenerRol` → `/obtenerRol` (GeneXus) | **MIGRAR** |
| Editar Rol — funcionalidades disponibles | `RoleForm.tsx` | `apiFuncionalidadesDB` → `/api/db/funcionalidades` | PRISMA OK |
| Editar Rol — aplicaciones dropdown | `RoleForm.tsx` | `apiAplicacionesDB` → `/api/db/aplicaciones` | PRISMA OK |
| Editar Aplicacion | `AplicacionForm.tsx` | (investigar) | |
| Editar Funcionalidad | `FuncionalidadForm.tsx` | (investigar) | |
| Editar Objeto | `ObjetoForm.tsx` | (investigar) | |

### MODALES

| Modal | Componente | API de read | Estado |
|-------|-----------|-------------|--------|
| Ver Permisos (usuario) | `VerPermisosModal.tsx` | `apiRolesUsuarioDB` → `/api/db/usuarios/{id}/roles` | PRISMA OK |
| Asignar Roles | `AsignarRolesModal.tsx` | `apiRolesDB` + `apiRolesUsuarioDB` → Prisma | PRISMA OK |
| Atributos | `useAtributos.ts` | `apiAtributosDB` → `/api/db/usuarios/{id}/atributos` | PRISMA OK |
| Sync Usuarios | `SyncUsuariosModal.tsx` | `apiSyncUsuarios` → `/api/db/usuarios/sync` | PRISMA OK |

### DASHBOARD HOME

| Widget | Componente | API de read | Estado |
|--------|-----------|-------------|--------|
| Stats (usuarios, accesos, alertas, uptime) | `DashboardPage` | Hardcoded mock | **GAP — datos estáticos** |
| Charts (bar, line) | `EnhancedBarChart/EnhancedLineChart` | Hardcoded mock | **GAP — datos estáticos** |
| AlertsWidget | `AlertsWidget.tsx` | (verificar) | |
| RecentActivitiesWidget | `RecentActivitiesWidget.tsx` | (verificar) | |
| SystemStatusWidget | `SystemStatusWidget.tsx` | (verificar) | |
| ServerInfoWidget | `ServerInfoWidget.tsx` | Static props | STATIC (sin API, aceotable) |

## Acceptance Criteria

1. `EditRoleForm.tsx`: el cargar un rol para editar debe leer de `/api/db/roles/{id}` (Prisma), NO de `/obtenerRol` (GeneXus).
   - La forma del response de la API Prisma ya existe (`apiRolDBById`). Hay que adaptar el mapeo de campos.
   - Funcionalidades del rol: actualmente viene como `Funcionalidad[{FuncionalidadId}]` de GeneXus. En Prisma viene como `funcionalidades[{funcionalidadId, funcionalidad:{id,nombre}}]`. Hay que adaptar el mapeo.
2. Sin otros reads a migrar (el resto ya usa Prisma o tiene razón funcional para usar GeneXus).
3. Reportar como GAPS explícitos:
   - `/eventos` → no hay endpoint Prisma equivalente
   - Dashboard stats/charts → datos hardcodeados, no hay tabla de eventos/accesos en Prisma para calcularlos
4. Build debe pasar (`pnpm build`) post-implementación.
5. No romper la UI del formulario de edición de roles.

## Out of Scope (confirmado)
- Auth/login
- proxy.ts / middleware de permisos
- Dual-write del run anterior
- Crear endpoints Prisma para eventos (no hay tabla)
- Dashboard stats reales (requiere tabla de auditoría/eventos en Prisma)
