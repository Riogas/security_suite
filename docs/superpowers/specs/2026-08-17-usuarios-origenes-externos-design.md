# Usuarios: orígenes externos e importación comparada

**Fecha:** 2026-08-17
**Rama de trabajo:** `dev`
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Problema

La pantalla de usuarios de secapi tiene un filtro con tres opciones —
`Locales (DB)`, `Todos (DB)` y `Sin importar (GX)`— y dos de ellas están mal.

`Locales (DB)` y `Todos (DB)` ejecutan **exactamente la misma consulta**. En
`src/components/dashboard/usuarios/Usuarios.tsx:112-134`, ambos valores caen en
la misma rama del `if` y llaman a `fetcherDB` con idénticos parámetros. Son la
misma lista con distinta etiqueta.

`Sin importar (GX)` consulta al backend GeneXus (`POST /usuarios` con
`sinMigrar: true`), que es una sola de las poblaciones externas que existen.

Lo que hace falta es que "todos" signifique **todos los usuarios que todavía no
están en la PostgreSQL local**, que se los pueda ver comparados contra lo que ya
está migrado, y que se los pueda importar —de a uno o en masa— desde cada
origen.

La importación masiva actual (`SyncUsuariosModal`) pide el sistema origen en un
`<Input>` de texto libre con `"SGM"` precargado, y ejecuta sin mostrar nada de lo
que va a hacer.

## 2. Hallazgos del relevamiento

Todo lo que sigue está verificado contra los sistemas reales (PostgreSQL de dev
`192.168.2.117` y AS400 vía el `as400-api` que corre en node-dev), no inferido.

### 2.1 Las poblaciones reales

| Origen | Tabla | Total | Habilitados | Ya en PG | **Faltan** |
|---|---|---:|---:|---:|---:|
| SGM | `GXICAGEO.USUMOBILE` | 1.018 | 919 | 825 | **94** |
| LDAP | `ADMSEC.USUARIOS` con `USUAUTAD='A'` | — | 326 | 14 | **312** |
| GSIST | `ADMSEC.USUARIOS` con `USUAUTAD<>'A'` | — | 23 | 0 | **23** |
| | `ADMSEC.USUARIOS` (total) | 1.105 | 349 | 14 | |
| **Local** | `usuarios` (PostgreSQL) | **854** | | | **429 a importar** |

El universo externo son ~1.270 filas habilitadas contra 854 locales. Es chico:
la comparación se resuelve en memoria en el request, sin tabla de staging ni
caché.

### 2.2 El match tiene que ser case-insensitive

De los 14 usuarios de ADMSEC que ya están migrados, **los 14 difieren en
capitalización**: el AS400 los guarda en mayúsculas (`SACUNA`) y la PG en
minúsculas (`sacuna`).

El `@unique` de `username` en PostgreSQL es case-sensitive. Con un match exacto,
esos 14 se clasificarían como NUEVO y el import crearía 14 duplicados, que
además dejarían al `findFirst` case-insensitive del login
(`resolveCredentials.ts:641`) devolviendo una fila arbitraria de las dos.

**Decisión:** el cruce normaliza con `UPPER(TRIM(username))`, y al crear se
escribe el username en minúsculas, que es la convención de las filas existentes.

### 2.3 ADMSEC no tiene nombre ni email

`ADMSEC.USUARIOS` solo tiene `USUID`, `USUFCH`, `USULOGIN`, `USUPASSWORD`,
`USUHABILITADO`, tres timestamps, `USUPAYEMPID`, `USUPAYFUNID`,
`USUREFENCUESTAS`, `USUREFSYMPOSIUM`, `USUFCHULTDESACTIVACION`, `USUAUTAD` y
`USUGAMID`. No hay columna de nombre ni de email.

Se evaluó reconstruir el nombre con
`PRESUDB.FUNCIONARIO` (`FUNNOMPRI`, `FUNAPEPRI`) joineando por
`USUPAYEMPID = FUNEMP` y `USUPAYFUNID = FUNNRO`. **Se descarta:** de 349
habilitados solo 197 tienen `USUPAYFUNID > 0`, y esos 197 comparten apenas **70
`FUNID` distintos** — el `FUNID` 710 lo tienen 58 logins diferentes. `USUPAYFUNID`
no identifica a una persona (parece un cargo o centro de costo) y el join
devuelve nombres incorrectos: `ADEANGELIS` resolvía a "CHRISTIAN FARNES".

