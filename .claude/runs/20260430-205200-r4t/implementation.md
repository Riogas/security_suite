# Implementation — 20260430-205200-r4t

## Change made

**File:** `src/components/dashboard/roles/form/EditRoleForm.tsx`

### Summary
Migrated the rol-loading read from GeneXus (`apiObtenerRol` → proxy `/obtenerRol`) to
PostgreSQL Prisma (`apiRolDBById` → `/api/db/roles/{id}`).

### Before
- Called `apiObtenerRol({ RolId: parseInt(rolId) })` — went through GeneXus proxy
- Mapped PascalCase GeneXus response fields: `RolId`, `RolNombre`, `RolDescripcion`, etc.
- Funcionalidades arrived as `Funcionalidad[{FuncionalidadId}]` — no names, marked with "Temporal" comment
- Import: `apiObtenerRol`, `ObtenerRolResp` (GeneXus types)

### After
- Calls `apiRolDBById(parseInt(rolId))` — hits `/api/db/roles/{id}` (Prisma)
- Maps camelCase Prisma response fields: `id`, `nombre`, `descripcion`, `estado`, `nivel`, `fechaCreacion`, `aplicacionId`, `creadoEn`
- Funcionalidades arrive as `funcionalidades[{funcionalidadId, funcionalidad:{id,nombre,estado}}]`
  - Names are now populated directly (no more "Funcionalidad 42" placeholder)
- Import: `apiRolDBById` (Prisma service)
- Removed import: `apiObtenerRol`, `ObtenerRolResp`
- Dual-write back to GeneXus preserved (handleSubmit unchanged in logic)

### LOC
- Lines changed: ~45 lines modified, net delta: -3 lines (removed GeneXus types import)
- No new files created

### Build
`pnpm build` passes cleanly. Zero TypeScript errors, zero warnings.

### Behavior delta for UI
- Funcionalidad names now show actual names ("Gestión de Usuarios") instead of "Funcionalidad 42"
- Field `aplicacionid` now populated from `rol.aplicacionId` or `rol.aplicacion.id` — more reliable
- `rolnivel` now is `number` directly (Prisma) instead of `parseInt(string)` (GeneXus)
- Error handling improved: explicit null check on response.rol with clear error message
