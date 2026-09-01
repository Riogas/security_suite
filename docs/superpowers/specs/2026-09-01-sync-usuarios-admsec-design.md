# Sync horario de usuarios: Gestión de Sistemas → secapi

Fecha: 2026-09-01 · Repo: `security_suite` · Rama: `dev` · Estado: **propuesta, sin implementar**
Revisada adversarialmente contra el código y contra la base el 2026-09-01; las correcciones de esa revisión están incorporadas y anotadas donde importan.
Documento hermano: `2026-09-01-sync-usuarios-admsec-RELEVAMIENTO.md` — el dossier de mediciones y un diseño largo que se descartó por sobredimensionado. Todos sus números están verificados y se citan desde acá.

---

## 1. Qué hace, en las palabras del dueño

Un job que corre **cada una hora** y hace dos cosas:

- **Regla A — alta.** Si un usuario de `ADMSEC.USUARIOS` no existe en la Postgres de secapi, lo importa.
- **Regla B — estado.** Si existe, y su `USUDTUPD` es más nueva que la marca de la última corrida exitosa, y el estado difiere, le actualiza el estado.

**Y nada más.** No espeja grupos ni roles, no asigna roles, no toca `esRoot`, no escribe en el AS400, no desactiva por ausencia en el origen, no toca `fechaBaja`, no toca SGM.

El intervalo es configurable —es una línea de `cron_restart` en `pm2.config.js`, sección 5.8— y el valor pedido es **1 hora**.

---

## 2. Contexto verificado

Todo lo de esta sección está medido el 2026-09-01 contra los sistemas reales.

### 2.1 La fuente

`ADMSEC.USUARIOS`, 16 columnas, **1.106 filas**. Un `SELECT` completo tarda **0,12 s**. De ese único dato se deriva media spec: no hay nada que optimizar y leer la tabla entera cada hora es gratis.

| `USUAUTAD` | `USUHABILITADO` | Filas |
|---|---|---|
| `A` (autentica contra AD) | `S` | 325 |
| `A` | `N` | 254 |
| `G` (local de Gestión de Sistemas) | `S` | 22 |
| `G` | `N` | 505 |

La tabla **no tiene nombre ni email**, y el join a `PRESUDB.FUNCIONARIO` para conseguirlos está descartado y medido: 197 logins comparten 70 `FUNID`, así que devuelve el nombre de otra persona.

### 2.2 El campo `USUDTUPD`

Creado el 2026-09-01. Verificado contra `QSYS2.SYSCOLUMNS2`:

```
DATA_TYPE = TIMESTMP     DATETIME_PRECISION = 6     ORDINAL_POSITION = 16
IS_NULLABLE = Y          IS_UPDATABLE = Y           COLUMN_USAGE = BOTH
IS_IDENTITY = NO         (sin GENERATED / ROW CHANGE TIMESTAMP)
```

**Es una columna común: la base no la mantiene sola.** Los únicos triggers de la tabla son los tres de auditoría del 2026-01-22 (`USUARIOS_INS` / `USUARIOS_UPD` / `USUARIOS_DLT`, todos `AFTER ROW`), y ninguno la escribe.

Hoy **las 1.106 filas tienen el mismo valor**, `2026-09-01 10:45:15.000000`, con `COUNT(DISTINCT) = 1`: es el backfill del alta. **Todavía no se observó ni un solo movimiento real.**

> **NO VERIFICADO, y es el supuesto sobre el que se apoya la Regla B:** que los programas que escriben `ADMSEC.USUARIOS` estampen `USUDTUPD`. Si nadie los modificó, la columna queda congelada y la Regla B no se dispara nunca. La Fase 0 lo resuelve; la sección 6.1 define la vigilancia que lo detecta si igual pasa. **Esto no bloquea la Regla A**, que es el 100 % del valor de hoy (1.092 altas contra 0 cambios de estado).

Dato relacionado: el backfill dejó **18** filas en `AUDITORIA.AUDITORIA`, no 1.106 — el `ALTER` no pasó por el trigger de `UPDATE`.

### 2.3 Las dos puntas del padrón

Cruzando las 1.106 filas del origen contra las 854 de Postgres por `UPPER(TRIM(username))`:

| | |
|---|---|
| Usuarios en Postgres | **854** (853 activos, 1 inactivo) |
| Filas de ADMSEC que **no** existen en Postgres | **1.092** |
| Filas de ADMSEC que **sí** existen en Postgres | **14** |
| De esas 14, con el estado **divergente** | **0** |

La Regla B hoy no tendría nada que hacer. La Regla A tiene 1.092 candidatos.

### 2.4 Los 14 que ya están, y el riesgo que traen

Esas 14 filas son exactamente las que el job puede modificar, y entre ellas están **los dos únicos roots**:

| Usuario | Roles | En ADMSEC |
|---|---|---|
| `jgomez` | Root apps 1, 3, 5 | sí, `USUAUTAD='A'`, habilitado |
| `dmedaglia` | Root apps 1, 3, 5 y **6 — único root de Granel** | sí, `USUAUTAD='A'`, habilitado |

**El día que alguien les ponga `USUHABILITADO='N'` en Gestión de Sistemas, el job los desactiva acá dentro de la hora.** De ahí no se sale con `scripts/bootstrap-root.ts`, que se niega a operar sobre un usuario inactivo (`:153`): solo con SQL a mano contra producción. Ver 5.6.

Las otras 12 son personas con roles operativos de la aplicación 5 (Despacho, Supervisor RiogasTracking, Dashboards, DistribuidorConSAxZona). **Esa población es la que expone el escenario de reactivación de 5.3.**

### 2.5 Las cuentas que no son personas

De los 22 habilitados con `USUAUTAD='G'`, **19 son cuentas de sistema o compartidas** y 3 parecen personas (`IBELBEDER`, `JROSAS`, `NDOSANTOS`):

```
AUDITORIA  DAEMONS  DIRECTORIO  DISTRIWEB  FPROLOAUD  GPSONLINE  GRANELWEBONLINE
IGTEST  INCIDENTES  INVITADO  PEDWEBADMIN  PEDWEBPISTA  PEDWEBTOMAPED
PEDWEBTPEDCALLE  PRODUCCION  PUESTODEMO  PUESTOPRUEBA  ROOT  TALLER
```

