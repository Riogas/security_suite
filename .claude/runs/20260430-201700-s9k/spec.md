# Spec — Dual-write CRUD: Security Suite (runId: 20260430-201700-s9k)

## Pedido original
Analizar toda la security suite y todo lo que sea CRUD en el administrador, que siga apuntando a la API de GeneXus, que use las APIs para PostgreSQL y llene las tablas correspondientes.

## Hallazgo del analyst (post-lectura del repo)

**El 90% del trabajo ya está hecho.** El repo ya tiene dos rutas de acceso bien separadas:
- `/api/[...proxy]` — proxy a GeneXus para reads y algunas operaciones legacy
- `/api/db/*` — endpoints Prisma/PostgreSQL para TODOS los modelos del CRUD

Tras leer el código completo de `src/services/api.ts` (1976 LOC), todos los componentes de formulario del dashboard, y los endpoints `/api/db/*`:

### Estado actual por módulo

| Módulo | Crear | Editar | Eliminar | Estado |
|--------|-------|--------|----------|--------|
| Usuarios | apiCrearUsuarioDB (DB) | apiActualizarUsuarioDB (DB) | apiEliminarUsuarioDB (DB) | COMPLETO |
| Aplicaciones | apiCrearAplicacionDB (DB) | apiActualizarAplicacionDB (DB) | apiEliminarAplicacionDB (DB) | COMPLETO |
| Roles — Crear | apiCrearRolDB (DB) | — | — | COMPLETO |
| Roles — Editar | — | **apiAbmRoles (GeneXus ONLY)** | apiEliminarRolDB (DB) | **GAP** |
| Funcionalidades | apiCrearFuncionalidadDB (DB) | apiActualizarFuncionalidadDB (DB) | apiEliminarFuncionalidadDB (DB) | COMPLETO |
| Accesos/Permisos | apiGuardarAccesoDB (DB) | — | apiEliminarAccesoDB (DB) | COMPLETO |
| AsignarRoles modal | — | apiAsignarRolesDB (DB) | — | COMPLETO |

### Único GAP real: EditRoleForm.tsx

`src/components/dashboard/roles/form/EditRoleForm.tsx` line 104:
```ts
const response = await apiAbmRoles(payload); // GeneXus POST /abmRoles
// NO hay llamada a apiActualizarRolDB después
```

El flujo de creación (RoleForm.handleSubmit) ya es correcto — llama a `apiCrearRolDB`/`apiActualizarRolDB` (DB only). El flujo de edición usa un componente diferente que quedó en la versión GeneXus-only.

**Nota adicional sobre EditRoleForm:** El `handleSubmit` tiene `Funcionalidad: []` hardcodeado con TODO comentado. Esto significa que al editar un rol en GeneXus, tampoco se guardan las funcionalidades. El fix de dual-write debe también corregir esto.

## Acceptance criteria

1. **EditRoleForm.handleSubmit** debe: primero llamar `apiAbmRoles` (mantiene el flow GeneXus), y si GeneXus responde OK, TAMBIÉN llamar `apiActualizarRolDB` con los datos del rol incluyendo funcionalidades (fire-and-forget: si postgres falla, loggear pero no bloquear).

2. **El helper `dualWriteFireForget`** en `src/services/api.ts` encapsula el patrón: ejecuta la acción DB en background, loggea divergencias en JSON estructurado en consola. Firma: `dualWriteFireForget(label: string, fn: () => Promise<any>): void`.

3. **Funcionalidades en el edit flow:** `EditRoleForm` actualmente tiene `Funcionalidad: []` hardcodeado. La spec del original es que el usuario selecciona funcionalidades con drag-and-drop en RoleForm. El fix es que EditRoleForm pase el `onSubmit` prop correctamente a RoleForm para que reciba las funcionalidades del drag-and-drop state, y luego las escriba tanto a GeneXus (`Funcionalidad` array en `AbmRolesReq`) como a DB (`funcionalidades` array en `apiActualizarRolDB`).

4. **Logs estructurados:** cada dual-write loggea `console.log(JSON.stringify({ event: 'dual_write', entity, action, gxOk, pgOk, pgError }))`.

5. **No romper read paths:** `apiObtenerRol` (GeneXus read para cargar el rol en edición) permanece igual.

6. **No romper auth ni middleware:** `src/proxy.ts` no se toca.

7. **TypeScript limpio:** `pnpm build` debe pasar sin errores de tipo.

## Archivos a modificar

1. `src/components/dashboard/roles/form/EditRoleForm.tsx` — fix del handleSubmit + pasar funcionalidades a GeneXus y DB
2. `src/services/api.ts` — agregar helper `dualWriteFireForget` al final

## Archivos a NO modificar

- `src/proxy.ts` (middleware de permisos)
- `src/app/api/[...proxy]/route.ts` (proxy GeneXus)
- `prisma/schema.prisma` (schema ya es correcto)
- Cualquier endpoint `/api/db/*` (ya están bien implementados)
- Todos los demás componentes del dashboard (ya usan DB correctamente)

## Open questions resueltas

- ¿Las tablas Prisma coinciden con DTOs del proxy? **Sí.** Los nombres difieren (GeneXus usa PascalCase, Prisma usa camelCase) pero hay mapeo explícito en los formularios.
- ¿Hay endpoints DB para todos los modelos? **Sí.** Todos están implementados.
- ¿El equipo quiere alertas? **Logs en v1** según spec del usuario.
