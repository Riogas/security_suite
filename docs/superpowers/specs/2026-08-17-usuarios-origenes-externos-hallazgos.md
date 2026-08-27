# Orígenes externos de usuarios — hallazgos y decisiones

**Fecha:** 2026-08-17
**Rama:** `dev` (sin mergear a `main`)
**Spec:** `2026-08-17-usuarios-origenes-externos-design.md`
**Plan:** `../plans/2026-08-17-usuarios-origenes-externos.md`

Este documento existe porque buena parte del valor del trabajo no queda en el diff:
los hallazgos sobre sistemas que ya estaban andando, y las decisiones que se tomaron
en el camino. El detalle operativo vivió en un workspace efímero; esto es lo que
merecía sobrevivir.

---

## 1. Lo que se entregó

26 commits. Reemplaza el filtro de la pantalla de usuarios —donde dos de sus tres
opciones ejecutaban literalmente la misma consulta— por tres orígenes externos
reales, y la importación masiva a ciegas por un wizard que compara contra lo que ya
está migrado antes de escribir.

Verificado contra datos productivos, no estimado:

| Origen | Del origen | Nuevos | Migrados | Difieren | Conflictos |
|---|---:|---:|---:|---:|---:|
| SGM (`GXICAGEO.USUMOBILE`) | 919 | 92 | 813 | 11 | 3 |
| LDAP (`ADMSEC.USUARIOS` `USUAUTAD='A'`) | 326 | 312 | 14 | 0 | 0 |
| GSIST (`ADMSEC.USUARIOS` resto) | 22 | 22 | 0 | 0 | 0 |

854 usuarios locales. **426 a importar.**

---

## 2. Hallazgos sobre sistemas que ya estaban andando

Ninguno lo introdujo este trabajo. Se listan porque salieron a la luz al construirlo
y algunos siguen abiertos.

### 2.1 🔴 El JWT no se verifica, y `/api` no pasa por el guard

`src/lib/permisos.ts:24` — `decodeJwt` hace `JSON.parse(atob(payload))`: **no valida
firma ni vencimiento**. El matcher de `src/proxy.ts` es
`["/((?!api|_next|.*\\..*).*)"]`, que **excluye `/api`**, y no existe `middleware.ts`.

Cualquiera que alcance la app puede mandar `token=x.<base64 de {"username":"…"}>.y`
y actuar como ese usuario contra los `/api/db/*`. Los usernames son logins del AS400:
son apellidos, o sea que adivinarlos es gratis.

**Estado:** el endpoint nuevo de importación —el único que escribe filas de usuario—
se gateó con `requireRoot` de `src/lib/docs/root-guard.ts` más un chequeo explícito de
`esRoot`. Verificado en vivo: token forjado → `TOKEN_INVALIDO`.

**Sigue abierto** para el resto: los cuatro endpoints de solicitudes y el de listado
de externos. Arreglar `resolveUsuario` globalmente tiene alcance productivo y quedó
como decisión del dueño.

### 2.2 `desdeSistema` guarda dos cosas incompatibles

El login escribe `SGM|LDAP|GSIST` (un sistema de origen). `UsuarioForm.tsx:537` la
expone como un switch Sí/No rotulado "Desde Sistema" y escribe `"S"`/`"N"` (un
booleano). `"LOCAL"`, el default del schema, no lo escribe ningún camino de código.

**Consecuencia:** editar un usuario importado y tocar ese switch dos veces le **borra
el origen**. Toda la feature usa esa columna como origen.

**Estado:** abierto. Se mitigó en la UI (la columna muestra "Local" cuando no hay
origen externo) pero la causa sigue.

### 2.3 El repo no tiene linter funcionando

`pnpm lint` invoca `next lint`, que Next 16 eliminó. `pnpm exec eslint` revienta con
`TypeError: Cannot set properties of undefined (setting 'defaultMeta')` por una
incompatibilidad de `ajv` entre `@eslint/eslintrc` 3.3.3 y ESLint 9.39.2.

### 2.4 `POST /api/db/query` del `as400-api` ejecuta SQL arbitrario sin autenticación

Contra el AS400 con `qsecofr`. Marcado como "solo desarrollo/debug", corriendo en
node-dev. Se usó para todo el relevamiento de este trabajo. El middleware
`requiereApiKey` que ya existe es el camino natural para cerrarlo.

### 2.5 `applyAdmsecGroupRoles` asigna roles de otra aplicación