Una se llama literalmente `ROOT`. La lista negra actual (`src/lib/usuarios/cuentasSistema.ts:5`) cubre **5** nombres: `ROOT`, `DAEMONS`, `INCIDENTES`, `PUESTOPRUEBA` y `ADMINISTRADOR`. Hace **match exacto**, sin prefijos (`:17-21`), y la variable `CUENTAS_SISTEMA` no está seteada en ningún ambiente.

### 2.6 Lo que ya está construido

`crearUsuario` (`src/app/api/db/usuarios/importar/route.ts:32-147`) hace exactamente lo que necesita la Regla A:

- normaliza el username a minúsculas, que es la convención de las filas existentes (`:37-39`);
- escribe `password: ""` a propósito, para inutilizar el fallback de clave local (`:95`);
- **`estado: ext.habilitado ? "A" : "I"` (`:107`)** — ya contempla importar deshabilitados;
- setea `esExterno:"S"`, `usuarioExterno`, `tipoUsuario:"E"`, `desdeSistema: ext.origen`, `creadoPor`;
- trunca `nombre`/`apellido`/`email` a los límites de columna;
- hace los **tres** chequeos de colisión: username, email, y el cruce username↔email, que es el que rompe `resolveUsuario`.

No lee nada del request ni de la sesión: lo único que toma del operador es la string `opts.creadoPor` (`:241`). Le falta la palabra `export`.

> ⚠️ **`crearUsuario` NO tiene tests.** La revisión lo verificó: `pnpm test` corre 11 suites y ninguna la importa — es una función privada del módulo de ruta. Los 25 tests de `scripts/test-usuarios-comparacion.ts` cubren `compararUsuarios`, el mapeo y `esCuentaSistema`, no la creación. **La Fase 1 escribe esos tests antes de mover la función**, no después.

### 2.7 Infraestructura

- **Producción: 192.168.7.4** (hostname `granel`), que corre goya:3000, secapi:3001, trackmovil:3002, granel:3003 y as400-api:5000, bajo el usuario `node`.
- **El código de producción está viejo**: faltan `src/lib/usuarios/` y la ruta de importar en secapi, y `src/routes/users.js` en as400-api. No hay `.env` en `/var/www/secapi` y `USERS_API_KEY` no está en el environ de ninguno de los dos procesos.
- **dev y prod apuntan a la misma Postgres**: `.env:5` (dev) y `pm2.config.js:37` (prod) tienen la misma `DATABASE_URL`; `.env.local` no la define. Cualquier corrida en dev **es** una escritura en producción.
- **Cero infraestructura de scheduling**: ni `node-cron`, ni `cron_restart` en `pm2.config.js`, ni jobs en los crontabs. Tampoco hay `nodemailer` ni ningún canal de notificación.
- `POST /api/db/query` del as400-api ejecuta SQL arbitrario con `qsecofr` **sin autenticación** y está desplegado en producción (`as400-api/server.js:14` lo monta sin el middleware de api-key, a diferencia de `users.js:9`). El job **no** lo usa. Es un ítem de seguridad separado de esta spec.
- **NO VERIFICADO:** `node-server` (192.168.7.13) rechaza la llave; no está descartado que corra una segunda instalación de secapi.

---

## 3. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| **D1** | **La Regla B se dispara con `USUDTUPD`** contra la marca de la última corrida exitosa | Pedido explícito del dueño, reafirmado después de informarle que la columna no la mantiene la base |
| **D2** | **La Regla A no mira `USUDTUPD`**: la existencia se decide contra el padrón completo, cada hora | Un usuario nuevo puede aparecer sin que nadie estampe la columna, y leer todo cuesta 0,12 s |
| **D3** | **Se importa toda la tabla**, incluidos los 759 deshabilitados, que nacen con `estado='I'` | Decisión del dueño. La foto queda completa y toda reactivación futura es un update, no un alta |
| **D4** | **Las cuentas de sistema se saltean y se reportan** | Decisión del dueño. Son cuentas compartidas; una se llama `ROOT` |
| **D5** | **El job nunca desactiva a un usuario con rol Root en ninguna aplicación.** Lo reporta y sigue | Los dos únicos roots están en ADMSEC (2.4) |
| **D6** | **Lo único que el job escribe sobre una fila existente es `estado`** | "Y más nada". Además deja las escrituras del job distinguibles de una baja por el panel, que sí escribe `fechaBaja` |
| **D7** | **La marca y `USUDTUPD` se comparan como TEXTO, nunca como `Date`.** Los dos valores salen del mismo reloj del AS400, por el mismo driver, con el mismo formato | Es la corrección del bug más grave que encontró la revisión: ver 5.2. De paso elimina zona horaria, horario de verano y desvío de reloj |
| **D8** | **El filtro por `USUDTUPD` se aplica en memoria, no en el `WHERE`** | Se lee la tabla entera igual por la Regla A. Evita literales de timestamp de DB2 y evita agregar parámetros a un servicio que ya expone SQL arbitrario |
| **D9** | **La primera corrida va en modo siembra, manual y supervisada** | Son ~1.073 altas de un saque |
| **D10** | **El job escribe con Prisma directo, no por HTTP** | La api-key de servicio nunca alcanza un endpoint ADMIN (`src/lib/auth/apiGuard.ts:944-951`) y escribir `estado` exige ROOT (`usuarios/[id]/route.ts:135-140`) |
| **D11** | **Dry-run por default**; escribir exige dos candados que coincidan | Con dev y prod contra la misma base, el default tiene que ser el inocuo |
| **D12** | **Los topes se evalúan solo en modo REAL.** En dry-run el plan se calcula y se registra completo, siempre | Corrección de la revisión: con los topes activos en dry-run, **las 336 corridas de la Fase 4 abortarían todas** y el relevamiento que la fase promete no se produciría nunca |
| **D13** | **El tope de altas no aborta: registra y sigue.** El de cambios de estado sí aborta | Crear un usuario sin roles y con clave vacía no es peligroso; escribir `estado` sí. Y abortar por altas contradice "si no existe, lo importa" |
| **D14** | **La reactivación (`I → A`) no es simétrica de la baja**: no se aplica sobre una fila con `fechaBaja` ni sobre una fila con roles | Corrección de la revisión: reactivar devuelve los roles que sobrevivieron al soft-delete. Ver 5.3 |
| **D15** | **El job lleva su propia lista de cuentas de sistema**, no extiende `src/lib/usuarios/cuentasSistema.ts` | Ese módulo lo consume el wizard vía `mapeo.ts` → `comparar.ts:119` (`preseleccionado`). Tocarlo cambia qué viene tildado en el wizard, y la Fase 1 promete no cambiarlo |
| **D16** | **El constraint de `estado` y el trigger anti-lockout de base quedan FUERA de esta spec** | Son más anchos que la red que ya existe y empiezan a rechazar operaciones que hoy el panel permite a propósito. La capa 1 de D5 ya impide que el job llegue ahí. Ver 5.6 y 10 |
| **D17** | **El reporte es la fila en `sincronizacion_corridas` más el log de pm2.** Sin mail | El repo no tiene ningún canal de notificación, y montarlo bloquearía la Fase 4 por algo que el dueño no pidió |

