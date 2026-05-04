# Spec mínima (inline orquestador): migrar AsignarRolesModal a backend Postgres

## Pedido literal del usuario

> en el administracion de usuarios, cuando voy a editar un usuario y voy a la parte de asignar roles, los roles que me aparecen ahi no son los de postgre, son los de la api vieja de genexus, lo cual esta mal, debe cargar siempre los datos de la tabla de postgre, y cuando le asigno un rol, ese rol debe quedar guardado en la tabla de postgre de usuario_roles

## Síntoma reportado

Al editar un usuario y abrir el modal "Asignar Roles":
- La lista de roles que aparece **no** corresponde a la tabla `roles` de Postgres.
- Viene de la API legacy de Genexus.
- Cuando se asigna y guarda, **no** se persiste en `usuario_roles` de Postgres.

## Causa raíz (verificada por exploración)

`src/components/dashboard/usuarios/AsignarRolesModal.tsx` importa de `@/services/api`:
- `apiRoles` (línea 21) → `POST /roles` proxy a Genexus
- `apiSetRol` (línea 22) → `POST /setRol` proxy a Genexus
- `apiGetRolUsuario` (línea 23) → `POST /getRolUsuario` proxy a Genexus

Las versiones DB ya existen en `src/services/api.ts`:
- `apiRolesDB(opts?)` línea 1650 → `GET /api/db/roles?...` → retorna `{ success, items: RolDB[], total, page, pageSize, totalPages }`
- `apiRolesUsuarioDB(usuarioId)` línea 1705 → `GET /api/db/usuarios/:id/roles` → retorna `{ success, roles: UsuarioRol[] }` con `rol` y `aplicacion` populated
- `apiAsignarRolesDB(usuarioId, roles[])` línea 1708 → `PUT /api/db/usuarios/:id/roles` con body `{ roles: [{ rolId, fechaDesde?, fechaHasta? }] }`

## Acceptance criteria

- [ ] AC1 — Al abrir el modal, la lista de roles que se muestra proviene de `GET /api/db/roles?estado=A&pageSize=1000` (NO de `apiRoles`).
- [ ] AC2 — Los roles ya asignados al usuario que se editan provienen de `GET /api/db/usuarios/:id/roles` (NO de `apiGetRolUsuario`).
- [ ] AC3 — Al guardar, la asignación se hace via `PUT /api/db/usuarios/:id/roles` (NO `apiSetRol`).
- [ ] AC4 — Tras guardar, los rows correspondientes existen en `usuario_roles` (Postgres) con `usuario_id`, `rol_id`, y `fecha_desde`/`fecha_hasta` correctos cuando se eligió un rango.
- [ ] AC5 — El comportamiento del UI (búsqueda, checkboxes, badges "Asignado"/"Seleccionado", date range picker, toasts de éxito/error) sigue funcionando igual.
- [ ] AC6 — No quedan imports/llamadas a `apiRoles`, `apiSetRol`, `apiGetRolUsuario` en `AsignarRolesModal.tsx`.
- [ ] AC7 — Type check (`pnpm exec tsc --noEmit`) pasa sin errores nuevos.
- [ ] AC8 — Build (`pnpm build`) pasa.

## Áreas afectadas

**Único archivo a modificar:**
- `src/components/dashboard/usuarios/AsignarRolesModal.tsx`

**Archivos NO modificados (referencia):**
- `src/services/api.ts` (las funciones DB ya existen)
- `src/app/api/db/roles/route.ts` (endpoint GET ya existe)
- `src/app/api/db/usuarios/[id]/roles/route.ts` (GET y PUT ya existen)
- `prisma/schema.prisma` (modelos `Rol`, `Usuario`, `UsuarioRol` con `@@map("usuario_roles")` ya existen)

## Mapeo de shapes (lo crítico para que el implementer no rompa la UI)

### Antes (Genexus → componente)
```ts
apiRoles({ Estado, Pagesize, CurrentPage }) → { sdtRoles: [{ RolId: string|number, RolNombre, RolDescripcion, RolEstado, AplicacionId, ... }] }
```