`GXICAGEO.USUMOBILE` sí tiene `USUMOBILENOMBRE` y `USUMOBILEEMAIL`, así que los
94 de SGM se importan con datos completos.

**Consecuencia:** los 335 de LDAP y GSIST se crean con `nombre` y `email` en
`null`, y hoy nada los rellena después — la rama LDAP del login
(`resolveCredentials.ts:468-502`) recibe `ldap.user.nombre` y `ldap.user.email`
del AD y **no los escribe**. Por eso este diseño incluye el backfill de §6.

### 2.4 No hay service account de Active Directory

`as400-api/src/routes/auth.js:284` autentica haciendo `bind` con
`glp\<usuario>` y la clave que tipeó el propio usuario. No existen
`LDAP_BIND_USER` / `LDAP_BIND_PASSWORD`. **Sin una cuenta de servicio el AD no se
puede enumerar**, solo validar de a uno. Está documentado como deuda técnica en
`as400-api/README.md`.

Mientras tanto, el origen "LDAP" se sirve desde `ADMSEC.USUARIOS` filtrando
`USUAUTAD='A'`, que es el conjunto de usuarios que el propio AS400 declara como
"valida contra el AD".

### 2.5 `desdeSistema` está corrupto

La columna es `VarChar(10)` con default `'LOCAL'` y valores válidos `SGM`,
`LDAP`, `GSIST`, `LOCAL`. En la PG de dev hay además `"N"` (7 filas) y `"S"` (2
filas), escritas por `src/app/api/db/usuarios/sync/route.ts:169`, que asume que
la columna es `Char(1)`.

Ese endpoint se retira (§7), con lo que la fuente del bug desaparece. Las 9 filas
existentes **no se tocan**; la UI las muestra como `—`.

### 2.6 La clave local es un vector de login real

Para usuarios externos, cuando la fuente externa responde `UNAVAILABLE` o
`NOT_FOUND`, el login cae a comparar `usuario.password !== password` contra la
columna local **en texto plano** (`resolveCredentials.ts:442`, `:512`, `:582`).
Lo que se escriba en `password` al importar habilita o no ese camino.

---

## 3. Decisiones de diseño

| # | Decisión |
|---|---|
| D1 | El origen "LDAP" se sirve desde `ADMSEC.USUARIOS` (`USUAUTAD='A'`) hoy, detrás de una capa de fuentes que permite cambiar al AD real cuando exista la service account, tocando una sola función. |
| D2 | Tres orígenes separados y visibles: **SGM**, **LDAP** y **ADMSEC/GSIST**. |
| D3 | La grilla previa muestra **todo**: NUEVO, MIGRADO, DIFIERE y CONFLICTO, con selección por fila. |
| D4 | El import **solo crea, nunca actualiza**. Lo que ya existe se reporta con su diff y no se toca. |
| D5 | Los usuarios importados se crean con `password: ""` → el fallback de clave local queda inutilizable por diseño. |
| D6 | Dos switches en el paso 1, encendidos por defecto y desactivables: *traer preferencias* y *asignar roles por grupo*. |
| D7 | El combo queda: `Locales` · `Sin importar — todos` · `Sin importar — SGM` · `Sin importar — LDAP` · `Sin importar — ADMSEC/GSIST`. |
| D8 | Se abandona el camino GeneXus para listar e importar usuarios. |
| D9 | Seleccionar todo alcanza **todo el filtro**, no la página, y el botón dice la cantidad exacta. |
| D10 | La importación masiva vive en pantalla propia (`/dashboard/usuarios/importar`), no en un modal. |
| D11 | Se retira `POST /api/db/usuarios/sync` y su modal. |
| D12 | Se corrige el bug de `desdeSistema` (retirando el endpoint); las 9 filas sucias quedan. |
| D13 | LDAP y GSIST se importan sin nombre ni email, y el login los completa solo (§6). |
| D14 | Las cuentas de sistema se marcan y vienen destildadas, pero se pueden importar. |
| D15 | El match de usernames es case-insensitive; al crear se escribe en minúsculas. |

---

## 4. Arquitectura

### 4.1 `as400-api` — enumeración

Tres endpoints nuevos, read-only, sin password, siguiendo el patrón del
`/api/auth/as400/lookup` que ya existe. Como el `/lookup`, **no autentican**: son
para procesos internos de secapi.