---

## 4. Alcance

**Entra:** leer `ADMSEC.USUARIOS` completa cada hora; crear en Postgres los usuarios que no existan, salteando cuentas de sistema; actualizar `estado` de los que existan cuando `USUDTUPD` avanzó y el estado difiere; registrar cada corrida y cada cambio.

**No entra:** escribir en el AS400; SGM (`GXICAGEO.USUMOBILE`); usuarios locales de secapi; asignar, quitar o espejar roles; tocar `esRoot`; desactivar por ausencia en el origen; escribir `fechaBaja`; el espejo de grupos de ADMSEC como roles de la aplicación 2; el constraint y el trigger de base (D16); cualquier canal de notificación nuevo (D17).

---

## 5. Diseño

### 5.1 El ciclo de una corrida

El orden importa: los tres estados que registran fracaso —`SALTADA_POR_LOCK`, `FALLIDA` y `EN_CURSO` huérfana— tienen que poder escribirse **antes** de tener el reloj del origen. Por eso la fila de corrida nace primero y `relojOrigen` es nullable.

```
0. INSERT de la corrida EN_CURSO (host, pid, modo, tipo; reloj_origen NULL).
   Si choca con ux_sync_una_en_curso → SALTADA_POR_LOCK, salir 0.
1. Tomar el advisory lock (5.8). Si no se puede → UPDATE a SALTADA_POR_LOCK, salir 0.
2. Leer el reloj del AS400 → UPDATE reloj_origen. Si falla → FALLIDA.
3. Leer la marca de la última corrida OK en modo REAL (5.7). Null si es la primera.
4. Leer el origen completo (0,12 s). Si devuelve 0 filas → FALLIDA.
5. Leer el padrón local: id, username, estado, fechaBaja, y sus roles.
6. Planificar en memoria (5.2 y 5.3). No escribe en `usuarios`.
7. Escribir el detalle del plan SIEMPRE, aunque después se aborte: sin eso el
   operador no tiene qué mirar para decidir.
8. Si modo REAL: evaluar los topes (5.5). El de estados puede abortar esa mitad.
9. Ejecutar, en lotes de 10, re-verificando la titularidad del lock antes de cada lote.
10. UPDATE resultado='OK' y la marca queda disponible para la corrida siguiente.
```

**La marca solo avanza si la corrida llega al paso 10.** Si falla o aborta, la corrida siguiente vuelve a ver la misma ventana: es lo que hace que una caída de una hora no pierda cambios.

### 5.2 Regla B: el estado, y el bug que la mataba

> **El hallazgo más importante de la revisión.** En el borrador anterior la comparación era `fila.USUDTUPD >= marcaAnterior` con `USUDTUPD` **string** y la marca **`Date`** de Prisma. En JavaScript eso es `ToNumber(string)` = `NaN`, y devuelve **`false` siempre**: sin excepción, sin warning, y sin que TypeScript lo vea. **La Regla B no se habría disparado jamás** — exactamente el modo de falla silencioso que esta spec dice combatir, dentro de la spec misma.
>
> Que `USUDTUPD` llega como string no es una hipótesis: node-jt400 lee todo con `ResultSet.getString()` y devuelve JSON (`as400-api/node_modules/node-jt400/dist/lib/baseConnection.js:33-35`), y JSON no tiene tipo fecha. Encima el dato cruza un segundo `JSON.stringify`/`parse` en el HTTP a as400-api. El repo ya se había quemado con esto: `as400-api/src/routes/ficha.js:76-102` existe para tolerar las tres formas.

**La corrección (D7): nunca convertir a `Date`.** Los dos valores salen del mismo reloj, por el mismo driver; se los formatea en DB2 al mismo ancho fijo y se comparan como texto, que para `YYYY-MM-DD HH:MM:SS.ffffff` es lexicográficamente correcto.

```sql
-- En as400-api. VARCHAR_FORMAT garantiza ancho fijo: sin él, ".0" y ".000000"
-- comparan mal como texto.
SELECT USUID,
       TRIM(USULOGIN)                                          AS LOGIN,
       USUHABILITADO,
       USUAUTAD,
       VARCHAR_FORMAT(USUDTUPD, 'YYYY-MM-DD HH24:MI:SS.FF6')   AS DTUPD
  FROM ADMSEC.USUARIOS

-- El reloj de la corrida, con el MISMO formato y del MISMO reloj:
SELECT VARCHAR_FORMAT(CURRENT TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF6') AS RELOJ
  FROM SYSIBM.SYSDUMMY1
```

y en el planificador:

```ts
// Los dos son string con el mismo formato de ancho fijo. Comparación de texto.
// NUNCA new Date(): ver el recuadro de arriba.
const avanzo =
  marcaAnterior !== null &&
  fila.DTUPD !== null &&
  fila.DTUPD >= marcaAnterior;

const esperado = fila.USUHABILITADO === "S" ? "A" : "I";
```

Con eso, la regla:

```ts
if (avanzo && esperado !== local.estado) {
  if (esperado === "I") {
    if (local.esRootDeAlgunaApp) → OMITIDO("ES_ROOT", alerta);          // D5
    else                        → CAMBIO_ESTADO(local.id, "A" → "I");
  } else {                                                              // I → A, D14
    if (local.fechaBaja !== null) → OMITIDO("BAJA_LOCAL_EXPLICITA", alerta);
    else if (local.tieneRoles)    → OMITIDO("REACTIVACION_CON_ROLES", alerta);
    else                          → CAMBIO_ESTADO(local.id, "I" → "A");
  }
}
```

Tres detalles que no son cosméticos:

- **`>=` y no `>`.** La marca es el instante de arranque de la corrida anterior; con `>` se pierde la fila estampada en ese microsegundo. Reprocesar es inocuo porque la escritura sólo ocurre si además el estado difiere. **Consecuencia asumida:** como hoy las 1.106 filas comparten una única `USUDTUPD`, la primera hora después de que alguien re-estampe esa columna se re-evalúan las 1.106 de golpe. Lo contiene el tope de 5.5.
- **`USUDTUPD` nula → no se toca.** La columna es nullable y nadie garantiza que todo camino de escritura la complete. Cuenta en `sinMarca` del reporte.
- **Primera corrida (`marcaAnterior === null`): la Regla B no se dispara para nadie.** Hoy las 1.106 filas tienen la misma marca del backfill, así que cualquier otro criterio las metería a todas. Se siembra la marca y listo; como hoy hay 0 divergencias, no se pierde nada real.

### 5.3 Por qué la reactivación tiene su propia regla

La dirección `I → A` no es la imagen especular de la baja, y la revisión encontró el escenario completo:

1. Una persona se va en junio. Un admin la da de baja por el panel: `DELETE /api/db/usuarios/:id` escribe `estado:'I'` **y** `fechaBaja` (`src/app/api/db/usuarios/[id]/route.ts:283-292`). **Sus filas de `usuario_roles` no se tocan** — el soft-delete no borra roles.
2. En Gestión de Sistemas nadie la dio de baja: sigue `USUHABILITADO='S'`. Que los dos padrones ya divergieron está medido: 759 deshabilitados allá contra 853 de 854 activos acá.
3. Cualquier escritura mueve `USUDTUPD` — un cambio de grupo, un re-backfill como el del 2026-09-01.
4. A la hora siguiente la Regla B la reactivaría, **con todos sus roles operativos intactos**, y podría entrar. El tope no vería nada: es un solo cambio.

Por eso D14. Y le da a `fechaBaja` un sentido operativo que antes no tenía: es la marca de "esta baja la decidió secapi", que es justo lo que D6 quería preservar al no escribirla.

### 5.4 Regla A: el alta

Para cada fila del origen que no existe en el padrón local (match `UPPER(TRIM())`, `src/lib/usuarios/comparar.ts:19`):

```ts
if (esCuentaDeSistemaDelJob(login)) → OMITIDO("CUENTA_SISTEMA");
else                                → ALTA(login,
                                           habilitado: USUHABILITADO === "S",
                                           origen: USUAUTAD === "A" ? "LDAP" : "GSIST");
```

y el ALTA se ejecuta llamando a `crearUsuario` (2.6), con `creadoPor = "sync-admsec"`. **El job no reimplementa nada de eso**, incluido `BATCH_SIZE = 10`, que se exporta del mismo módulo en vez de duplicarse (el comentario de `importar/route.ts:13-17` explica por qué es 10: el pool de Prisma revienta con 50).

La lista de cuentas de sistema **vive en el job** (D15), y aplica también a los 505 deshabilitados de `USUAUTAD='G'`, donde es razonable que haya más:

```ts
// scripts/sync-admsec/cuentas.ts — propia del job. NO se toca
// src/lib/usuarios/cuentasSistema.ts, que lo consume el wizard.
const NOMBRES = new Set([
  "AUDITORIA","DAEMONS","DIRECTORIO","DISTRIWEB","FPROLOAUD","GPSONLINE",
  "GRANELWEBONLINE","IGTEST","INCIDENTES","INVITADO","PRODUCCION",
  "PUESTODEMO","PUESTOPRUEBA","ROOT","TALLER","ADMINISTRADOR",
]);
const PREFIJOS = ["PEDWEB"];   // PEDWEBADMIN, PEDWEBPISTA, PEDWEBTOMAPED, PEDWEBTPEDCALLE
```

`ADMINISTRADOR` está en la lista porque ya está en la del wizard (2.5): omitirlo sería una regresión silenciosa.

Consecuencias que hay que aceptar por escrito:

- Las ~1.073 filas nuevas nacen **sin nombre y sin email**: `ADMSEC.USUARIOS` no los tiene. `email` es `String? @unique` y Postgres admite múltiples nulos, así que no hay colisión, pero el padrón queda con la mayoría de sus filas identificadas sólo por el username. Cuando esa persona entre por AD, el login le rellena los datos.
- 759 nacen con `estado='I'`. Ninguna nace con roles.
- El job **no tiene un balde para los errores de creación**: `crearUsuario` se traga toda excepción y devuelve `{estado:"error"}` (`importar/route.ts:141-146`). Por eso `SincronizacionDetalle.accion` admite `ERROR` y la corrida tiene contador de errores; sin eso una corrida con 1.073 altas fallidas se registraría como `OK`.

**Punto a verificar en la Fase 1, no antes:** `desdeSistema` se escribe según `USUAUTAD` y esa columna decide contra qué fuente valida la clave el login. Hay que confirmar en `src/lib/auth/resolveCredentials.ts` que una fila nueva con `'LDAP'` y una con `'GSIST'` pueden efectivamente entrar. Si una de las dos ramas no pudiera, el alta masiva crearía cuentas muertas.

### 5.5 Los topes

Se evalúan **solo en modo REAL** (D12) y **por separado para cada regla** (D13):

| Tope | Valor | Efecto |
|---|---|---|
| Filas leídas del origen | **0** | **FALLA** la corrida. Un origen vacío nunca es un dato |
| Caída del padrón del origen | **< 90 %** de la corrida anterior | **ABORTA**. Atrapa una lectura parcial |
| Cambios de estado | **> 10** | **ABORTA la Regla B**; la Regla A sigue. En 2026 hubo 77 cambios en ocho meses: diez en **una hora** es un evento, no un día movido |
| Altas | **> 25** en modo normal | **NO aborta**: ejecuta y registra `alerta='ALTAS_INUSUALES'` (D13) |

