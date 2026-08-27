# Feature — Login: rol Root por grupo 1 + filtro de roles por Escenario

Dos cambios coordinados en el endpoint de login que tocan el flujo de mapping de grupos AS400 a roles y agregan la pieza nueva de filtrado/refresco de Escenario.

---

## Contexto

El proyecto ya tiene un mapping AS400 group → role/flag implementado en `src/lib/auth/applyAdmsecGroupRoles.ts` (4 reglas configurables vía env). El modelo Prisma soporta atributos de rol vía `RolPreferencia` (tabla EAV — `rolId + atributo + valor`). El atributo `Escenario` también vive en `UsuarioPreferencia` y ya se persiste al primer login SGM vía `persistEscenarioPreference.ts` (hoy con política insert-only: no sobreescribe si ya existe).

Lo que falta:
1. Para grupo 1, además del flag `esRoot='S'` actual, asignar el rol Root (id 52).
2. Refrescar el escenario del usuario externo desde AS400 en cada login (sobreescribir el local si difiere).
3. Filtrar los roles aplicables del usuario al login según el escenario activo.
4. Bloquear login con outcome explícito si no quedan roles aplicables.

## Roles en DB (confirmados)

| id | aplicId | nombre | uso |
|---|---|---|---|
| 48 | 5 | Supervisor RiogasTracking | grupos AS400 56, 185 (operador) — env `PG_ROL_OPERADOR_ID` |
| 49 | 5 | Despacho | grupo AS400 52 — `DESPACHO_ROL_ID`, `assignDespachoIfEligible.ts` |
| 50 | 5 | Dashboards | grupo AS400 422 (consulta) — env `PG_ROL_CONSULTA_ID` |
| 52 | 5 | Root | grupo AS400 1 (admin total) — **NUEVO** `PG_ROL_ROOT_ID` |

---

## Cambios

### 1. `src/lib/auth/applyAdmsecGroupRoles.ts` — agregar asignación del rol Root

Hoy el grupo 1 solo setea `esRoot='S'`. Mantener ese comportamiento (lo consumen middlewares y rutas) **y además** asignar el rol id 52.

- Nuevo env var `PG_ROL_ROOT_ID` (default `52`).
- Agregar `ensureRolAssigned(usuario.id, ROL_ROOT_ID, usuario.username, "grupo ADMSEC 1 (root)")` dentro del bloque `if (groupSet.has(GROUP_ROOT))`, **después** del update de `esRoot`.
- Comportamiento idempotente como el resto (upsert).
- Actualizar el doc-comment del header del archivo para reflejar la nueva regla.

### 2. `as400-api/src/routes/auth-admsec.js` — exponer escenario del usuario

Hoy `lookupAdmsec` y `validateAdmsec` devuelven `{ username, isDespacho, groups }` (y `usuAutAd` en lookup). Falta el escenario.

- **Investigar primero** en qué tabla/campo de AS400 vive el escenario asignado al usuario. Candidatos a explorar (en este orden):
  1. Una columna adicional en `ADMSEC.USUARIOS` (verificar con `DESCRIBE ADMSEC.USUARIOS`).
  2. Una tabla relacionada `ADMSEC.USU_ESCENARIO` o similar.
  3. La tabla `ADMSEC.GRPUSU` con un GRPID que represente escenarios.
  4. Otra tabla del esquema de aplicación (no ADMSEC).
- Una vez identificada, agregar una función `getUserEscenario(usuid)` siguiendo el patrón de `getUserGroups`: try/catch, log de advertencia y `return null` si falla (el escenario es complementario, no rompe el login).
- Extender la response de `lookup` y `validate`:
  ```js
  user: {
    username, usuAutAd?, isDespacho, groups,
    escenarioId,        // NUEVO — number | null
    escenarioNom,       // NUEVO — string | null
  }
  ```
- Si no se puede determinar el campo en AS400 en esta iteración, **bloquear y reportar al usuario** — no inventar el campo. Documentar opciones y pedir input.

### 3. `src/lib/auth/persistEscenarioPreference.ts` — refresh para usuarios externos

Cambiar la política de insert-only para externos:

```ts
export async function persistEscenarioPreference(
  usuarioId: number,
  escenarioId: number | null | undefined,
  escenarioNom: string | null | undefined,
  isExternal: boolean,  // NUEVO
): Promise<void> {
  if (escenarioId == null || !Number.isFinite(Number(escenarioId))) return;
  const nombre = (escenarioNom ?? "").trim();
  if (!nombre) return;
  const newValor = JSON.stringify([{ Nombre: nombre, Valor: Number(escenarioId) }]);

  try {
    const existing = await prisma.usuarioPreferencia.findFirst({
      where: { usuarioId, atributo: "Escenario" },
    });

    if (existing) {
      if (!isExternal) {
        authLog.info("persistEscenarioPreference: ya existe (interno), no sobreescribo", { usuarioId });
        return;
      }
      if (existing.valor === newValor) {
        authLog.info("persistEscenarioPreference: AS400 == local, no toco", { usuarioId });
        return;
      }
      await prisma.usuarioPreferencia.update({
        where: { id: existing.id },
        data: { valor: newValor },
      });
      authLog.info("persistEscenarioPreference: actualizado desde AS400 (externo)", {
        usuarioId, escenarioId, escenarioNom: nombre, previo: existing.valor,
      });
      return;
    }

    await prisma.usuarioPreferencia.create({
      data: { usuarioId, atributo: "Escenario", valor: newValor },
    });
    authLog.info("persistEscenarioPreference: creado", { usuarioId, escenarioId, escenarioNom: nombre });
  } catch (err) {
    authLog.error("persistEscenarioPreference falló", { /* ... */ });
  }
}
```

Actualizar todos los call sites en `resolveCredentials.ts` para pasar `isExternal` (basado en `usuario.esExterno === 'S'` o `usuario.desdeSistema` ∈ `{LDAP, SGM, GSIST}`).

### 4. `src/lib/auth/applyScenarioFilter.ts` — NUEVO

Función pura de filtrado:

```ts
import { prisma } from "@/lib/prisma";

interface EscenarioPrefValue { Nombre: string; Valor: number; }

function parseEscenarioPref(valor: string | null): number[] {
  if (!valor) return [];
  try {
    const parsed: EscenarioPrefValue[] = JSON.parse(valor);
    return parsed.map(e => Number(e.Valor)).filter(n => Number.isFinite(n));
  } catch {
    return [];
  }
}

export interface ApplicableRolesResult {
  applicable: Array<{ rolId: number; nombre: string; global: boolean }>;
  filteredOut: Array<{ rolId: number; nombre: string; escenarios: number[] }>;
  totalAssigned: number;
}

export async function getApplicableRoles(
  usuarioId: number,
  escenarioId: number | null,
): Promise<ApplicableRolesResult> {
  const assigned = await prisma.usuarioRol.findMany({
    where: { usuarioId },
    include: { rol: { include: { preferencias: { where: { atributo: "Escenario" } } } } },
  });

  const applicable: ApplicableRolesResult["applicable"] = [];
  const filteredOut: ApplicableRolesResult["filteredOut"] = [];

  for (const ur of assigned) {
    const escPref = ur.rol.preferencias[0];
    if (!escPref) {
      // Sin atributo Escenario → rol GLOBAL
      applicable.push({ rolId: ur.rolId, nombre: ur.rol.nombre, global: true });
      continue;
    }
    const rolEscenarios = parseEscenarioPref(escPref.valor);
    if (escenarioId != null && rolEscenarios.includes(escenarioId)) {
      applicable.push({ rolId: ur.rolId, nombre: ur.rol.nombre, global: false });
    } else {
      filteredOut.push({ rolId: ur.rolId, nombre: ur.rol.nombre, escenarios: rolEscenarios });
    }
  }

  return { applicable, filteredOut, totalAssigned: assigned.length };
}
```

### 5. `src/lib/auth/types.ts` — nuevo outcome + escenario en ResolveResult

- Nuevo outcome literal: `"FORBIDDEN_SCENARIO"` en el union de resultados del login.
- `ResolveResult` agrega `escenario: { id: number; nombre: string } | null`.
- `ResolveResult` agrega `rolesFilteredOut?: Array<{ rolId; nombre; escenarios }>` (informativo, para logs/UI futura).

### 6. `src/lib/auth/resolveCredentials.ts` — integración

En `resolveExistingUser` (y en los `resolveNew*User` cuando corresponda — el implementer decide si aplica en altas nuevas):