| Endpoint | Lee |
|---|---|
| `POST /api/users/sgm/list` | `GXICAGEO.USUMOBILE` + JOIN `AGENCIA` → `ESCENARIO` → `GXCALDTA.EFLETERA`, más `USUMOBILEROLES` |
| `POST /api/users/admsec/list` | `ADMSEC.USUARIOS` + `ADMSEC.GRPUSU` agregado por `USUID` |
| `POST /api/users/ldap/list` | `search` sobre el Base DN con service account |

Body común: `{ soloHabilitados?: boolean }`. Devuelven la lista completa; el
filtrado y la paginación los hace secapi después de cruzar.

**Autenticación:** los tres van detrás de api-key por header `x-api-key`,
reusando el middleware `requiereApiKey` de `as400-api/src/middleware/apiKey.js`
(comparación `timingSafeEqual`) que entró con el router `/api/ficha`. Ese
middleware hoy está clavado a `FICHA_API_KEY`; hay que **parametrizarlo** —
`requiereApiKey('USERS_API_KEY')`— sin cambiarle el comportamiento a `/api/ficha`.
Estos endpoints exponen el padrón de usuarios de la empresa: no pueden quedar
abiertos como el resto de los routers del servicio.

⚠️ **Coordinación:** al 2026-08-17 ese router y ese middleware están **sin
commitear** en el working tree, junto con cambios en `server.js` y
`src/db/as400.js`. Antes de empezar a implementar hay que confirmar que ese
trabajo esté commiteado y pusheado, para no pisarlo ni construir sobre algo que
todavía puede cambiar.

`/api/users/ldap/list` se escribe desde ahora y responde
`{ outcome: 'UNAVAILABLE', reason: 'NO_SERVICE_ACCOUNT' }` mientras
`LDAP_BIND_USER` no esté configurado.

**Nunca** se seleccionan `USUPASSWORD`, `USUMOBILEPASSWORD` ni columnas de
`PRESUDB.FUNCIONARIO` (esa tabla tiene `FUNCOSTOHR`, costo por hora: es nómina).

### 4.2 secapi — capa de fuentes

`src/lib/usuarios/sources/`

```ts
export type OrigenExterno = "SGM" | "LDAP" | "GSIST";

export interface ExternalUser {
  origen: OrigenExterno;
  username: string;
  nombre: string | null;
  email: string | null;
  habilitado: boolean;
  esCuentaSistema: boolean;
  extras: {
    escenarioId?: number | null;
    escenarioNom?: string | null;
    empFleteraId?: number | null;
    empFleteraNom?: string | null;
    grupos?: number[];
    rolesSgm?: number[];
    usuAutAd?: "A" | "G";
  };
}

export interface ExternalUserSource {
  key: OrigenExterno;
  label: string;
  available(): Promise<{ ok: boolean; reason?: string }>;
  list(opts: { soloHabilitados: boolean }): Promise<ExternalUser[]>;
}
```

Implementaciones: `sgmSource`, `ldapSource`, `gsistSource`.

`ldapSource.list()` es el único punto donde vive D1:

```
si LDAP_BIND_USER está configurado → /api/users/ldap/list (AD real)
si no                              → /api/users/admsec/list, filtrando USUAUTAD='A'
```

`available()` alimenta el cartel de estado de cada card en la UI.

`esCuentaSistema` sale de una heurística por lista de nombres, configurable con
`CUENTAS_SISTEMA` (default `ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR`).

### 4.3 secapi — comparación

`GET /api/db/usuarios/externos`

Query params:

| Param | Valores | Default |
|---|---|---|
| `origen` | `SGM` · `LDAP` · `GSIST` · `todos` | `todos` |
| `filtro` | texto libre, matchea contra username, nombre y email | `""` |
| `estadoComparacion` | `NUEVO` · `MIGRADO` · `DIFIERE` · `CONFLICTO` · `todos` | `todos` |
| `incluirDeshabilitados` | `true` · `false` | `false` |
| `page` / `pageSize` | enteros | `1` / `25` |

1. Trae la lista del origen (o de los tres).
2. Trae de PG solo `username, nombre, apellido, email, estado, desde_sistema`.
   Son 854 filas: una query, sin joins.