**El destrabe del tope de estados es explícito y con firma.** Sin esto, una reorganización real de 15 bajas abortaría la corrida, la marca no avanzaría, y el job abortaría 24 veces por día indefinidamente:

```
--confirmar-cambios=15  +  SYNC_ADMSEC_CONFIRMA=15
```

Los dos candados, y el número tiene que coincidir **exacto** con el plan: eso obliga a mirar el detalle antes de confirmar, y si entre la mirada y la corrida aparecieron tres más, vuelve a abortar. Queda registrado como `tipo='DESBLOQUEO'` con quién lo confirmó.

El modo **siembra** (D9) desactiva el tope de altas y sólo ese.

### 5.6 La protección del root

**Una sola capa, en el planificador, y es suficiente.** Si el plan iba a poner en `'I'` a un usuario que tiene un rol Root vigente en cualquier aplicación, se convierte en `OMITIDO` con motivo `ES_ROOT` y alerta — porque es un desacuerdo real entre los dos sistemas que alguien tiene que resolver a mano.

**El criterio de "es root" no se reimplementa**: se usa `aplicacionesRootDeUsuario` de `src/lib/permisos.ts:272` tal cual. Es importante, porque el código tiene una definición tolerante y hay tres formas de equivocarse:

| | criterio real (`src/lib/permisos.ts:225-247`) |
|---|---|
| nombre | `trim().toLowerCase() === "root"` — `'root'`, `'ROOT'` y `' Root '` son tres filas distintas para Postgres y **las tres son root** para el código (`src/lib/auth/apiGuard.ts:290` lo documenta) |
| `roles.estado` | exige `'A'` |
| `aplicaciones.estado` | exige `'A'` — un rol Root de una aplicación dada de baja no otorga root |
| vigencia | mira `fecha_desde` **y** `fecha_hasta`. Hoy hay un caso vivo: `jgomez` tiene su Root de la app 1 con `fecha_desde = 2026-08-10` |

Reimplementarlo con `nombre = 'Root'` a secas —que es lo que hacía el borrador anterior— construye el lockout que pretende evitar: si el rol se llamara `ROOT`, el chequeo no lo ve, el job desactiva y nadie lo frena.

**Lo que NO entra en esta spec (D16):** el `CHECK (estado IN ('A','I'))` y el trigger anti-lockout de base. Los dos son defendibles, pero:

- el `CHECK` protege contra algo que este job no puede producir (5.2 calcula `esperado` con un ternario que sólo devuelve `'A'`/`'I'`); lo que realmente arregla es que `PUT /api/db/usuarios/:id` escribe `body.estado` sin validar, que es un bug preexistente y de otro dueño;
- el trigger es **más ancho** que la red que ya existe: `usuariosRootDeSecapi` (`src/lib/permisos.ts:321-327`) está acotada a la aplicación 1, así que hoy el panel permite a propósito dar de baja a `dmedaglia` —único root de la app 6— porque queda `jgomez` como root de secapi. Un trigger multi-aplicación empieza a rechazar eso, con un mensaje de Postgres que ninguna pantalla sabe mostrar.

Quedan anotados en la sección 10 como trabajo separado, con la corrección de criterio de arriba ya escrita para cuando se encaren.

**Escalera de incendio.** `scripts/bootstrap-root.ts:153` se niega a operar sobre un usuario inactivo, que es exactamente la situación de un lockout. La Fase 2 le saca esa restricción y deja el runbook en el repo: **primero cortar el job** (`pm2 stop sync-admsec`, si no la próxima hora revierte), reactivar, devolver el rol, verificar desde la base, y **probar el login de verdad** — que un `UPDATE` no dé error no es lo mismo que poder entrar.

### 5.7 Modelo de datos

Convenciones tomadas de `prisma/schema.prisma`: PascalCase con `@@map` a snake_case plural, `id Int @id @default(autoincrement())`, `DateTime @db.Timestamp(6)`, sin `enum`.

```prisma
model SincronizacionCorrida {
  id            Int       @id @default(autoincrement())

  /// NORMAL | SIEMBRA | DESBLOQUEO
  tipo          String    @default("NORMAL") @db.VarChar(12)
  /// DRY_RUN | REAL — el modo RESUELTO, no el pedido
  modo          String    @db.VarChar(8)
  /// EN_CURSO | OK | ABORTADA | FALLIDA | SALTADA_POR_LOCK
  /// Nace EN_CURSO: si el proceso muere, la fila queda así y eso es el dato.
  resultado     String    @default("EN_CURSO") @db.VarChar(20)
  motivo        String?

  inicio        DateTime  @default(now()) @db.Timestamp(6)
  fin           DateTime? @db.Timestamp(6)

  /// Quién escribió. Load-bearing: dev y prod comparten base.
  host          String?   @db.VarChar(60)
  pid           Int?

  /// El reloj del AS400 al arrancar, como TEXTO y con el formato de ancho fijo
  /// de 5.2. Es TEXTO a propósito (D7): convertirlo a DateTime reintroduce el
  /// bug de tipos y la zona horaria. NULLABLE: una SALTADA_POR_LOCK o una
  /// FALLIDA por AS400 caído nunca llega a leerlo, y son las que más importa
  /// registrar. Invariante: resultado='OK' implica reloj_origen NOT NULL.
  relojOrigen   String?   @map("reloj_origen") @db.VarChar(32)
  /// La marca que esta corrida usó como piso.
  marcaUsada    String?   @map("marca_usada") @db.VarChar(32)

  origenFilas   Int?      @map("origen_filas")
  padronLocal   Int?      @map("padron_local")
  altas         Int?
  cambiosEstado Int?      @map("cambios_estado")
  omitidos      Int?
  errores       Int?
  sinMarca      Int?      @map("sin_marca")
  /// MARCA_NO_CONFIABLE | MARCA_CONGELADA | ALTAS_INUSUALES | SUPERARIA_TOPE
  alerta        String?   @db.VarChar(40)

  detalles      SincronizacionDetalle[]

  @@index([inicio], map: "idx_sync_corridas_inicio")
  @@index([resultado], map: "idx_sync_corridas_resultado")
  @@map("sincronizacion_corridas")
}

model SincronizacionDetalle {
  id            Int      @id @default(autoincrement())
  corridaId     Int      @map("corrida_id")
  corrida       SincronizacionCorrida @relation(fields: [corridaId], references: [id])

  login         String   @db.VarChar(60)      // el del AS400, sin normalizar
  usuarioId     Int?     @map("usuario_id")   // null en un ALTA de dry-run
  /// ALTA | ACTIVAR | DESACTIVAR | OMITIDO | ERROR
  accion        String   @db.VarChar(12)
  valorAnterior String?  @map("valor_anterior") @db.Char(1)
  valorNuevo    String?  @map("valor_nuevo") @db.Char(1)
  /// La USUDTUPD de esa fila, como texto: la evidencia de por qué se tocó
  marcaOrigen   String?  @map("marca_origen") @db.VarChar(32)
  /// CUENTA_SISTEMA | ES_ROOT | BAJA_LOCAL_EXPLICITA | REACTIVACION_CON_ROLES
  /// | SIN_MARCA | COLISION | <mensaje de error>
  motivo        String?  @db.VarChar(120)

  @@index([corridaId], map: "idx_sync_detalle_corrida")
  @@index([login], map: "idx_sync_detalle_login")
  @@map("sincronizacion_detalle")
}
```