Los roles 48, 49, 50 y 52 que ese helper otorga pertenecen todos a la **aplicación 5,
RiogasTracking**, y además setea `esRoot='S'`, que es un flag **global**. La
aplicación 2, "GESTIÓN DE SISTEMAS", está vacía: 0 roles, 0 funcionalidades, 0 usuarios.

**Estado:** se sacó del camino de importación (commit `a539de6`). **Sigue activo en el
login**, así que los 8 usuarios del grupo 1 de ADMSEC se van a volver root igual en su
primer ingreso. Cambió *cuándo*, no *si*.

---

## 3. Decisiones de diseño que costó llegar a ellas

### 3.1 El match de usernames es case-insensitive

El AS400 guarda los logins en MAYÚSCULAS y la PostgreSQL en minúsculas. El `@unique`
de `username` es case-sensitive.

**De los 14 usuarios de ADMSEC que ya estaban migrados, los 14 difieren solo en
capitalización** (`AMOROSINI` / `Amorosini`). Verificado contra datos reales. Con un
match exacto, el import habría creado 14 duplicados y el `findFirst` case-insensitive
del login habría devuelto una fila arbitraria de las dos.

### 3.2 ADMSEC no tiene nombre ni email, y no se pueden reconstruir

`ADMSEC.USUARIOS` no tiene esas columnas. Se evaluó derivarlas de
`PRESUDB.FUNCIONARIO` vía `USUPAYEMPID`/`USUPAYFUNID` y **se descartó con evidencia**:
197 logins comparten apenas 70 `FUNID` distintos (el 710 lo tienen 58 logins), así que
el join devuelve el nombre de otra persona — `ADEANGELIS` resolvía a "CHRISTIAN FARNES".

Por eso el login rellena esos campos contra AD cuando el usuario entra (§6 de la spec).

### 3.3 `preseleccionados` no es lo mismo que `nuevos`

Las cuentas de sistema (`ROOT`, `DAEMONS`, `INCIDENTES`, `PUESTOPRUEBA`) son NUEVO
pero arrancan destildadas. En GSIST son 22 nuevos y 18 preseleccionados. Si el
contador del botón usara `nuevos`, prometería importar 22 e importaría 18.

Lo mismo, por otro eje: un usuario **deshabilitado** en el origen tampoco viene
preseleccionado. Sin eso, el toggle "incluir deshabilitados" —cuyo propósito es
*visibilidad*— se convertía en un botón de alta masiva de cientos de filas inactivas.

### 3.4 Las fuentes lanzan; no devuelven listas vacías

Si una fuente externa no responde, `list()` lanza con un código diagnóstico en vez de
devolver `[]`. Sin eso, un AS400 caído se ve en pantalla **idéntico a "ya está todo
migrado"**: cero usuarios y el cartel de la fuente en verde. Un operador miraría cero
pendientes y daría la importación por terminada.

Esto se probó solo el mismo día: un `USERS_API_KEY` mal configurado produjo
`[externos] fuente SGM falló: SGM: SIN_USERS_API_KEY` en los logs, y el diagnóstico
fue de una línea.

### 3.5 Los importados se crean con `password: ""`

El login rechaza claves vacías antes de comparar, así que el camino de fallback contra
la clave local queda inutilizable por diseño: estos usuarios **solo** pueden entrar
validando contra su fuente externa.

---

## 4. Operación

- **`USERS_API_KEY` va en `/var/www/secapi/.env`**, no en `as400-api/.env`: el
  `exec cwd` de pm2 es `/var/www/secapi` y `dotenv` resuelve contra ese directorio.
- **La necesitan los DOS procesos.** Hay que reiniciar `as400-api` *y* `securitySuite`.
  Reiniciar solo el primero deja la pantalla sin datos y sin explicación aparente.
- La base de dev y la de producción son **la misma instancia de PostgreSQL**.

---

## 5. Lo que queda abierto

| Tema | Quién decide |
|---|---|
| Verificar la firma del JWT en `resolveUsuario` (alcance productivo) | dueño |
| El switch "Desde Sistema" que puede borrar el origen | dueño |
| `applyAdmsecGroupRoles` en el login (los 8 root de ADMSEC) | dueño |
| El wizard no tiene botón de simulación; el `dryRun` existe solo por API | producto |
| Espejo de grupos de ADMSEC como roles de "Gestión de Sistemas" + cron nocturno | pedido, sin spec |
| Pasada visual de la pantalla con datos reales | pendiente |