3. Indexa lo local en un `Map` por `UPPER(TRIM(username))`.
4. Clasifica cada fila externa:

   | Estado | Condición |
   |---|---|
   | `NUEVO` | el username no está en el `Map` |
   | `MIGRADO` | está y los campos comparables coinciden |
   | `DIFIERE` | está pero cambió `nombre`, `email` o `estado` → devuelve `diffs: [{ campo, local, externo }]` |
   | `CONFLICTO` | el email del externo lo tiene **otro** username en PG → el insert violaría el `@unique` de `email` |

   `CONFLICTO` gana sobre los demás. Un externo sin email nunca es `CONFLICTO`.
   Un externo sin nombre no genera `DIFIERE` por el nombre (no hay con qué
   comparar).

5. Filtra, ordena y pagina **sobre el resultado ya clasificado**.

Respuesta, en el ejemplo para `?origen=todos&estadoComparacion=NUEVO`:

```jsonc
{
  "items": [ /* ExternalUserComparado[] de la página */ ],
  "total": 429,        // filas que matchean el filtro, no el universo
  "page": 1,
  "pageSize": 25,
  // El resumen SIEMPRE cuenta el universo del origen, ignorando
  // `estadoComparacion` y `filtro`. Si no, los chips que filtran por estado
  // se recalcularían al clickearlos y quedarían en cero.
  "resumen": {
    "nuevos": 429, "migrados": 839, "difieren": 0, "conflictos": 0,
    // Los que vienen TILDADOS: los NUEVO que no son cuenta de sistema.
    // No es igual a `nuevos`, y es el número que tiene que decir el botón.
    "preseleccionados": 425
  },
  "fuentes": [ { "origen": "LDAP", "ok": true, "reason": null } ]
}
```

`total` es lo que se pagina; `resumen` es lo que alimenta los chips. Son
distintos a propósito.

El campo `fuentes` permite que "todos" siga funcionando aunque una fuente esté
caída, mostrando cuál falló en vez de fallar entero.

La función clasificadora es **pura** —recibe `ExternalUser[]` y las filas
locales, devuelve la clasificación— y es lo que cubren los tests de §8.

### 4.4 secapi — importación

`POST /api/db/usuarios/importar`

```jsonc
{
  "origen": "SGM",
  "usernames": ["19605429", "53830503"],
  "conPreferencias": true,
  "conRoles": true,
  "dryRun": false
}
```

Por cada username:

1. **Re-verifica contra PG.** La grilla puede tener minutos. Si ya existe →
   `omitido` con motivo. Nunca actualiza (D4).
2. Crea con:
   ```
   username:       <del origen, en minúsculas>       (D15)
   password:       ""                                 (D5)
   estado:         "A" | "I" según el origen
   esExterno:      "S"
   usuarioExterno: <username original del origen>
   tipoUsuario:    "E"
   desdeSistema:   "SGM" | "LDAP" | "GSIST"           (el valor correcto, §2.5)
   creadoPor:      "import:<username del operador>"
   nombre/email:   del origen, o null
   ```
3. Si `conPreferencias` y el origen es SGM → `persistEscenarioPreference` y
   `persistEmpFleteraPreference` (reutilizados tal cual).
4. Si `conRoles` → `applyAdmsecGroupRoles` para LDAP/GSIST y
   `assignDespachoIfEligible` para SGM (`USUMOBR_ROLID = 6`). Ambos ya existen y
   son idempotentes.

Se procesa en lotes de 50 con `Promise.all`, igual que el sync actual. Un error
por usuario no tumba el lote: se acumula en `detallesErrores`.

`dryRun: true` recorre todo sin escribir y devuelve el mismo resumen, como
`/api/db/admin/import-sgm-preferences`.

Respuesta: `{ success, total, creados, omitidos, errores, detallesErrores[] }`.

**Autenticación:** cookie JWT `token`, mismo mecanismo que el sync que reemplaza.

---

## 5. Interfaz

### 5.1 Pantalla de usuarios

El combo de tipo queda con las cinco opciones de D7. Desaparecen `Todos (DB)` y
`Sin importar (GX)`.

En cualquiera de los modos "sin importar":

- La columna **Origen** muestra `SGM` / `LDAP` / `GSIST` con su color. Para filas
  locales muestra `desdeSistema`, y `—` para las 9 sucias de §2.5.
- Cada fila NUEVO tiene botón **Importar**, que ahora llama a
  `/api/db/usuarios/importar` con un solo username en vez de al GeneXus.
- El header suma **Importación masiva**, que navega a la pantalla nueva con el
  origen ya seleccionado.

### 5.2 `/dashboard/usuarios/importar`