Más el cinturón que no vive en ninguna conexión (5.8):

```sql
-- Sólo puede haber UNA corrida EN_CURSO. Sobrevive a la caída de cualquier
-- conexión y queda auditable en la tabla, no en pg_locks.
CREATE UNIQUE INDEX ux_sync_una_en_curso
  ON sincronizacion_corridas ((1))
  WHERE resultado = 'EN_CURSO';
```

**Política de huérfanas, obligatoria:** si la fila `EN_CURSO` tiene `inicio < now() - interval '2 hours'`, se la marca `FALLIDA` con motivo `HUERFANA` y se reintenta una vez. Sin esto, un job que muere deja la sincronización trabada para siempre.

La marca de la última corrida **no vive en una tabla aparte**:

```sql
SELECT reloj_origen FROM sincronizacion_corridas
 WHERE resultado = 'OK' AND modo = 'REAL' AND reloj_origen IS NOT NULL
 ORDER BY inicio DESC LIMIT 1;
```

A 24 corridas por día son ~8.800 filas al año: no necesita purga. **`updatedAt` en `usuarios` no se agrega**: un `@updatedAt` de Prisma se dispara en toda actualización, incluidas las de las cuatro apps que consumen secapi, y el rastro de lo que hizo el job ya está en `sincronizacion_detalle`.

### 5.8 Runtime

**Dónde vive.** `scripts/sync-admsec.ts`. No es un endpoint: no hace falta exponer superficie nueva para algo que corre solo.

**El lock — y por qué el diseño obvio no funciona.** `pg_try_advisory_lock` es un lock **de sesión**, y una sesión es una conexión. `prisma` es un pool sin `connection_limit` en la URL, así que Prisma usa `cpus*2+1` = **25 conexiones** en este servidor. La revisión lo midió: un lote de 10 se reparte en **10 backends distintos**, y el lock vive en uno solo. Cuando esa conexión se cae —reciclado, blip de red, `pg_terminate_backend`— el lock desaparece sin un error, el job sigue escribiendo y el gemelo entra. Peor: la excepción de esa única conexión cae dentro de un `crearUsuario`, cuyo `catch` (`importar/route.ts:141-146`) la traduce a "este usuario falló" y sigue.

```ts
const LOCK_KEY = 4726001;   // clave fija, documentada acá. No reusar.

/** Cliente DEDICADO al lock: connection_limit=1, así el lock de sesión vive
 *  en la única conexión que este cliente tiene. El `prisma` de trabajo sigue
 *  siendo el del pool y no se toca. */
function clienteDeLock(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "0");
  return new PrismaClient({ datasourceUrl: url.toString(), log: ["error"] });
}

async function tomarLock(): Promise<boolean> {
  const [f] = await lockDb.$queryRaw<{ ok: boolean; pid: number }[]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS ok,
           pg_backend_pid()::int                     AS pid`;
  if (!f.ok) return false;
  backendDelLock = f.pid;
  return true;
}

/** ANTES DE CADA LOTE. No alcanza con volver a pedir el lock: si la conexión
 *  se cayó y Prisma reconectó, pg_try_advisory_lock devuelve true otra vez
 *  sobre una sesión NUEVA — eso no es "sigo siendo el dueño", es "lo perdí y
 *  lo volví a tomar", con una ventana en el medio. Por eso se compara el pid. */
async function sigoSiendoElDueno(): Promise<boolean> {
  const [f] = await lockDb.$queryRaw<{ pid: number; tengo: boolean }[]>`
    SELECT pg_backend_pid()::int AS pid,
           EXISTS (SELECT 1 FROM pg_locks
                    WHERE locktype='advisory' AND classid=0
                      AND objid=${LOCK_KEY}::oid AND objsubid=1
                      AND pid=pg_backend_pid()) AS tengo`;
  return f.tengo && f.pid === backendDelLock;
}

