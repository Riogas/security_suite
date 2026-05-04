# Plan — Dual-write CRUD: Security Suite (runId: 20260430-201700-s9k)

## Scope confirmado

Cambios quirúrgicos en 2 archivos:

### 1. `src/services/api.ts`

Agregar al final del archivo (después de `apiPermisosDB`):

```ts
/**
 * dualWriteFireForget — patrón de dual-write non-blocking.
 * Ejecuta `fn` en background. Si falla, loggea en JSON estructurado.
 * GeneXus ya respondió OK antes de llamar esto.
 */
export function dualWriteFireForget(
  label: string,
  fn: () => Promise<any>,
): void {
  fn()
    .then((result) => {
      console.log(JSON.stringify({
        event: "dual_write",
        label,
        pgOk: true,
        ts: new Date().toISOString(),
      }));
    })
    .catch((err: any) => {
      console.error(JSON.stringify({
        event: "dual_write",
        label,
        pgOk: false,
        pgError: err?.message ?? String(err),
        ts: new Date().toISOString(),
      }));
    });
}
```

### 2. `src/components/dashboard/roles/form/EditRoleForm.tsx`

**Cambios:**
a) Importar `apiActualizarRolDB` y `dualWriteFireForget` desde `@/services/api`
b) Modificar `handleSubmit` para recibir también `funcionalidadesAsignadas` (del RoleForm state) y:
   - Pasar `Funcionalidad` correctamente a `apiAbmRoles`
   - Después del éxito de GeneXus: `dualWriteFireForget` con `apiActualizarRolDB`

**Truco del prop onSubmit:** `RoleForm` acepta `onSubmit?: (data: RolFormState) => void | Promise<void>`. El problema es que `onSubmit` solo recibe `RolFormState` — no las funcionalidades del drag-and-drop state. La solución es que `EditRoleForm` exponga un `handleSubmitWithFuncs` que recibe `(data: RolFormState, funcionalidades: FuncionalidadItem[])`. Para esto, el `RoleForm` necesita ser modificado para llamar `onSubmit` con las funcionalidades como segundo argumento, o `EditRoleForm` accede al state de funcionalidades de otra forma.

**Alternativa más limpia (la que vamos a usar):** Cambiar la firma de `onSubmit` en `RoleForm` para incluir `funcionalidades`:

```ts
// RoleForm.tsx — cambio de firma del prop
onSubmit?: (data: RolFormState, funcionalidades: FuncionalidadItem[]) => void | Promise<void>;
```

Y en `handleSubmit` de RoleForm pasar las funcionalidades asignadas:
```ts
if (onSubmit) await onSubmit(form, funcionalidadesAsignadas);
```

Pero en el caso de no tener `onSubmit` (create path), sigue usando `apiCrearRolDB`/`apiActualizarRolDB` internamente.

**EditRoleForm.handleSubmit revisado:**
```ts
const handleSubmit = async (data: RolFormState, funcionalidades: FuncionalidadItem[]) => {
  try {
    const rolId = parseInt(data.rolid);
    
    // 1. GeneXus write (bloqueante — fuente de verdad para el UI)
    const gxPayload: AbmRolesReq = {
      RolId: rolId,
      RolNombre: data.rolnombre,
      RolDescripcion: data.roldescripcion,
      RolEstado: data.rolestado,
      RolNivel: data.rolnivel,
      RolFchIns: data.rolfchins,
      AplicacionId: parseInt(data.aplicacionid),
      RolCreadoEn: data.rolcreadoen,
      Funcionalidad: funcionalidades.map((f) => ({
        FuncionalidadId: parseInt(f.id),
        RolFuncionalidadFchIns: new Date().toISOString(),
      })),
    };
    const response = await apiAbmRoles(gxPayload);

    if (response.success === false) {
      toast.error(response.message || "Error al actualizar el rol");
      return;
    }

    // 2. DB write (fire-and-forget — no bloquea el flujo)
    dualWriteFireForget(`rol:update:${rolId}`, () =>
      apiActualizarRolDB(rolId, {
        nombre: data.rolnombre,
        descripcion: data.roldescripcion,
        estado: data.rolestado,
        nivel: data.rolnivel,
        creadoEn: data.rolcreadoen,
        funcionalidades: funcionalidades.map((f) => ({ funcionalidadId: parseInt(f.id) })),
      })
    );

    toast.success("Rol actualizado correctamente");
    router.push("/dashboard/roles");
  } catch (error) {
    console.error("Error actualizando rol:", error);
    toast.error("Error al actualizar el rol");
  }
};
```

## LOC estimado

- `api.ts`: +22 LOC (helper `dualWriteFireForget`)
- `EditRoleForm.tsx`: +15 LOC netos (imports + lógica dual-write)
- `RoleForm.tsx`: +3 LOC (cambio firma onSubmit + pasar funcionalidades)
- **Total: ~40 LOC netos**

## Testing plan

1. `pnpm build` (TypeScript check + prisma generate)
2. `pnpm lint` — sin errores nuevos
3. Manual: crear un rol nuevo → va a DB (ya funciona)
4. Manual: editar un rol existente → GeneXus debe responder OK, DB debe actualizarse en background
5. Manual: verificar en Prisma Studio que el rol queda actualizado en tabla `roles` y `rol_funcionalidades`
6. Manual: editar rol con GeneXus caído → UI muestra éxito falso + console.error con log estructurado

## Riesgos

- **Bajo:** GeneXus IDs vs Postgres IDs pueden diferir si el rol fue creado en GeneXus antes de la migración. El upsert en DB ya usa el ID del rol GeneXus como referencia — si no existe en Postgres, `apiActualizarRolDB` puede fallar (404). Se captura en el fire-and-forget y se loggea.
- **Mitigación:** en el futuro se puede usar upsert en el endpoint PUT de roles, pero para v1 el log es suficiente.