**Paso 1 — Origen y opciones**

- Tres cards (SGM / LDAP / ADMSEC-GSIST), cada una con su contador de
  disponibles y su estado. Si `available()` da `false`, la card se ve
  deshabilitada con el motivo (ej. *"Requiere cuenta de servicio de AD"*).
- Filtro de texto, y toggle **Incluir deshabilitados en el origen**, apagado por
  defecto.
- Dos switches, encendidos por defecto (D6):
  - *Traer preferencias (Escenario y Empresa Fletera)* — solo aplica a SGM; se
    ve deshabilitado con explicación si el origen no es SGM.
  - *Asignar roles según los grupos del origen*.

**Paso 2 — Comparación**

- Cuatro chips de resumen que además filtran: `429 nuevos · 839 migrados ·
  0 difieren · 0 conflictos`.
- Grilla paginada del servidor. Columnas: checkbox, Usuario (login + nombre si
  hay), Email, Origen, Estado en el origen, **Estado de comparación** (badge), y
  **Diferencias** (los campos que cambiaron, cuando es `DIFIERE`).
- Vienen tildados los `NUEVO` **salvo** los marcados como cuenta de sistema, que
  llevan badge propio y vienen destildados (D14).
- Los `CONFLICTO` no se pueden tildar; el tooltip dice qué username local tiene
  ese email.
- El checkbox del header selecciona **todo el filtro** (D9). El botón dice
  *"Importar 429 usuarios"*.

**Confirmación** — diálogo que repite origen, cantidad, y si van preferencias y
roles.

**Resultado** — se recicla el panel de contadores y detalle de errores de
`SyncUsuariosModal`, que es la parte rescatable de ese componente.

Los tres pasos siguen las convenciones visuales existentes (`ModalShell`,
`DataTable`, `PageHeader` con ícono y gradiente, badges de `variant`). Sin emoji
como íconos: se usa `lucide-react`, como el resto de la app.

---

## 6. Backfill de nombre y email en el login

Cambio acotado en la rama LDAP de `resolveCredentials.ts` (después del
`validateLdap` con `outcome === "OK"`, alrededor de la línea 470):

> Si el usuario en PG tiene `nombre` o `email` en `null` y el AD devolvió esos
> datos, se escriben. Solo rellena huecos: nunca pisa un valor existente.

Con esto los 312 de LDAP se auto-reparan en su primer ingreso, y los 14 que ya
están migrados también. Es independiente de la service account.

No aplica a GSIST: esos usuarios validan contra `ADMSEC.USUARIOS`, que no tiene
de dónde sacar el dato.

---

## 7. Qué se retira

| Elemento | Motivo |
|---|---|
| `POST /api/db/usuarios/sync` | Reemplazado por `/api/db/usuarios/importar`. Con él se va el bug de `desdeSistema`. |
| `src/components/dashboard/usuarios/SyncUsuariosModal.tsx` | Reemplazado por la pantalla; se recicla su panel de resultados. |
| `apiSyncUsuarios` (`services/api.ts`) | Sin consumidores. |
| `apiImportarUsuario` (`services/api.ts`) | El alta la hace secapi contra su propia PG. **Se comenta, no se borra** (ver §10.4): queda a mano si el `/importarUsuario` de GeneXus resultara hacer algo más. |
| El uso de `apiUsuarios({ sinMigrar: true })` en `Usuarios.tsx` | Reemplazado por `/api/db/usuarios/externos`. |

`apiUsuarios` **no** se elimina: hay que verificar antes si otras pantallas la
usan sin `sinMigrar`.

---

## 8. Verificación

El repo no tiene runner de tests. Se sigue la convención existente
(`scripts/test-docs-root-guard.ts` + entrada `pnpm test:*`): script `tsx` con
aserciones propias, sin dependencias nuevas y sin tocar red ni base.

`scripts/test-usuarios-comparacion.ts` (`pnpm test:usuarios-comparacion`) cubre
la función pura de §4.3:

1. Username idéntico → `MIGRADO`.
2. Username que solo difiere en mayúsculas → `MIGRADO`, no `NUEVO` (el caso real
   de los 14 de §2.2).