// $executeRaw, NO $queryRaw: pg_advisory_unlock_all() devuelve void y
// $queryRaw falla con "Failed to deserialize column of type 'void'".
async function soltarLock() {
  try { await lockDb.$executeRaw`SELECT pg_advisory_unlock_all()`; } catch {}
  await lockDb.$disconnect();
}
```

Si `sigoSiendoElDueno()` da falso, la corrida cierra en `FALLIDA` con motivo `LOCK_PERDIDO` y **la marca no avanza**. Todo va dentro de `try/finally` con `soltarLock()` en el `finally`.

*(Lo que no sirve: `pg_advisory_xact_lock` envolviendo la corrida entera en un `$transaction`. Resuelve el lock, pero el timeout default de una transacción interactiva de Prisma es 5 s, y sobre todo una sola transacción para 1.073 altas significa que un solo rechazo tira abajo la corrida completa.)*

**Modo.** Dos candados que tienen que coincidir: `SYNC_ADMSEC_MODO=REAL` **y** `--real`. Cualquier otra combinación resuelve a `DRY_RUN`. Se guarda el modo resuelto, no el pedido.

**Entrada de pm2** — es lo único que inyecta `DATABASE_URL` en producción, donde no hay `.env`:

```js
{
  name: "sync-admsec",
  script: "node_modules/.bin/tsx",
  args: "scripts/sync-admsec.ts",
  cwd: "/var/www/secapi",
  cron_restart: "0 * * * *",     // el intervalo se cambia acá
  autorestart: false,            // es un job, no un servicio
  env: { ...envDeSecapi, SYNC_ADMSEC_MODO: "DRY_RUN", TZ: "America/Montevideo" },
}
```

`autorestart:false` es lo que convierte a pm2 en scheduler: sin eso, al terminar el proceso pm2 lo relanza en loop.

**Fallo.** No reintenta dentro de la misma hora: sale distinto de 0, deja la fila en `FALLIDA`, y la corrida siguiente ve la misma ventana porque la marca no se movió.

**Reporte (D17).** La fila de `sincronizacion_corridas` y el log de pm2. Una consulta de una línea da el estado del día; cuando haga falta una pantalla, va como trabajo aparte.

---

## 6. Trampas conocidas

### 6.1 El punto ciego de la Regla B, y cómo se lo detecta

Si los programas del AS400 no estampan `USUDTUPD`, la Regla B no se dispara nunca y el job reporta corridas OK con `cambiosEstado: 0` indefinidamente. No falla nada.

La detección **sale gratis**, porque el job ya lee el padrón completo por la Regla A: en cada corrida se cuenta cuántas filas tienen el estado divergente **sin** que `USUDTUPD` haya avanzado. Hoy ese número es 0 (2.3).

- `divergentesSinMarca > 0` → alerta **`MARCA_NO_CONFIABLE`**. Alguien cambió un estado allá sin que la columna se moviera.
- **El job igual no los toca**: la regla que pidió el dueño es la que manda. La alerta es información, no una excepción.
- Si pasan **más de 30 días** sin que ninguna fila mueva `USUDTUPD` → alerta **`MARCA_CONGELADA`**. Con ~10 cambios de estado por mes medidos, un mes sin un solo movimiento es sospechoso, no tranquilizador.

### 6.2 El re-backfill masivo

Si alguien vuelve a correr un `UPDATE` masivo sobre `USUDTUPD`, las 1.106 filas quedan por encima de la marca de golpe. La Regla B las evalúa a todas pero **sólo escribe donde el estado además difiere**, así que el daño está acotado por definición, y el tope de 10 cambios lo corta igual. La firma en el reporte es una corrida abortada con `origenFilas: 1106` y un plan enorme: hay que saber reconocerla.

### 6.3 La primera corrida

~1.073 altas, cada una con tres queries de colisión antes del `create`. Va en modo siembra, a mano, en horario de trabajo, con dry-run inmediatamente antes. Del dry-run salen las dos listas que hay que mirar: **los omitidos por cuenta de sistema** —el relevamiento real de 2.5 aplicado también a los 505 deshabilitados— y **las colisiones de identidad**, que `crearUsuario` detecta y reporta sin crear.

Como no es reanudable, si muere a mitad de camino se vuelve a correr: las altas ya hechas salen como omitidas por el chequeo de existencia, que es idempotente.

### 6.4 El padrón se duplica, y se ve

De 854 a ~1.946 filas. **La mayoría de las filas nuevas no tienen nombre ni email.** Antes de la siembra conviene mirar qué pantallas de usuarios cargan todo sin paginar: es el tipo de cambio que convierte una pantalla aceptable en una lenta. No es parte de esta spec arreglarlo, pero sí anticiparlo.

### 6.5 El plan y la ejecución no cuentan lo mismo

Los topes se evalúan sobre el plan, pero las colisiones de identidad las descubre `crearUsuario` recién al ejecutar. Los contadores finales de la corrida pueden no coincidir con los que pasaron el tope, y está bien que así sea: el detalle registra las dos cosas.

### 6.6 Dos instancias, una base

Mientras no se confirme qué corre en `node-server` (2.7) y mientras dev y prod compartan Postgres, el lock de 5.8 más el índice único de 5.7 son lo único que separa una corrida de dos. No se quitan "porque en prod corre uno solo".

---

## 7. Prerequisitos de despliegue

| # | Qué | Quién |
|---|---|---|
| 1 | **Desplegar `dev` a producción**: secapi (falta `src/lib/usuarios/` y la ruta de importar) **y** as400-api (falta `src/routes/users.js`) | nosotros + ventana |
| 2 | **Crear `USERS_API_KEY`** en el entorno de los **dos** procesos de producción | Infra |
| 3 | Confirmar qué corre en `node-server` (192.168.7.13), hoy inaccesible por llave | Infra |
| 4 | Migración de Prisma con las dos tablas y el índice único parcial (5.7) | nosotros |

La confirmación de si los programas del AS400 estampan `USUDTUPD` **no es un prerequisito de despliegue**: es la Fase 0, corre en paralelo y sólo condiciona el paso de la Regla B a modo real. La Regla A no la necesita.

---

## 8. Criterios de aceptación

1. Con el padrón sincronizado, una corrida termina `OK` con `altas=0` y `cambiosEstado=0`, y **no escribe ninguna fila** en `usuarios`. Se comprueba con un hash de `(id, estado)` antes y después.
2. Un usuario presente en el origen y ausente en Postgres se crea con `estado` correcto según `USUHABILITADO`, `password=""`, `esExterno='S'`, `creadoPor='sync-admsec'` y **cero roles**.
3. **`USUDTUPD` y la marca se comparan como texto y la comparación funciona.** Test unitario directo: una fila con marca posterior da `avanzo=true`, una anterior da `false`, y **ninguna comparación involucra un `Date`**. Es el test que habría atrapado el bug de 5.2.
4. Un usuario cuyo `USUHABILITADO` cambia **sin** que `USUDTUPD` avance no se modifica, y la corrida reporta `alerta='MARCA_NO_CONFIABLE'` con esa fila en el detalle.
5. Un usuario cuyo `USUHABILITADO` cambia **y** cuya `USUDTUPD` avanza se modifica, y **sólo** en `estado`: `fechaBaja`, `desdeSistema` y el resto quedan intactos.
6. Un usuario con rol Root que el origen manda desactivar **no se desactiva**: `OMITIDO` con motivo `ES_ROOT`. El criterio de root se toma de `aplicacionesRootDeUsuario`, y el test incluye un rol llamado `'ROOT'` en mayúsculas para probar que la comparación es tolerante.
7. Un usuario dado de baja por el panel (`estado='I'` **con** `fechaBaja`) que el origen manda activar **no se reactiva**: `OMITIDO` con motivo `BAJA_LOCAL_EXPLICITA`.
8. Un usuario inactivo **con roles** que el origen manda activar **no se reactiva**: `OMITIDO` con motivo `REACTIVACION_CON_ROLES`.
9. Dos ejecuciones simultáneas: la segunda registra `SALTADA_POR_LOCK` y sale 0 sin escribir. Se prueba además matando la conexión del lock a mitad de corrida: la corrida cierra en `FALLIDA` con `LOCK_PERDIDO` y la marca no avanza.
10. Una corrida que aborta por tope **no mueve la marca** y **sí escribe el detalle del plan**.
11. En `DRY_RUN`, un plan de 1.073 altas termina `OK` con el detalle completo y `alerta='SUPERARIA_TOPE'` — **no aborta**. Es lo que hace que la Fase 4 sirva de relevamiento.
12. Sin `SYNC_ADMSEC_MODO=REAL` **y** `--real`, ninguna invocación escribe en `usuarios`. Se prueban las cuatro combinaciones.
13. Un origen que devuelve 0 filas produce `FALLIDA` y ninguna escritura.
14. Una fila `EN_CURSO` de más de 2 horas se marca `HUERFANA` y la corrida siguiente arranca igual.

## 9. Plan por fases

**Fase 0 — validar `USUDTUPD` (en paralelo, no bloquea).** Preguntar a quien creó la columna si además se modificaron los programas de escritura, o si conviene un trigger `BEFORE UPDATE` que la haga inmune a qué programa escriba. En paralelo, observar: `COUNT(DISTINCT USUDTUPD)` y `MAX(USUDTUPD)` una vez por día, cruzado contra `AUDITORIA.AUDITORIA`. **Gatea solo el pasaje de la Regla B a modo real.**

**Fase 1 — la fuente y la extracción.** En este orden:
1. **Escribir los tests de caracterización de `crearUsuario` primero** (2.6): hoy no tiene ninguno y la extracción se apoya en "no cambiar comportamiento".
2. Mover `crearUsuario`, `Estado`, `Detalle`, `ROL_DESPACHO_SGM` y `BATCH_SIZE` a `src/lib/usuarios/importar.ts`, con `export`. El handler `POST` queda entero en la ruta.
3. En `as400-api/src/routes/users.js`: agregar `USUDTUPD` con `VARCHAR_FORMAT` (5.2) y **dejar de descartar `USUID`** — hoy `:92` hace `rows.map(({ ID, ...r }) => ...)`.
4. Hacer que el dato **atraviese las tres capas**: `FilaAdmsec` (`src/lib/usuarios/sources/mapeo.ts:29-38`), `mapearFilaAdmsec` (`:87-105`) y `ExternalUser` (`src/lib/usuarios/tipos.ts`). Sin esto la Regla B no tiene entrada, y el borrador anterior lo daba por hecho.
5. Verificar el punto de `desdeSistema` y el login (5.4).

El wizard tiene que seguir andando **exactamente** igual, y los 25 tests de `scripts/test-usuarios-comparacion.ts` en verde. La decisión de agosto de que "el import sólo crea, nunca actualiza" sigue vigente **para el wizard**: el que actualiza es el job.

**Fase 2 — la escalera de incendio.** Sacarle a `bootstrap-root.ts` la restricción de `:153` y dejar el runbook escrito. Va antes que el job: es la red, y se pone antes de subir al trapecio.

**Fase 3 — datos y planificador.** Las dos tablas más el índice único, y el planificador **puro** (entra origen + padrón, sale el plan) con sus tests unitarios, sin escribir en `usuarios`. Acá se cubren los criterios 3 a 8 y el 11 sin tocar la base.

**Fase 4 — el job en dry-run.** Instalado, corriendo cada hora, escribiendo sólo sus propias tablas. **Unos días alcanzan**, no dos semanas: por construcción `cambiosEstado` va a ser 0 todos los días mientras la marca esté sembrada y `USUDTUPD` congelada, así que después del primer día no se aprende nada nuevo. De acá salen la lista real de cuentas de sistema y las colisiones.

**Fase 5 — la siembra.** Manual, supervisada, en horario de trabajo, con el dry-run revisado inmediatamente antes. ~1.073 altas.

**Fase 6 — modo real.** El job pasa a escribir. Después de la siembra, una corrida normal debería ser casi siempre un no-op.

## 10. Riesgos aceptados y trabajo separado

**Aceptados:**

- **`USUDTUPD` puede no estar mantenida.** Se corre con la Regla B tal como la pidió el dueño; 6.1 detecta el caso y avisa, pero no lo corrige.
- **Dev y prod comparten Postgres.** Cualquier corrida en dev escribe en el padrón de producción. Lo contienen el default dry-run y el lock, no la separación de ambientes.
- **El job escribe con Prisma directo**, salteando la red de los handlers. Lo compensan la capa de 5.6 y los topes de 5.5.
- **El padrón se duplica** y la mayoría de las filas nuevas quedan sin nombre ni email hasta el primer login.
- **La siembra no es reanudable.** Se vuelve a correr y las ya hechas salen omitidas.

**Trabajo separado, identificado acá pero fuera de alcance (D16):**

- `PUT /api/db/usuarios/:id` escribe `body.estado` sin validar (`src/app/api/db/usuarios/[id]/route.ts:135-139`): un valor que no sea `'A'`/`'I'` produce un usuario que loguea pero come 401 en todo `/api/db`. El arreglo barato es un 400 en el handler.
- `verificarQueQuedaRoot` sólo mira la aplicación 1 (`src/lib/permisos.ts:321-327`), así que **`dmedaglia`, único root de Granel, hoy no está protegido por nada** salvo la capa de 5.6 de este job. Extenderlo a todas las aplicaciones es deseable y toca 7 call sites.
- `POST /api/db/query` del as400-api, sin autenticación y en producción (2.7).