### Ahora (Postgres → componente)
```ts
apiRolesDB({ estado: 'A', pageSize: 1000 }) → { success, items: [{ id, nombre, descripcion, estado, aplicacionId, nivel, fechaCreacion, creadoEn, aplicacion? }] }
```

**Decisión técnica**: el implementer debe **adaptar la respuesta DB al shape interno `Rol`** del componente (que el JSX ya consume con `RolId`, `RolNombre`, etc.) en vez de cambiar todos los usos en el JSX. Esto minimiza cambios y riesgo de regresión visual.

Mapeo:
```ts
const rolesData = (rolesResponse.items ?? []).map(r => ({
  RolId: r.id,
  RolNombre: r.nombre,
  RolDescripcion: r.descripcion ?? "",
  RolEstado: r.estado,
  AplicacionId: String(r.aplicacionId),
  RolNivel: r.nivel,
  RolFchIns: r.fechaCreacion,
  RolCreadoEn: r.creadoEn ?? undefined,
}));
```

### Antes (asignados de Genexus)
```ts
apiGetRolUsuario({ UserId }) → array | object con sdtRoles/roles → cada item tiene { RolId, ... }
```

### Ahora (asignados de Postgres)
```ts
apiRolesUsuarioDB(usuarioId) → { success, roles: [{ usuarioId, rolId, fechaDesde, fechaHasta, rol: {...} }] }
```

Mapeo para el Set de asignados:
```ts
const rolesAsignadosIds = new Set<number>(
  (rolesAsignadosResponse?.roles ?? []).map((ur: any) => ur.rolId)
);
```

### Antes (guardar via Genexus)
```ts
apiSetRol({ UserId, sdtAsignacionRoles: [{ RolId, UsuarioRolFchDesde, UsuarioRolFchHasta }] })
```

### Ahora (guardar via Postgres)
```ts
apiAsignarRolesDB(userIdNumber, [
  { rolId, fechaDesde: dateRange?.from?.toISOString(), fechaHasta: dateRange?.to?.toISOString() }
])
```

## Edge cases a respetar

- Si `rolesResponse.items` viene vacío o `success: false` → mostrar "No hay roles disponibles" (lo que ya hace el componente con array vacío).
- Si `rolesAsignadosResponse?.roles` es undefined o el GET falla → tratar como "sin roles asignados", no romper el modal (tal cual hace hoy con try/catch).
- `fechaDesde`/`fechaHasta` cuando no hay date range → mandar `undefined`, no string vacío (la API DB acepta opcionales y el GET legacy mandaba `""`; el PUT actual hace `r.fechaDesde ? new Date(r.fechaDesde) : null` así que `undefined` o ausente OK).
- El PUT del endpoint reemplaza TODA la asignación (deleteMany + createMany). Eso es lo que quiere el usuario (lista marcada = lista final). Mantener semántica.
- Si el usuario deselecciona todos los roles y guarda → el PUT con `roles: []` debe ejecutarse (no debe abortar). Eso significa "quitar todos los roles".

## Out of scope

- Reemplazar `apiRoles`, `apiSetRol`, `apiGetRolUsuario` en otros archivos (este pedido es solo el modal de asignar).
- Borrar las funciones legacy de `api.ts` (otras pantallas pueden usarlas).
- Cambiar el shape interno `Rol` del componente — se mantiene tal cual para preservar el render.
- Tests unitarios nuevos (no hay framework de tests configurado en el repo según `package.json`).
- Permisos de la pantalla / proxy.ts.

## Decisiones explícitas para el implementer

1. **Mantener la interface `Rol` interna del componente intacta**. Solo cambia cómo se hidrata.
2. **Sacar imports de `apiRoles`, `apiSetRol`, `apiGetRolUsuario`, `SetRolReq`, `GetRolUsuarioReq`**. Reemplazar por los DB equivalentes.
3. **Reducir o eliminar los console.log de debug excesivos** que están en `loadRoles()` (líneas 95-261). Dejá un máximo de 3-4 logs útiles (inicio, error, finalización). Los ~30 console.log actuales son ruido.
4. **NO cambiar el JSX** salvo que sea estrictamente necesario.
5. **NO cambiar el comportamiento de fechas**. Mantener exactamente el mismo flujo.