1. Después de `applyAdmsecGroupRoles({ usuario, groups })` y de actualizar la preferencia de escenario (con `isExternal` correcto):
2. Releer el escenario activo del usuario:
   ```ts
   const escPref = await prisma.usuarioPreferencia.findFirst({
     where: { usuarioId: usuario.id, atributo: "Escenario" },
   });
   const escenarioActivo = escPref ? parseEscenarioFromPref(escPref.valor) : null;
   ```
3. Llamar `const { applicable, filteredOut, totalAssigned } = await getApplicableRoles(usuario.id, escenarioActivo?.id ?? null)`.
4. Decisión:
   - Si `totalAssigned > 0 && applicable.length === 0` → outcome `FORBIDDEN_SCENARIO`. Log `authLog.warn("login bloqueado: ningún rol aplica al escenario", { username, escenarioActivo, filteredOut })`.
   - Caso contrario: la response final usa **solo** los `applicable` roles. Las `funcionalidades` se derivan de esos roles (no de todos los asignados).

5. La response incluye `escenario: escenarioActivo`.

### 7. `src/app/api/db/login/route.ts` — mapeo HTTP

- Mapear `outcome: "FORBIDDEN_SCENARIO"` → HTTP **403** con body `{ outcome, message: "No tenés permisos para el escenario actual" }`.
- Resto de outcomes: mantener mapping actual.

### 8. `as400-api/.env.example` y `.env.production.example` — documentar nuevos vars

- `PG_ROL_ROOT_ID=52`
- Si el campo del escenario AS400 requiere config (nombre de tabla/columna): agregar la env correspondiente.

---

## Acceptance criteria

- [ ] Usuario con grupo AS400 1 al loguearse: queda con `esRoot='S'` **y** con `UsuarioRol` (rolId=52) — verificado en DB.
- [ ] `auth-admsec.js` `lookup` y `validate` devuelven `escenarioId` y `escenarioNom` (o `null/null` si AS400 no provee).
- [ ] Usuario LDAP/SGM/GSIST con escenario en AS400 distinto al local: la preferencia local se actualiza con el de AS400 al loguearse.
- [ ] Usuario interno (no externo) con escenario en preferencias: se respeta, no se sobreescribe.
- [ ] Usuario con escenario 2000 y rol con `RolPreferencia.Escenario` que incluye 2000: entra y ese rol aplica.
- [ ] Usuario con escenario 2000 y rol con `RolPreferencia.Escenario` 1000 (único rol): outcome `FORBIDDEN_SCENARIO` HTTP 403.
- [ ] Usuario con escenario 2000 y dos roles (uno global + uno con escenario 1000): entra solo con el global; el otro queda en `filteredOut`.
- [ ] Usuario sin escenario configurado y roles que tienen `RolPreferencia.Escenario`: esos roles NO aplican; solo los globales aplican.
- [ ] Response del login incluye `escenario: { id, nombre } | null` y `roles[]` filtrados.
- [ ] Middleware `src/proxy.ts` NO se modifica.
- [ ] Logs `authLog` cubren cada decisión clave (rol Root asignado, refresh de escenario, roles filtrados, bloqueo por escenario).
- [ ] `pnpm lint` + `pnpm build` pasan.

## Out of scope

- No tocar `src/proxy.ts` middleware (filtrado solo aplica al login; el JWT lleva roles ya filtrados).
- No migrar usuarios existentes (la lógica es idempotente; aplica al próximo login de cada uno).
- No renombrar roles en DB (los nombres actuales son los correctos).
- No exponer UI para que el usuario "elija" escenario al login (es preferencia única, opción B confirmada).

## Riesgos / notas para el implementer

- **Bloqueador potencial**: si AS400 no tiene un campo "escenario" del usuario en una tabla accesible, hay que escalar al usuario antes de implementar (no inventar el campo).
- `assignDespachoIfEligible.ts` tiene precondición "no tiene roles previos" — no afecta este cambio, pero tener en cuenta si interactúa con la asignación del rol Root.
- El cache de cohesion/comunidades de Graphify quedó construido — `graphify query "..."` está disponible para resolver dudas de arquitectura sin grepear.
- Patrón de commits del proyecto: `feat(auth): ...`, `feat(api): ...`, `refactor(auth): ...`. Un commit por subdominio (rol Root, escenario refresh, scenario filter, login response).
- Commit + push directo a `dev` (memoria del usuario: sin pedir confirmación).