3. Username con espacios al borde → normaliza y matchea.
4. Username ausente → `NUEVO`.
5. Nombre distinto → `DIFIERE` con el diff del campo correcto.
6. Email distinto → `DIFIERE`.
7. Estado distinto → `DIFIERE`.
8. Externo sin nombre contra local con nombre → `MIGRADO`, no `DIFIERE`.
9. Email que pertenece a otro username local → `CONFLICTO`.
10. `CONFLICTO` tiene prioridad sobre `DIFIERE`.
11. Externo sin email nunca es `CONFLICTO`.
12. Cuenta de sistema → `esCuentaSistema: true` y no preseleccionada.
13. El `resumen` cuenta correctamente cada categoría.

Verificación manual contra dev, antes de dar por cerrado:

- `GET /api/db/usuarios/externos?origen=todos` devuelve `resumen.nuevos === 429`
  (94 SGM + 312 LDAP + 23 GSIST) contra los datos actuales.
- `POST /api/db/usuarios/importar` con `dryRun: true` sobre los 94 de SGM
  reporta 94 creados y 0 errores, y la tabla `usuarios` no cambia.
- El import real de un solo usuario SGM crea la fila con `desdeSistema = 'SGM'`,
  `password = ''`, y su preferencia de Escenario.
- Ese usuario puede loguearse con su clave de SGM (valida contra la fuente
  externa, no contra la clave local vacía).
- Capturas del paso 1 y del paso 2 con datos reales antes de dar por terminada
  la UI.

---

## 9. Fuera de alcance

- **Normalizar las 9 filas con `desdeSistema` en `"N"`/`"S"`** (D12). Se corrige
  el origen del bug, no el dato histórico.
- **La service account de Active Directory.** El diseño la contempla (D1, §4.2) y
  el endpoint queda escrito, pero provisionarla es tarea de Infraestructura.
  Hasta que exista, el origen LDAP se sirve desde ADMSEC y no ve a la gente que
  esté en el AD pero no en `ADMSEC.USUARIOS`.
- **Search-then-bind en `/api/auth/ldap`** para distinguir `NOT_FOUND` de
  `INVALID_CREDS` (deuda técnica de `as400-api/README.md`). Se destraba con la
  misma service account, pero es un cambio del flujo de login, no de este.
- **Actualizar usuarios ya migrados** desde el origen externo. El import solo
  crea (D4).
- **El almacenamiento en texto plano de la clave** en `usuarios.password` para
  usuarios externos que sí se loguearon (`upsertExternalUser.ts:37`). Es un
  problema real y preexistente, pero es otro trabajo.
- **Mapeo configurable de grupos a roles.** Se reusa `applyAdmsecGroupRoles`, que
  hoy resuelve 4 grupos por variables de entorno. Ampliarlo es otro trabajo.

---

## 10. Preguntas abiertas — RESUELTAS 2026-08-17

Las cuatro quedaron contestadas antes de escribir el plan. Se dejan con su
respuesta porque explican por qué el diseño quedó como quedó.

**10.1 — Service account de Active Directory: NO la tenemos.** Se va a pedir más
adelante. Hasta entonces el origen LDAP se sirve exclusivamente desde
`ADMSEC.USUARIOS` con `USUAUTAD='A'` (D1), y no ve a quien esté en el AD pero no
en ADMSEC. `/api/users/ldap/list` igual se escribe ahora y responde
`NO_SERVICE_ACCOUNT`, para que el día que exista sea solo configurar el `.env`.
El backfill de §6 es lo que compensa mientras tanto.

**10.2 — El trabajo de `/api/ficha` en `as400-api` se está construyendo y se va a
commitear.** 🔴 **Bloqueante de secuencia: no se toca NADA de `as400-api` hasta
que eso esté commiteado.** Por eso el plan arranca por lo que no depende del
servicio (§4.2 a §4.4, §5, §6) y deja los tres endpoints de enumeración (§4.1)
para después, contra el árbol ya limpio.

**10.3 — El `POST /importarUsuario` de GeneXus se abandona sin confirmar** qué
más hace. `apiImportarUsuario` se deja **comentado en `services/api.ts`**, no
borrado, para poder volver rápido si aparece un efecto que nos estábamos
perdiendo. Confirmarlo con el equipo de GeneXus queda como pendiente aparte.

**10.4 — `POST /api/db/query` del `as400-api` ejecuta SQL arbitrario** contra el
AS400 con `qsecofr`, sin autenticación, y corre en node-dev. Se usó para este
relevamiento. **Fuera de alcance**, pero anotado: el middleware `requiereApiKey`
que trajo `/api/ficha` es el camino natural para cerrarlo.
