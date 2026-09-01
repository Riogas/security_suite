# Sync nocturno de usuarios: Gestión de Sistemas → secapi

**2026-09-01** · repo `security_suite` (Next.js 16 + Prisma/Postgres, con `as400-api/` adentro) · rama `dev`, HEAD `9205bc0` · estado: **propuesta**

---

## 1. Problema y objetivo

Cuando Gestión de Sistemas da de baja a alguien en el AS400, esa persona sigue entrando a secapi. `ADMSEC.USUARIOS` es el padrón donde la empresa registra quién trabaja y quién no —1.106 filas, 347 habilitadas— y `usuarios` de Postgres es el padrón que gobierna el acceso a las cuatro aplicaciones que consumen el servicio de RBAC (goya, secapi, trackmovil, granel). Los dos existen, los dos se mantienen, y **nada los conecta en el sentido que importa**: el import del wizard de agosto solo crea, nunca actualiza, así que un usuario migrado queda congelado en el estado que tenía el día que se lo importó. El caso auditable ya está identificado y es de hace una semana: `DGUERRERO` (USUID 3922) está en `USUHABILITADO='N'` desde el 2026-08-24 —con `USUFCHULTDESACTIVACION='20260824'`, o sea que del otro lado lo dieron de baja en forma— y en Postgres sigue activo. No es un incidente: es el estado normal del sistema, y va a repetirse ~10 veces por mes, que es la frecuencia medida de cambios de estado en el origen (77 en los primeros ocho meses de 2026: 51 bajas y 26 reactivaciones).

El objetivo de este trabajo es **un job nocturno que replique el estado de una cuenta desde `ADMSEC.USUARIOS` hacia `usuarios`, y nada más que el estado**. No sincroniza nombres, ni mails, ni roles, ni permisos: escribe `usuarios.estado` (`'A'`/`'I'`) sobre un conjunto explícito y aprobado de usuarios, deja registro de cada decisión con la evidencia que la produjo, y manda un reporte todas las mañanas. El pedido nació de una columna nueva —`USUDTUPD`, que el dueño hizo crear hoy en `ADMSEC.USUARIOS` para guardar la fecha de última modificación— y de la idea razonable de leer nada más que lo que cambió. La medición dice que esa columna todavía no se mueve (§2.1), así que la spec cumple el pedido de otra forma: **el que decide es un snapshot completo del padrón, que cuesta 0,12 s, y `USUDTUPD` viaja en el reporte de todas las noches como señal de salud** (D10). El segundo objetivo, que no estaba en el pedido pero es condición para hacer el primero, es **que este job no pueda dejar a la empresa afuera de sus propios sistemas**: hoy la red que impide quedarse sin administrador vive en cinco handlers HTTP y un job con Prisma directo la saltea entera, así que la mitad de esta spec es la red que hay que construir antes de escribir la primera fila (§5.5).

---

## 2. Contexto verificado

Todo lo de esta sección se midió el **2026-09-01** contra los sistemas reales (AS400 vía el as400-api de node-dev, solo `SELECT`; Postgres `192.168.2.117/securitysuite`, PostgreSQL 15.19; y el árbol en `9205bc0`). Lo que no se pudo medir va marcado **NO VERIFICADO** y no se usa como premisa de ninguna decisión.

### 2.1 El campo nuevo: `USUDTUPD` es una columna común, y todavía no se movió

Es el corazón del pedido y el hecho que más condiciona el diseño, así que va sin ablandar:

- **Es una columna común.** `TIMESTMP`, `DATETIME_PRECISION 6`, `IS_NULLABLE=Y`, `ORDINAL_POSITION=16`, `BUFFER_POSITION=234`, y —lo que decide todo— **`IS_UPDATABLE=Y`, `COLUMN_USAGE=BOTH`, `IS_IDENTITY=NO`, sin `GENERATED` y sin `ROW CHANGE TIMESTAMP`**. DB2 no la mantiene sola.
- **No hay ningún trigger que la escriba.** Los únicos tres triggers de `ADMSEC.USUARIOS` son los de auditoría creados el **2026-01-22**: `USUARIOS_INS` / `USUARIOS_UPD` / `USUARIOS_DLT`, todos `AFTER ROW`, programas `USUAR00001` / `USUAR00005` / `USUAR00006`, `ENABLED=Y`, `OPERATIVE=Y`. Ninguno toca `USUDTUPD`, y los tres son anteriores a que la columna existiera.
- **Por lo tanto su mantenimiento depende enteramente de que los programas RPG/GeneXus que escriben `ADMSEC.USUARIOS` la escriban.** Si nadie los modificó, la columna queda congelada en su valor de alta para siempre.
- **Hoy las 1.106 filas tienen exactamente el mismo valor: `2026-09-01 10:45:15.000000`.** `COUNT(*)=1106`, `COUNT(USUDTUPD)=1106` (cero nulos), `COUNT(DISTINCT USUDTUPD)=1`, `MIN=MAX`. Es el backfill del alta de la columna, nada más.
- **Todavía no se observó ni un solo movimiento real.** Re-medido a las 11:02:41 y a las 11:19:47 del mismo día: `COUNT(DISTINCT)` seguía en 1. Y hay evidencia positiva de escrituras que *no* la sellan: `USUID=7070` (`CALLA512`) tiene `USUCURLOGIN=2026-09-01 11:00:44` con `USUDTUPD=2026-09-01 10:45:15` —o sea que el programa de login escribió la fila y no tocó la columna—, y a las 11:21 había **5 filas con `USUCURLOGIN > USUDTUPD`**. Peor: `USUID=3` (dmedaglia) tiene `USUFCHPERMISOS=10:45:16 > USUDTUPD`, con su entrada de auditoría `AUDID=103228074`, `AUDAPP='VB6'` — o sea que **el camino de mantenimiento tampoco la selló**.
- **Qué hace falta para confirmarlo, exactamente:** observar **una entrada de `AUDITORIA` con `(USUHABILITADO)` en `AUDATRIB` cuyo `USUID` tenga después un `USUDTUPD ≥ ese `AUDFCHHORA`**. Eso —y solo eso— prueba que el programa que da de baja sella la columna. Nada de lo medido hoy lo prueba, porque desde que la columna existe no hubo ningún cambio de estado en el origen (en los últimos 7 días: 954 entradas de auditoría para `USUARIOS` y **cero** con `(USUHABILITADO)`). El procedimiento para conseguir esa observación sin escribir en el AS400 está en la Fase 0 (§9), y su resultado no bloquea el job: bloquea solo el modo incremental (D10).
- **NO VERIFICADO: que `USUDTUPD` se mantenga viva.** Es la hipótesis con menos evidencia a favor de todas las de esta spec. El diseño está escrito para que dé lo mismo.
- El precedente está en la misma tabla y tiene nombre: **`USUFCHPERMISOS`** promete "fecha de permisos" y se estampa en lote por grupo (159 valores distintos para 1.106 filas), y **no se movió en ninguno de los 77 cambios de estado de 2026**. Un campo con nombre de timestamp que no se mueve por el motivo que promete no es un dato faltante: es un dato que miente en verde.

### 2.2 El testigo: `AUDITORIA.AUDITORIA` no es un testigo, es el feed

Esto lo cambió la revisión adversarial y es el hallazgo que más simplifica el diseño:

- La mantienen los tres triggers, es independiente de `USUDTUPD`, y tiene **4.256 entradas para `USUARIOS` desde el 2026-08-01**. Piso medido de actividad: el día más flojo reciente (2026-08-25) tuvo **64 entradas**, y hay días de 127 / 124 / 114.
- **Trae la fila entera antes y después.** `AUDVALANT` y `AUDVALNUE` (CLOB) llevan los valores pipe-delimitados en el mismo orden que `AUDATRIB`. Fila real, `AUDID=103076221`, la baja de DGUERRERO del 2026-08-24 14:02:54.643545:
  ```
  ATRIB: USUAUTAD|USUCURLOGIN|USUFCH|USUFCHPERMISOS|(USUFCHULTDESACTIVACION)|(USUHABILITADO)|USUID|USULOGIN|…
  VANT : A|2023-02-23-18.26.00.000000|20150605|2026-07-28-11.21.41.000000|00000000|S|3922|DGUERRERO|…
  VNUE : A|2023-02-23-18.26.00.000000|20150605|2026-07-28-11.21.41.000000|20260824|N|3922|DGUERRERO|…
  ```
  O sea: `USUID`, `USULOGIN`, `S → N`, la fecha de desactivación y el `USUAUTAD`, **sin tocar `ADMSEC.USUARIOS`**.
- **`AUDID` es `IS_IDENTITY='YES'`** (`QSYS2.SYSCOLUMNS2`). Es un entero monótono asignado por la base: sirve de cursor y no depende de ningún reloj. El índice `AUDITU1` tiene `AUDFCHHORA` como primera clave y `AUDID` como segunda.
- **Convenciones confirmadas:** en `UPD`, `AUDATRIB` es la lista alfabética de columnas con las cambiadas entre paréntesis (validado 300/300); en `INS` son las mismas columnas en orden físico y **sin** paréntesis (`AUDID=103076199`), por eso los `INS` se detectan por `AUDTIPOMOV` y nunca por el paréntesis. `AUDATRIB` lista **14 columnas, no 16**: los programas de trigger se compilaron el 2026-01-22 y no conocen `USUGAMID` ni `USUDTUPD`. `AUDPK` viene como texto literal `USUID=<n>`. `AUDDB='ADMSEC'` en las 954 entradas de la última semana.
- **`AUDUSUARIO` es SIEMPRE `'UNKNOWN'`.** Y **`AUDAPP` no discrimina el programa**: las tres desactivaciones más recientes (`103076221` DGUERRERO 24/8, `102971130` VHUGO 20/8, `102817299` AGTEST 17/8) salieron las tres con `AUDAPP='ULOGIN'`, el mismo valor que los logins; `AUDAPP='VB6'` tiene 2 filas en total desde el 2026-08-01 y ninguna toca `USUHABILITADO`. **La columna que separa escritores es `AUDUSUCON`** (`GXGSISTEMA`, `GXGSIST5` con 1.247 filas, etc.).
- **El punto ciego que comparte con `USUDTUPD`:** las dos dependen de que la escritura pase por el programa. **El backfill de hoy lo demuestra: movió 1.106 filas y dejó cero filas de auditoría.** (La entrada de las 10:45:15.374896 que parece el backfill es `AUDID=103228074`, `AUDPK='USUID=3'`: un guardado de permisos de un solo usuario.) Un `UPDATE` masivo por STRSQL, o una carga con los triggers apagados —tienen flags `ENABLED`/`OPERATIVE` justamente porque se apagan—, es invisible para los dos. Por eso el detector primario no puede ser ninguno de los dos (D10).
- **Costos medidos:** ventana de 24 h → 250 filas, 0,47 s. Ventana de 40 h con el `LIKE` sobre el CLOB → 2,3 s. Ventana de 7 días → 954 filas, **8,1 s**. Regla: ventanas de 24–48 h, nunca rangos abiertos.
- **Gotcha de CLOB:** siempre `CAST(SUBSTR(col,1,N) AS VARCHAR(N))`. Un `SELECT` multi-fila de CLOBs crudos por `node-jt400` volvió vacío en las pruebas.

### 2.3 Las dos puntas del padrón

**`ADMSEC.USUARIOS` (origen).** 16 columnas (15 + `USUDTUPD`), 1.106 filas, **347 con `USUHABILITADO='S'`** y 759 con `'N'` — ratio de habilitados **0,314**. `USUID` DECIMAL(6), `USULOGIN` CHAR(15), `USUHABILITADO` CHAR(1), `USUAUTAD` CHAR(1) (`'A'` = viene del Active Directory, cualquier otra cosa = GSIST), `USUFCHULTDESACTIVACION` CHAR(8) `yyyymmdd` (761 filas en `'00000000'` y 86 habilitados arrastrando fecha vieja: **orientativa, nunca decide nada**). **No tiene nombre ni email**, y el join a `PRESUDB.FUNCIONARIO` está descartado porque devuelve nombres de otra persona. Un `SELECT` completo de las 1.106 filas tarda **0,12 s** medido: ningún argumento de performance justifica ninguna decisión de este documento. Los logins colapsan de 1.106 a **1.102** al normalizar: hay **4 duplicados** medidos — `CLARRAMENDI` (USUID 609 con `AUTAD='A'` y 839 con `'G'`), `GMATATELO` (6406/6423), `LSILVERA` (6419/6420), `VVINOLES` (95/585). Las 4 están hoy en `'N'` de los dos lados y ninguna existe en Postgres. De los 22 GSIST activos, **~18 son robots o cuentas compartidas** (`DAEMONS`, `PRODUCCION`, los cuatro `PEDWEB*`, una llamada literalmente `ROOT`), y la lista negra que existe (`src/lib/usuarios/cuentasSistema.ts:5`) cubre **cinco** nombres —`ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR`— con la env `CUENTAS_SISTEMA` (`:8`) sin setear en ningún ambiente.

**`usuarios` de Postgres (destino).** 854 filas: **853 en `'A'` y 1 en `'I'`** (`despacho`, id 1). **No tiene `updatedAt` ni ninguna fecha de modificación.** `estado` es `Char(1)` con default `'A'` (`prisma/schema.prisma:33`) y **no está validado en ningún lado**: `pg_constraint` sobre `usuarios::regclass` devuelve solo `usuarios_pkey`, `usuarios_username_key` y `usuarios_email_key`; `pg_trigger` no interno devuelve **vacío**. Escribir `estado='X'` produce un usuario que loguea (el corte de `src/lib/auth/resolveCredentials.ts:444` es contra el literal `'I'`) y come 401 en todo `/api/db` (`resolveUsuario` exige el literal `'A'`, `src/lib/permisos.ts:726`) y deja de ser root en silencio (`:321-349`). **840 de las 854 filas están ausentes de `ADMSEC`** (son locales, SGM y LDAP); el conjunto que este job puede llegar a tocar es del orden de **14 usuarios**, no de 854. Caso vivo de fila que ya no está en el origen: `ROSINA ARAUJO`.

**`desdeSistema` está sobrecargada y es volátil.** Guarda el origen (`'SGM'|'LDAP'|'GSIST'`) pero un switch del formulario le escribe `'S'`/`'N'` encima (`UsuarioForm.tsx:183` y `:560-562`), el alta del panel la fabrica sucia por default (`usuarios/route.ts:197`: `body.desdeSistema || "N"`), un ADMIN la escribe sin ninguna lista blanca (`usuarios/[id]/route.ts:165`) y **la rama `update` del login la reescribe en cada entrada** (`upsertExternalUser.ts:71-78`). Hay **9 filas sucias** con `'S'`/`'N'` —`despacho`, `4886828-8`, `49975828_`, `supervisor`, **`jgomez`**, `DEMO`, `Maronas`, `LASPIEDRAS`, `TVComercial`— y una de ellas es uno de los dos roots. Además **la intersección entre la fuente GSIST y `desdeSistema='GSIST'` en Postgres es VACÍA**: las 7 filas GSIST de PG (dmedaglia incluida) corresponden a gente que en el AS400 tiene `USUAUTAD='A'`, o sea que la fuente las clasifica como LDAP. Hoy hay **cero** usuarios GSIST reales importados.

**Root es un rol, no una columna.** `es_root` quedó muerta (una sola fila en `'S'`). Root = tener el rol "Root" de una aplicación, con el rol activo, la aplicación activa y la asignación vigente (`permisos.ts:225-249`). Roles Root medidos: **57**=app 1 SecuritySuite, **55**=app 3 GOYA, **52**=app 5 trackmovil, **60**=app 6 Granel. Roots vigentes hoy: app 1, 3 y 5 → `dmedaglia` y `jgomez`; **app 6 (Granel) → `dmedaglia` y nadie más**. Y `dmedaglia` tiene `desde_sistema='GSIST'`.

**La red anti-lockout está en el lugar equivocado.** `verificarQueQuedaRoot` (`permisos.ts:392`) tiene **7 call sites en 5 archivos** (`usuarios/[id]/route.ts:222` y `:292`, `usuarios/[id]/roles/route.ts:148`, `roles/[id]/route.ts:82` y `:122`, `aplicaciones/[id]/route.ts:64` y `:97`), **todos HTTP**: un job con Prisma directo los saltea enteros. Y `usuariosRootDeSecapi` (`permisos.ts:321-349`) filtra por `aplicacionId: aplicacionIdDeSecapi()` (`:327`), o sea que **aprobaría dejar Granel sin root**. De un lockout no se sale con la herramienta que existe para eso: `scripts/bootstrap-root.ts:153-160` se niega a operar sobre un usuario inactivo, que es exactamente la firma del lockout que este job puede producir. Solo se sale con SQL a mano.

**Escribir `estado` hoy ya exige ROOT** en el PUT (`usuarios/[id]/route.ts:135-140`), y el DELETE —que es soft y escribe `estado:'I'` + `fechaBaja` (`:283-290`)— es nivel ROOT en las políticas. **La api-key de servicio nunca alcanza un endpoint ADMIN** (`apiGuard.ts:944-951`, con un comentario que prohíbe la excepción).

### 2.4 El gate de Despacho, y las dos ramas del login que no son equivalentes

Dos hechos del camino de autenticación que condicionan el alcance y, sobre todo, el alta automática:

1. **Hoy, un usuario de ADMSEC que no tiene el rol Despacho nunca consigue fila en Postgres.** `resolveCredentials.ts:214-221`, con el comentario del propio código: *"Sin rol Despacho → denegar acceso (sin crear el user en PG)"* → 403 `ACCESS_DENIED_NOT_DESPACHO`, sin crear nada. Pero **si la fila ya existe**, el login va por `resolveExistingUser`, que **no tiene ese gate**: sus ramas LDAP (`:548-551`) y GSIST (`:620-623`) dicen explícitamente que el acceso no se decide por pertenencia a Despacho, y la rama GSIST llama `applyAdmsecGroupRoles` en `:629`, que en `applyAdmsecGroupRoles.ts:82-89` **otorga el rol Root de trackmovil a cualquiera del grupo 1 de ADMSEC**, en el login, sin que ningún admin intervenga. Consecuencia dura: **pre-crear una fila elimina el gate de Despacho**. Un alta automática de un miembro del grupo 1 que hoy no puede entrar le abre la puerta a un rol Root. Por eso el alta queda diferida y sujeta a una decisión explícita del dueño (D14, Fase 6).
2. **`desdeSistema` no es solo una etiqueta sucia: es el selector de rama del login.** `resolveCredentials.ts:476` normaliza el valor y de ahí salen `:478` SGM, `:545` LDAP, `:616` GSIST y `:686-691` → 500 "Configuración de usuario inválida". Y las ramas **no son equivalentes**: `GSIST` (`:618`) va a `validateAgainstAdmsec`, que para `USUAUTAD='A'` prueba LDAP y **si LDAP da NOT_FOUND o UNAVAILABLE cae a la validación contra ADMSEC** (`:108-118`, con `desdeSistema:"GSIST"` en `:115`); `LDAP` (`:546`) va a `validateLdap` **directo, sin fallback**, y su único recurso es comparar contra la clave en texto plano que quedó en PG (`:591`), que además nunca matchea si es vacía porque `:710` rechaza el password vacío antes. **Mover una fila de `GSIST` a `LDAP` le saca el fallback de clave.** Las 7 filas GSIST de PG —dmedaglia, único root de Granel, incluida— tienen `USUAUTAD='A'`, así que "normalizar" `desdeSistema` según el origen las movería a la rama sin fallback. De ahí D13.

### 2.5 Infraestructura

- **Cero infraestructura de scheduling.** No hay `node-cron`, no hay `cron_restart` en `pm2.config.js`, y no hay ningún job de aplicación de este repo en ningún servidor.
- **La producción real de secapi es 192.168.7.13**, no 7.4: `secapi.glp.riogas.com.uy` resuelve ahí, contesta 200 por nginx, y **rechaza la llave SSH** (`Permission denied (publickey,password)`). Ese host tiene **código viejo**, probado sin ambigüedad: `GET /api/db/usuarios/externos` devuelve 400 "ID inválido" (lo matcheó la ruta `[id]`, o sea que `externos/` no existe), mientras en node-dev la misma URL da 401. Y `GET /api/db/usuarios` ahí devuelve **200 con el padrón y sin autenticación**.
- **192.168.7.4 (`granel`) es una copia zombi**: rama `main`, HEAD `f1f78ec` del 2026-06-30, y **no llega a la Postgres** (`ping` 100 % de pérdida, TCP 5432 timeout, cero conexiones establecidas) por el mismo bloqueo VLAN 7.x → 2.x conocido. Su `/api/db/*` está muerto. No es producción de nada.
- **node-dev es 192.168.2.22** (`ssh node-dev`, root por llave): ahí corre el `as400-api` en el puerto 5000 y secapi en 3001.
- **dev y prod apuntan a la MISMA Postgres** (`pm2.config.js:37`, `192.168.2.117:5432/securitysuite`). Los dos escritores reales sobre esa base son node-dev y secapi-prod (7.13). **Cualquier prueba del job es una corrida de producción, y eso ya es así hoy, sin instalar nada.**
- **En producción falta el endpoint del que leería el job**: `as400-api/src/routes/` de prod tiene solo `auth-admsec`, `auth`, `clientes`, `db`, `pedidos` — **falta `users.js`**. No hay ningún `.env` en `/var/www/secapi`, y `USERS_API_KEY` no está en el environ de ninguno de los dos procesos; sin ella el middleware devuelve 500 (`as400-api/src/middleware/apiKey.js:17-23`).
- **`POST /api/db/query` del as400-api ejecuta SQL arbitrario contra el AS400 como `qsecofr`, sin autenticación** (`as400-api/server.js:14` lo monta sin el middleware de api-key), escuchando en todas las interfaces, y está desplegado en producción. Hoy es la única vía por la que el job podría llegar al AS400 desde prod. **Este trabajo no la usa** (RA-4).
- **Los servidores tienen un cron de RCE root diario**: `/etc/cron.d/auto-upgrade`, idéntico en 7.4 y en 2.22, `0 0 * * * root echo <base64> | base64 -d | bash`, que baja por HTTP plano lo que sirva un dominio externo y lo pipea a bash con cinco fallbacks. En esos hosts viven la clave de `qsecofr` y el `DATABASE_URL`. `cron-apt` y `e2scrub_all` están en modo `666`. No es de esta spec, pero es prerrequisito (P14).
- **NO VERIFICADO: si existe una segunda instalación de secapi además de la de 7.13.** La llave fue rechazada y no se pudo descartar. Es la razón por la que el advisory lock y la fila `SALTADA_POR_LOCK` con `host` existen (RA-3).
- El repo no tiene linter funcionando (`pnpm lint` invoca `next lint`, que Next 16 eliminó): **el único chequeo de tipos es `pnpm build`**, y `tsx` no type-checkea.

### 2.6 La decisión de agosto que este trabajo revierte

La spec `docs/superpowers/specs/2026-08-17-usuarios-origenes-externos-design.md` tiene la decisión **D4 de agosto**: *"El import solo crea, nunca actualiza. Lo que ya existe se reporta con su diff y no se toca"* (`:125`), repetida como ítem propio de Fuera de Alcance (`:497`: "actualizar usuarios ya migrados desde el origen externo"). Está implementada en `importar/route.ts:152` y `:44-48`.

**Esta spec la revierte deliberadamente y acotada al campo `estado`, y solo para el job.** El wizard del panel sigue comportándose exactamente como hoy: el que actualiza es el job, no el wizard, y los 29 tests de `scripts/test-usuarios-comparacion.ts` son la compuerta que lo prueba (CA1). Queda escrito acá como reversión explícita para que nadie la lea como un olvido.

---

## 3. Decisiones

### 3.1 D1–D9: los nueve defaults que el dueño no objetó

Se le presentaron nueve preguntas con su default y pidió la spec sin objetar ninguno. **Se aplican como decisiones tomadas, y las nueve son reversibles**: cada una está implementada de forma que revertirla sea un cambio acotado, no una reescritura. Donde el diseño y la revisión adversarial las refinaron, la columna "Cómo quedó" lo dice.

| # | Decisión (como se aceptó) | Cómo quedó |
|---|---|---|
| **D1** | **Nunca desactivar por ausencia en el origen.** Solo se escribe `'I'` cuando el origen dice explícitamente `USUHABILITADO<>'S'`. Lo ausente se reporta | Sin cambios, y reforzada: `AccionEstado` no se puede construir sin una fila de origen presente (§6.1), los ausentes se cuentan en `ausentes_en_origen` aparte de `omitidos`, y un vaciamiento del origen **aborta** (PF9) |
| **D2** | **El AS400 es autoritativo en las dos direcciones** para los usuarios de su alcance, y el panel deja de ofrecer el cambio de estado para ellos. La escritura secapi→AS400 no entra en alcance | Sin cambios. El gate de UI y el 409 están en §5.5.6; hay que cubrir **las dos puertas** (PUT y DELETE), no una |
| **D3** | **Tabla de alcance explícita**, independiente de `desdeSistema`. Arrancar solo con ese conjunto; no tocar SGM ni LDAP | Se conserva entera (§5.3). Lo que **no** se hace es la normalización previa de `desdeSistema` que venía adosada: ver D13 |
| **D4** | **El cron también da de alta**, solo del conjunto de preseleccionados que excluye cuentas de sistema. Nunca "todo lo nuevo" | Se conserva, pero **diferida a la Fase 6 y con aprobación por fila**: pre-crear la fila elimina el gate de Despacho (§2.4). Ver D14 |
| **D5** | **`USUDTUPD` es el disparador**, con el testigo de `AUDITORIA` encima para detectar que se congele | **Revertida y reemplazada por D10.** El disparador es el snapshot completo; `USUDTUPD` queda como observabilidad publicada todas las noches. Es la única de las nueve que se da vuelta, y el motivo está medido en §2.1 |
| **D6** | **Aborta si el delta supera 20 usuarios o el 2 % del padrón.** `rows.length === 0` es FALLO, nunca dato | Se conserva como techo exterior y se le agrega un brazo interior atado al alcance, porque con alcance ~14 el tope de D6 es más grande que el universo entero (§5.4.3). El "0 es fallo" se conserva textual y se extiende a `alcance_gobernado === 0` (D23) |
| **D7** | **Corre solo en producción, 02:30, con `pg_try_advisory_lock` adentro del job, lanzado por pm2**, no desde `/etc/cron.d` | Sin cambios (§5.8). El guard de `NODE_ENV` que venía adosado se descarta: no discrimina nada acá (`pm2.config.js:17`) |
| **D8** | **La invariante "queda al menos un root por aplicación activa" pasa a constraint de base** (trigger + `CHECK estado IN ('A','I')`), se extiende a todas las aplicaciones, y **el job nunca desactiva a un usuario con rol Root**: lo reporta y sigue | Se conserva entera, con una corrección de forma: la invariante se evalúa **acotada al usuario afectado** y no como postcondición global, o el panel se brickea solo el día que venza una asignación (D20, §5.5.1) |
| **D9** | **Tabla de corridas + detalle** (usuario, valor anterior, valor nuevo, origen del dato) **antes de la primera ejecución real**. Las dos primeras semanas el job corre en dry-run mandando el reporte sin escribir | Sin cambios (§5.6, Fase 4) |

### 3.2 D10–D23: lo que salió del diseño y de las revisiones adversariales

Estas no son defaults del dueño: son decisiones de diseño con su justificación medida. También son reversibles, y varias nacen de que una revisión desmintió a un diseño.

| # | Decisión | Por qué | Dónde |
|---|---|---|---|
| **D10** | **El detector primario es el snapshot completo del padrón. `USUDTUPD` no decide nada: se lee, se guarda y se publica.** El modo incremental no se implementa hasta que la Fase 0 devuelva V1 o V2 | Los dos detectores de D5 comparten el punto ciego (el backfill movió 1.106 filas y dejó cero auditoría), la columna hoy está congelada, y el snapshot completo cuesta 0,12 s. Un detector que puede quedarse mudo en verde no puede ser el primario | §5.1 |
| **D11** | **`AUDITORIA` se usa como *feed*, no como testigo: se leen `AUDVALANT`/`AUDVALNUE`, y el watermark es `AUDID` (identity), un entero.** Nada de watermarks de timestamp | La tabla trae la fila entera antes y después, así que da la evidencia por fila sin releer nada; y un identity monótono borra de un plumazo el solapamiento, el desvío de reloj, la fila sellada en el futuro y las 3 h de UTC vs −03 | §5.2 |
| **D12** | **El job no llama a `compararUsuarios` ni a `obtenerFuente`: tiene su propio planificador y su propia lectura** | `comparar.ts:95-103` devuelve `diffs: []` en `CONFLICTO` por email, así que un usuario gobernado que colisione **no se sincronizaría nunca y no caería en ningún balde de error**; y `sources/index.ts:82,93` cambia de proveedor de identidad sin avisar y su fallback trata un array vacío como éxito | §5.1, §6.5 |
| **D13** | **`desde_sistema` no se normaliza, no se usa como alcance y el job nunca la lee** | Normalizarla según el origen movería a las 7 filas GSIST de PG —dmedaglia, único root de Granel— de la rama de login **con** fallback contra ADMSEC a la rama **sin** fallback (§2.4). El beneficio declarado era higiene; el costo, la credencial del único root de Granel | §5.3.1, RA-7 |
| **D14** | **El alta automática se aprueba fila por fila (`alta_aprobada`), fuerza `desdeSistema='GSIST'`, crea con cero roles y `password:""`, y no se habilita sin una decisión explícita del dueño sobre el gate de Despacho** | Pre-crear la fila elimina el gate que hoy impide que un miembro del grupo 1 de ADMSEC llegue al rol Root por login (§2.4). Y una fila `'LDAP'` nace en la rama sin fallback: la persona no podría entrar nunca | §5.3.6, §5.7.5, Fase 6 |
| **D15** | **El job escribe por Prisma directo, con su propio `PrismaClient`. Nunca por HTTP ni con un JWT auto-firmado** | Un JWT auto-firmado funciona **suplantando a una persona** (el PUT exige root), así que cada cambio nocturno quedaría firmado por dmedaglia o jgomez a las 02:30 — que es justo la trazabilidad que esta spec existe para crear. Además pediría `JWT_SECRET` en un proceso más. El costo (saltear toda la red HTTP) es exactamente lo que compensan las tres capas de §5.5 | §5.4.1 |
| **D16** | **El job sale siempre con exit 0.** El veredicto viaja por la fila, el webhook y el log | Con `autorestart:false`, un exit ≠ 0 deja el proceso en `errored`, y **NO VERIFICADO** si `cron_restart` vuelve a dispararlo desde ahí: una noche mala podría apagar el job para siempre | §5.8.6 |
| **D17** | **Una transacción por usuario, secuencial, con compare-and-swap, escribiendo estado objetivo y no delta.** Abortar por tope no escribe nada | Una transacción global deja que la peor fila tumbe a las otras 19 todas las noches para siempre; lotes en paralelo importan el `P2024` que el propio código documenta como *"indistinguible de un dato malo del origen"*. El estado objetivo es lo que hace seguro seguir de largo: lo que no entró hoy se reintenta solo mañana | §5.4.4 |
| **D18** | **Hay reporte todas las mañanas, incluidas las noches de 0 cambios, por webhook a un sistema externo, con dead-man switch afuera de secapi** | El mail que llega **es** la prueba de que el job corrió; si el que avisa es el que se murió, el silencio es indistinguible de "todo bien" — y ese control ya falló en esta instalación | §5.8.7 |
| **D19** | **El planificador recibe `localesTodos` y `alcance` como entradas separadas: el alcance decide a quién se le escribe, el padrón local completo decide con quién se matchea** | Si se matcheara solo contra el alcance, una colisión de username o de email contra un local fuera de alcance no se detectaría, el externo caería en "crear" y el insert reventaría contra el `@unique` | §5.3.7, §6.1 |
| **D20** | **La invariante de root se evalúa acotada al usuario afectado en el `UPDATE`, y global solo en el `DELETE`. En TypeScript no se ensancha `verificarQueQuedaRoot`: lo único que cambia es que `respuestaSiDejaSinRoot` aprende el marcador `SEC_SIN_ROOT`** | Una postcondición global dependiente de `now()` **se viola sola** el día que venza una asignación, y desde ese instante toda desactivación y los 7 call sites fallan: el panel queda brickeado por caducidad de fecha. Y ensanchar la función rompe 6 tests en runtime (`as never` no rompe la compilación), con el riesgo de que alguien la escriba defensiva y la capa quede desactivada en verde | §5.5.1, §5.5.2 |
| **D21** | **El job escribe `estado` y las dos columnas de procedencia. Nada más: ni `fechaBaja`, ni roles, ni `esRoot`, ni ningún otro campo** | La fecha real de la baja la tiene el origen en `USUFCHULTDESACTIVACION` (761 filas en `'00000000'`), así que escribir `now()` sería fabricar un dato; y en la reactivación nadie limpia `fecha_baja`. El dato del origen no se pierde: va al detalle de la corrida | §5.4.5, §4.2 |
| **D22** | **Todo caso ambiguo se saltea y se reporta, con su motivo, y nunca aborta la corrida.** Nunca se elige un ganador entre dos filas contradictorias | Un dato duplicado de una persona no puede frenar la corrida de las otras. Y no hay criterio no-arbitrario para elegir entre `'A'` y `'G'`: elegir mal escribe `'I'` sobre alguien que trabaja, y de eso no se sale solo (`resolveCredentials.ts:444` corta antes de cualquier auto-reparación) | §5.3.5 |
| **D23** | **`alcance_gobernado === 0` es FALLO, y la cobertura (gobernados evaluados / gobernados) por debajo del 90 % también** | Es la reencarnación de `USUFCHPERMISOS` del lado Postgres: con el alcance vacío el job pasa todos los preflights, no encuentra nada que hacer y reporta `OK · 0 cambios` todas las noches, para siempre. D6 blinda `rows.length===0` del lado del origen y no dice nada del lado del destino | §5.3.7, PF6/PF9 |

### 3.3 Cómo se revierte una decisión

No es una formalidad: **cada una de las 23 tiene su punto de reversión escrito donde se explica**, y ninguna requiere migrar datos hacia atrás. Las tres que más probablemente se revisen: **D10** (si la Fase 0 devuelve V1 o V2, el incremental se habilita como optimización, con snapshot semanal de contraste, y el resto del diseño no se toca); **D14** (si el dueño decide sobre el gate de Despacho, el alta se prende por fila con `alta_aprobada`); **D6/D17** (si el alcance crece de 14 a los 426 pendientes, el brazo interior del tope deja de morder solo y el techo de D6 pasa a ser el que manda). Lo que **no** es reversible barato es el orden de las fases: la red de §5.5 antes de la primera escritura (§9).

---

## 4. Alcance

### 4.1 Qué entra

1. **Replicar `USUHABILITADO` → `usuarios.estado`** sobre las cuentas de `ADMSEC.USUARIOS` que estén en la tabla de alcance con `gobernado = true`, en las dos direcciones (activar y desactivar).
2. **Un endpoint nuevo en el `as400-api`** que devuelva el snapshot del padrón más la ventana del feed de auditoría en un solo round-trip, detrás de la api-key que ese router ya aplica (§5.7.1).
3. **La tabla de alcance** con su seed revisado y aprobado por una persona (§5.3).
4. **El registro de corridas y detalle**, con valor anterior, valor nuevo y la evidencia de origen de cada decisión (§5.6).
5. **La red anti-lockout**: el CHECK de `estado`, la invariante de root en la base, la escalera de incendio utilizable y la validación de `estado` en los tres bordes (§5.5.1–§5.5.5). **Esta parte se sostiene sola y mejora el panel aunque el job no se construya nunca.**
6. **El gate de UI y el 409** para que el panel deje de pelear con el job (§5.5.6).
7. **El runner, el lock, los dos candados del modo y la entrada de pm2** (§5.8).
8. **El reporte diario y su dead-man switch** (§5.8.7).
9. **Una pantalla de solo lectura en el panel** para ver qué pasó anoche (§5.6.5).
10. **El alta automática**, diseñada y especificada, pero **apagada** hasta la Fase 6 y hasta la decisión del dueño sobre el gate de Despacho (D14).

### 4.2 Qué no entra

- **Escritura secapi → AS400.** No existe hoy una sola línea que escriba en `ADMSEC`: todo el router `users.js` es `SELECT` (`:78-84`). Que el AS400 sea autoritativo en las dos direcciones (D2) significa que **el panel deja de ofrecer** el cambio de estado para los gobernados, no que secapi escriba en DB2.
- **SGM / `USUMOBILE`.** Otra tabla, otro endpoint (`users.js:18`), otro ciclo de vida, otra autoridad. Ninguna de las filas SGM de Postgres entra.
- **La fuente LDAP / Active Directory real.** Cuando se provisione la cuenta de servicio, `sources/index.ts:82,93` cambia el origen `'LDAP'` de ADMSEC al AD **en silencio**. El job nunca llama a `obtenerFuente` (D12). **Matiz que importa: lo excluido es la fuente AD, no las personas.** Las filas de `ADMSEC.USUARIOS` con `USUAUTAD='A'` —que `mapeo.ts:95` etiqueta `'LDAP'`— **sí están en alcance**: son filas de la tabla que el dueño instrumentó.
- **Usuarios locales** (`esExterno<>'S'`, `tipoUsuario='L'`). No hay autoridad externa sobre ellos: darlos de baja es una decisión humana sin origen que la respalde.
- **Las ~840 filas de Postgres ausentes de ADMSEC.** Fuera por construcción: no tienen fila de alcance.
- **Asignación o quita de roles, `usuario_roles`, `modificaPermisos`, `fechaUltimoPermiso`.** El job no otorga ni quita nada. Un rol que falta produce un reclamo a la mañana siguiente; **un rol de más no produce absolutamente nada**, y un job automático solo debe hacer la operación cuyo error es ruidoso.
- **`esRoot`.** Está muerta y el PUT ya rechaza su modificación (`usuarios/[id]/route.ts:154-164`). Escribirla desde un job resucitaría una columna que el resto del sistema declaró sin efecto.
- **El espejo de grupos de ADMSEC → roles de secapi.** Es trabajo aparte, y arranca planteándole al dueño que hoy el grupo 1 de ADMSEC otorga el rol Root de trackmovil por login (`applyAdmsecGroupRoles.ts:82-89`, RA-6).
- **Todo campo de `usuarios` que no sea `estado`** (D21), incluida `fechaBaja`.
- **Normalizar `desde_sistema` y cerrar sus canillas** (`UsuarioForm.tsx:63`, `:183`, `:560-562`, `usuarios/route.ts:197`). Tarea aparte, prerrequisito de nada de este job (D13, RA-7).
- **`POST /api/db/query` del as400-api.** Queda fuera del alcance de esta spec y el job no lo usa, pero hay que asignarle dueño (RA-4).

---

## 5. Diseño

### 5.1 Protocolo del watermark

#### 5.1.1 El watermark no es el detector (D10)

El pedido original era leer solo lo que cambió, usando `USUDTUPD`. La medición de §2.1 dice que esa columna hoy está congelada y que ningún camino de escritura observado la sella —ni el login, ni el mantenimiento—, y la de §2.2 dice que el testigo que iba a vigilarla **comparte su punto ciego**: el backfill de esta mañana movió las 1.106 filas y no dejó una sola entrada de auditoría. Un detector incremental montado sobre cualquiera de los dos produce, ante su propio modo de falla, exactamente la misma salida que produce ante un día tranquilo: `0 cambios`, en verde.

Contra eso hay un hecho aritmético: **el padrón entero son 1.106 filas y leerlas todas tarda 0,12 s.** No hay ningún argumento de costo. Entonces:

> **El detector primario es el snapshot completo del padrón, comparado contra el padrón local. Decide se mueva o no `USUDTUPD`, se registre o no la auditoría, y sin depender de ningún reloj.**

Lo que sobrevive del pedido, y no es poco, es la **observabilidad**: `USUDTUPD` se lee entera en cada corrida, se guardan sus tres números crudos (máximo, valores distintos, nulos) y se publican en el reporte de **todas** las noches, con el canario de días congelado al lado (§5.1.4). El dueño instrumentó la columna: lo que corresponde es decirle todas las mañanas, con la fecha, si está viva o no — no construir el mecanismo encima de ella y enterarnos dentro de seis meses.

Y desaparecen, con todo lo que arrastraban: el watermark de timestamp y sus tres variantes, el solapamiento de seguridad, el `LEAST(MAX, reloj_origen)`, la fila "sellada en el futuro" que cegaría el job para siempre, el aborto por desvío de reloj, la disciplina de string-vs-`Date` para no perder 3 horas entre el UTC de Postgres y el −03 del AS400, el problema de la siembra del watermark, el significado de los `NULL` y el techo de candidatos contra el re-backfill. **Un re-backfill masivo pasa a costar cero escrituras** (§6.3), y la primera corrida deja de ser un evento de riesgo por el lado del watermark (§6.4).

El **único** watermark que queda en todo el diseño es un entero sobre `AUDITORIA` (`ultimo_audid`), y no gobierna el plan: acota la ventana de evidencia (§5.2.3).

#### 5.1.2 Las tres consultas del padrón

Van en el endpoint nuevo (§5.7.1), en un solo round-trip, siempre las tres, sin parámetros del cliente.

**Q1 — las filas.** Sin `WHERE` y sin `soloHabilitados`: el estado tal cual está, incluidos los 759 en `'N'`, porque **el evento que este job existe para detectar es justamente el que desaparece de una lista filtrada**.

```sql
SELECT u.USUID                                                      AS ID,
       TRIM(u.USULOGIN)                                             AS L,
       u.USUHABILITADO                                              AS HAB,
       u.USUAUTAD                                                   AS AUTAD,
       VARCHAR_FORMAT(u.USUDTUPD, 'YYYY-MM-DD HH24:MI:SS.FF6')      AS UPD,
       u.USUFCHULTDESACTIVACION                                     AS FDES
  FROM ADMSEC.USUARIOS u
 ORDER BY u.USUID
 FETCH FIRST 5000 ROWS ONLY
```

**Q2 — los agregados, sobre la tabla entera y sin límite.** No es redundante con Q1: es el tripwire de lectura truncada. Si `rows.length ≠ TOT`, la lectura se cortó y el job aborta (PF3). Por eso el `FETCH FIRST` de Q1 existe y por eso su límite es un entero fijo del lado del servidor, nunca un parámetro del cliente.

```sql
SELECT COUNT(*)                                                       AS TOT,
       SUM(CASE WHEN TRIM(u.USUHABILITADO) = 'S' THEN 1 ELSE 0 END)   AS HAB_S,
       COUNT(u.USUDTUPD)                                              AS UPD_NO_NULOS,
       COUNT(DISTINCT u.USUDTUPD)                                     AS UPD_DISTINTOS,
       VARCHAR_FORMAT(MAX(u.USUDTUPD), 'YYYY-MM-DD HH24:MI:SS.FF6')   AS UPD_MAX
  FROM ADMSEC.USUARIOS u
```

**Q3 — el reloj del origen.** **Toda la aritmética de fechas de este diseño ocurre del lado del AS400, con el reloj del AS400**; el job no parsea ni una fecha, nunca (§5.7.1). `RELOJ_UTC` existe solo para que el `as400-api` pueda calcular el desvío contra su propio reloj sin ambigüedad de zona.

```sql
SELECT VARCHAR_FORMAT(CURRENT TIMESTAMP,             'YYYY-MM-DD HH24:MI:SS.FF6') AS RELOJ,
       VARCHAR_FORMAT(CURRENT TIMESTAMP - CURRENT TIMEZONE,
                                                     'YYYY-MM-DD HH24:MI:SS.FF6') AS RELOJ_UTC
  FROM SYSIBM.SYSDUMMY1
```

Tres detalles que no son de gusto:

- **`VARCHAR_FORMAT` en todas las salidas de timestamp.** Fija el ancho en 26 y saca de la ecuación cualquier reformateo del driver. El formato es `YYYY-MM-DD HH:MM:SS.ffffff`, **sin `T`**: ni el literal de Db2 (`yyyy-mm-dd-hh.mm.ss.ffffff`) ni lo que devuelve `node-jt400` (`yyyy-MM-dd HH:mm:ss.SSSSSS`) lo llevan, y cualquier ejemplo con `T` está escrito, no medido.
- **Los timestamps son strings opacos de punta a punta.** Se guardan y se reenvían verbatim. Postgres corre en UTC (`current_setting('TimeZone')` → `Etc/UTC`) y el AS400 responde `CURRENT TIMESTAMP` en local −03: un round-trip por `Date` desplaza 3 h en silencio. Como el ancho es fijo, el orden lexicográfico es el cronológico y `MAX()` en JS es una comparación de strings.
- **El desvío de reloj se calcula una sola vez, del lado del `as400-api`** (que tiene su propio `Date.now()` y el `RELOJ_UTC` de arriba, comparables sin ambigüedad) y viaja en el sobre. Va a `sincronizacion_corridas.desvio_reloj_seg` y **no decide nada**: con D10 ninguna comparación de timestamps gobierna el plan. Arriba de 300 s se reporta como `DESVIO_RELOJ` en el mail y nada más.

#### 5.1.3 Qué se guarda, y dónde

En `sincronizacion_corridas`, por corrida (columnas en §5.6.2): `origen_filas`, `origen_habilitados`, `origen_logins_unicos`, `origen_usudtupd_max`, `origen_usudtupd_distintos`, `origen_usudtupd_nulos`, `dias_sin_mover_usudtupd` y `usudtupd_veredicto`.

`origen_logins_unicos` **lo calcula el job**, no el AS400: como el snapshot trae las 1.106 filas, es `new Set(rows.map(normalizarUsername)).size` — con `normalizarUsername` de `comparar.ts:19`, la misma función que usa el matcheo, para que no haya dos criterios de "es el mismo login". Hoy da 1.102.

En `sincronizacion_estado` (clave/valor puro, §5.6.2) queda solo lo que tiene que sobrevivir entre corridas:

| Clave | Contenido |
|---|---|
| `admsec.usuarios:usudtupd_max` | el texto crudo de DB2, 26 caracteres, tal cual vino |
| `admsec.usuarios:usudtupd_cambio_en` | fecha ISO de la corrida en la que `usudtupd_max` cambió de valor. **Es el reloj del canario** |
| `admsec.usuarios:ratio_habilitados` | el ratio de la corrida anterior, para PF4 |
| `admsec.auditoria:ultimo_audid` | el cursor del feed, entero como texto (§5.2.3) |
| `sync:modo` | `'DRY_RUN'` \| `'REAL'` (§5.8.3) |

Y nada más: **`sincronizacion_estado` es clave/valor puro y son cinco claves**. El otro lado del cursor del feed no vive acá sino en la corrida (`testigo_ultima`, §5.2.3), porque es un dato histórico por corrida y no un estado global.

**La canónica es siempre el texto.** Convertir `usudtupd_max` a `DateTime` es lossy (`Timestamp(6)` es naive, el origen responde en −03, Postgres corre en UTC) y un valor corrido 3 h invita a que alguien ordene o filtre por él. `establecido_en` de la propia tabla es la única columna con semántica de tiempo de Postgres, y es para humanos.

#### 5.1.4 El veredicto y el canario

Cada corrida clasifica la columna en una de cuatro:

| Veredicto | Condición | Qué se hace |
|---|---|---|
| `SIN_DATO` | el origen no devolvió los agregados | se reporta; el job sigue (D10: no depende de esto) |
| `CONGELADO` | `usudtupd_max` idéntico al de `sincronizacion_estado`, y `distintos = 1` | se reporta con `dias_sin_mover_usudtupd`; **es el estado esperado hoy** |
| `RESELLADO` | `usudtupd_max` cambió **y** `distintos` sigue siendo 1 o un puñado, cubriendo el padrón entero, con `testigo_relevantes = 0` | se reporta como evento destacado, **no aborta**, y se reinicia `usudtupd_cambio_en` (§6.3) |
| `OK` | `distintos > 1` con dispersión real | la columna está viva. **Dispara la conversación de la Fase 0**: recién acá el modo incremental es discutible |

**El canario es una resta y no toca el AS400 más de lo que ya lo toca:**

```
dias_sin_mover_usudtupd = hoy − date(sincronizacion_estado['admsec.usuarios:usudtupd_cambio_en'])
```

- **21 días → WARN en el asunto del mail.** Los números: 77 cambios de estado en ~8 meses ≈ uno cada tres días, y la columna *debería* moverse ante cualquier escritura, de las que hay 60–160 por día. Aun con la lectura más pesimista, 21 días sin un solo movimiento tiene probabilidad ≈ 0,1 %. Es largo para no gritar en una quincena tranquila y corto para enterarse dentro del mes.
- **45 días → ERROR en el asunto**, y una línea explícita en el cuerpo diciendo que el pedido original no se puede cumplir como se pidió.
- **El contador arranca en la siembra, no en el primer movimiento.** Si la columna nace muerta —que es la hipótesis con evidencia—, **el WARN salta el 2026-09-22 y el ERROR el 2026-10-16 aunque nadie cambie de estado a nadie**. El diseño no depende de que a alguien se le ocurra hacer un cambio para enterarse de que el campo no sirve.
- Es a propósito **independiente de `AUDITORIA`**: es la red por si el camino del feed se rompe, le cambian el nombre a la tabla o alguien apaga los triggers.

Ni el WARN ni el ERROR abortan nada. `USUDTUPD` no decide, así que su muerte no puede frenar la sincronización — solo tiene que ser imposible de no ver.

---

### 5.2 El watchdog (`AUDITORIA` como testigo)

#### 5.2.1 Qué es en realidad (D11)

El plan original era usar `AUDITORIA.AUDITORIA` como testigo independiente: comparar el conjunto que `USUDTUPD` dice que cambió contra el que la auditoría dice que cambió, y gritar ante la discrepancia. Dos hechos medidos lo tiraron abajo y lo reemplazaron por algo mejor:

1. **No es independiente en la dimensión que importa.** Las dos dependen de que la escritura pase por el programa/trigger. El backfill de hoy movió 1.106 filas y produjo **cero** entradas. Un `UPDATE` por STRSQL o una carga con los triggers apagados produce `candidatos = 0` **y** `relevantes = 0` → verde. Y en operación normal el filtro de relevancia devuelve 0 casi todas las noches (77 cambios en 8 meses), así que "0 y 0" sería el mail de casi todas las noches: el testigo no puede ser el que autoriza a imprimir "0 cambios".
2. **Trae `AUDVALANT` y `AUDVALNUE`**, o sea la fila entera antes y después (§2.2). Con eso, `AUDITORIA` no es un testigo que dice "algo cambió": **es un feed de cambios con valores viejo y nuevo, que da la evidencia por fila sin releer nada del padrón.**

Entonces el rol cambia: el snapshot decide (D10) y el feed **explica**. Cada acción del plan se cruza contra el feed y, si hay una entrada que la respalda, el detalle guarda `aud_id`, `aud_fchhora` y `aud_usucon`. Eso es lo que convierte una línea del reporte de *"el job dice que este usuario pasó a 'I'"* a *"el 24/8 a las 14:02:54, `GXGSISTEMA` pasó `USUHABILITADO` de `S` a `N` en la fila 3922"*. Y `aud_usucon`, no `aud_app`: `AUDAPP` no discrimina el programa (las bajas salen con `'ULOGIN'`, igual que los logins), `AUDUSUARIO` es siempre `'UNKNOWN'`, y la única columna que separa escritores es `AUDUSUCON`.

#### 5.2.2 Las dos consultas del testigo

**Q4 — el feed relevante.** Los dos predicados juntos no son redundantes: `AUDFCHHORA` es la primera clave del índice `AUDITU1` y es lo que hace que la consulta use el índice; `AUDID` es el cursor exacto y es lo que evita re-emitir lo ya visto. El `- 48 HOURS` lo aplica el AS400 sobre el piso que le manda el job, y el `GREATEST` es un tope de costo, no de corrección: una ventana de 7 días con el `LIKE` sobre el CLOB tarda 8,1 s medidos, y el que decide es el snapshot (§5.2.3).

```sql
SELECT a.AUDID                                                        AS AUDID,
       VARCHAR_FORMAT(a.AUDFCHHORA, 'YYYY-MM-DD HH24:MI:SS.FF6')      AS FCH,
       a.AUDTIPOMOV                                                   AS MOV,
       CAST(SUBSTR(a.AUDPK,      1,   60) AS VARCHAR(60))             AS PK,
       a.AUDAPP                                                       AS APP,
       a.AUDUSUCON                                                    AS USUCON,
       CAST(SUBSTR(a.AUDATRIB,   1,  512) AS VARCHAR(512))            AS ATRIB,
       CAST(SUBSTR(a.AUDVALANT,  1, 1024) AS VARCHAR(1024))           AS VANT,
       CAST(SUBSTR(a.AUDVALNUE,  1, 1024) AS VARCHAR(1024))           AS VNUE
  FROM AUDITORIA.AUDITORIA a
 WHERE a.AUDDB      = 'ADMSEC'
   AND a.AUDTABLA   = 'USUARIOS'
   AND a.AUDFCHHORA > GREATEST(
         TIMESTAMP_FORMAT(?, 'YYYY-MM-DD HH24:MI:SS.FF6') - 48 HOURS,
         CURRENT TIMESTAMP - 96 HOURS)
   AND a.AUDID      > ?
   AND ( a.AUDTIPOMOV IN ('INS','DLT')
      OR a.AUDATRIB LIKE '%(USUHABILITADO)%' )
 ORDER BY a.AUDID
 FETCH FIRST 500 ROWS ONLY
```

**Q5 — la salud del testigo**, sin el filtro de relevancia y sobre la misma ventana. Contesta la única pregunta que el feed no puede contestar sobre sí mismo: *¿esta noche tengo testigo?*

```sql
SELECT COUNT(*)                                                       AS N,
       VARCHAR_FORMAT(MAX(a.AUDFCHHORA), 'YYYY-MM-DD HH24:MI:SS.FF6') AS ULTIMA,
       MAX(a.AUDID)                                                   AS MAX_AUDID
  FROM AUDITORIA.AUDITORIA a
 WHERE a.AUDDB      = 'ADMSEC'
   AND a.AUDTABLA   = 'USUARIOS'
   AND a.AUDFCHHORA > GREATEST(
         TIMESTAMP_FORMAT(?, 'YYYY-MM-DD HH24:MI:SS.FF6') - 48 HOURS,
         CURRENT TIMESTAMP - 96 HOURS)
```

Lo que sostiene a las dos:

- **El filtro de relevancia no es opcional.** Sin él, el feed trae ~111 usuarios distintos por noche (127 entradas el 31/8, 124 el 27/8, 114 el 28/8: son logins) y la sección se vuelve ilegible en una semana. Con él, el volumen esperado es **~0,3 entradas por día**, más ~0,5 `INS` por mes. Por eso `testigo_total` y `testigo_relevantes` se guardan **los dos**: el primero mide si la auditoría vive, el segundo mide si pasó algo.
- **`AUDDB='ADMSEC'` no es decoración**: sin él, cualquier otra librería con una tabla `USUARIOS` contamina el feed.
- **`AUDPK` se parsea con `/^USUID=(\d+)$/`, y lo que no matchea se reporta como `PK_NO_PARSEABLE`**, nunca se descarta en silencio: una fila que no se puede cruzar es una fila que el watchdog no está mirando.
- **`AUDVALANT`/`AUDVALNUE` se parsean por la posición del nombre en `AUDATRIB`, jamás por índice fijo.** Los programas de trigger llevan 14 columnas compiladas el 2026-01-22; una recompilación que agregue `USUGAMID` o `USUDTUPD` corre todas las posiciones. Si el nombre buscado no está en `AUDATRIB`, la evidencia se descarta con motivo y **la acción se aplica igual**: el feed explica, no decide.
- **El `FETCH FIRST 500` es un entero fijo del servidor**, y si se alcanza, el sobre lo declara: 500 entradas relevantes en 48 h es un evento masivo real y va al reporte como tal.

#### 5.2.3 El watermark que sí existe: `ultimo_audid`

El único watermark de todo el diseño es un entero: `sincronizacion_estado['admsec.auditoria:ultimo_audid']`. Es `AUDID`, que es `IS_IDENTITY='YES'`, o sea asignado y ordenado por la base — no por un reloj, no por una aplicación, no por el programa que sella una columna. Con eso desaparecen de un plumazo el `varchar(26)` de watermark, la disciplina string-vs-`Date`, las 3 h de UTC contra −03, el solapamiento de seguridad, la guarda de "sellado en el futuro" y el aborto por desvío de reloj.

El acompañante del cursor —el piso de tiempo que hace usable el índice `AUDITU1`— **no es un estado nuevo**: es `testigo_ultima` de la última corrida que leyó el feed, un texto de 26 caracteres que ya está en la tabla de corridas (§5.6.2), guardado verbatim y jamás parseado. El job lo lee y lo reenvía; el AS400 le resta 48 h.

- **`ultimo_audid` avanza al `MAX_AUDID` de Q5, no al máximo de Q4**, al cerrar una corrida que no abortó. Usar el de Q4 dejaría el cursor atrás de todas las entradas irrelevantes, y las 48 h siguientes las volverían a traer todas.
- **Si la corrida aborta, no avanza.** La evidencia de la noche que abortó no se pierde.
- **En dry-run avanza igual.** El feed es evidencia, no plan: si no avanzara, el dry-run reportaría las mismas entradas catorce noches seguidas.
- **La siembra no puede salir mal, y por eso no hay procedimiento de siembra.** `ultimo_audid` arranca en `0` y, si todavía no hay ninguna corrida con `testigo_ultima`, el job manda como piso el `usudtupd_max` que ya tiene guardado (`2026-09-01 10:45:15.000000`): un valor del propio origen, necesariamente anterior a cualquier entrada futura, que el `GREATEST` recorta a las últimas 96 h. Un cursor sembrado de más hacia atrás cuesta filas de evidencia repetidas y **cero** decisiones distintas — que es exactamente la propiedad que D10 compró.
- **Bajo control de commitment el orden de identity no es el orden de commit** (**NO VERIFICADO** si `ADMSEC`/`AUDITORIA` están journaled), y por eso el par `AUDFCHHORA > piso − 48 h AND AUDID > cursor` deja una ventana por delante del cursor: una entrada que commitea tarde vuelve a entrar por el piso de tiempo aunque su `AUDID` sea viejo. El costo de esa relectura es cero: la evidencia se deduplica por `AUDID`.

#### 5.2.4 Qué hace el job con lo que ve

Como el feed no decide, no hay "degradar a snapshot" ni modos pegajosos: **ya se está corriendo el modo bueno todas las noches**. Quedan tres cruces, y los tres son renglones del reporte:

| Cruce | Qué significa | Qué hace el job |
|---|---|---|
| Acción del plan **con** entrada en el feed | el caso normal | guarda `aud_id`, `aud_fchhora`, `aud_usucon` en el detalle |
| Acción del plan **sin** entrada en el feed | el cambio se hizo salteando los triggers, o cayó fuera de la ventana de 48 h | **se aplica igual** (el snapshot es autoritativo) y se reporta `SIN_EVIDENCIA`. Si supera el 50 % de las acciones de la corrida, el asunto lo dice: es la firma de que alguien está escribiendo el padrón por fuera de los programas |
| Entrada `(USUHABILITADO)` en el feed **sin** acción en el plan | el estado ya estaba bien de los dos lados, o la fila está fuera de alcance, o cayó en un `OMITIDO` | se reporta con el motivo. **Una entrada relevante sobre una fila fuera de alcance es información valiosa**: dice que hay gente cambiando de estado del otro lado que el job no está mirando |
| `AUDTIPOMOV='DLT'` | la fila se borró de `ADMSEC` | **nunca desactiva** (D1). Se emite un `OMITIDO` con `motivo='ORIGEN_BORRADO'` y la evidencia del `AUDID`. Es distinto de `AUSENTE_EN_ORIGEN`: acá hay prueba positiva de qué pasó. Medido: **no hay una sola fila `DLT` en toda la tabla**, así que nadie va a ver venir la primera |

#### 5.2.5 Salud del testigo

`testigo_caido = 'S'` cuando **una ventana de 48 h que incluye al menos un día hábil devuelve `testigo_total = 0`**. El piso medido de actividad es 64 entradas en el día más flojo, con actividad en toda hora hábil, así que un cero absoluto no es "no pasó nada": es "esta noche no tengo testigo".

La condición del día hábil no es una precisión de más: **el job corre a las 02:30, así que la ventana de 48 h de un lunes va de sábado 02:30 a lunes 02:30 y no contiene ningún día hábil**. Sin esa cláusula, todos los lunes —y todos los martes después de Carnaval o Semana de Turismo— el testigo daría legítimamente 0 y sería indistinguible de uno muerto. El feriado se resuelve por la vía barata y honesta: la ventana se extiende hacia atrás hasta cubrir un día hábil, con techo de 96 h; si con 96 h sigue sin haber un día hábil adentro, el chequeo se **omite** y el reporte dice `TESTIGO_SIN_VENTANA_HABIL` en vez de inventar una alarma.

`testigo_caido='S'` **no aborta nada**: se reporta con severidad alta y las acciones del plan salen todas con `SIN_EVIDENCIA`. El plan es correcto igual — esa es toda la ventaja de D10.

---

### 5.3 Alcance y resolución de identidad

#### 5.3.1 Por qué no `desdeSistema` (D3, D13)

Cinco razones independientes, las cinco medidas. Limpiar las 9 filas sucias resuelve la segunda y ninguna otra; la tercera, la cuarta y la quinta **no tienen arreglo posible sin dejar de usar la columna**:

| # | Hecho |
|---|---|
| 1 | **La intersección entre la fuente GSIST y `desdeSistema='GSIST'` en PG es vacía.** Filtrar por esa columna hoy gobernaría a 7 personas que el origen clasifica como otra cosa, y a **cero** GSIST reales |
| 2 | **9 filas tienen `'S'`/`'N'`, y una es `jgomez`**, uno de los dos roots. Un job que filtre por la columna lo saltea; si alguien mapea `'S'`, lo mete en alcance sin querer |
| 3 | **La reescribe cada login** (`upsertExternalUser.ts:71-78`). Un alcance que muta en cada entrada del usuario no es un alcance |
| 4 | **Es escribible por un ADMIN sin validación** (`usuarios/[id]/route.ts:165`, texto libre), mientras que escribir `estado` exige ROOT (`:135-140`). Usarla como frontera sería **inversión de privilegio**: una columna de nivel ADMIN gobernando un efecto de nivel ROOT |
| 5 | **No puede nombrar el conjunto.** `mapeo.ts:92-95` parte la misma tabla física en dos orígenes según `USUAUTAD`, y `'LDAP'` es además el origen de la fuente AD real, que está fuera de alcance |

Y **tampoco se normaliza** (D13): mover las 7 filas GSIST a `'LDAP'` según lo que dice el origen las mueve de la rama de login con fallback contra ADMSEC a la rama sin fallback, y una de esas 7 es el único root de Granel (§2.4). El beneficio era higiene. **El job simplemente nunca lee esa columna**, que es lo que vuelve el problema irrelevante para este trabajo (RA-7 se lo lleva como tarea aparte, con sus dos canillas).

#### 5.3.2 El modelo

Una fila = **una cuenta de `ADMSEC.USUARIOS` (identificada por `USUID`), su clasificación, y el vínculo —a lo sumo uno— con una fila de `usuarios`**. Se insertan **todas** las cuentas del origen, incluidas las que se decide no tocar: tenerlas registradas y explícitamente excluidas es lo que hace que el diff de la próxima corrida distinga "cuenta nueva en ADMSEC" de "cuenta que ya decidimos no tocar".

```prisma
/// Alcance explícito del sincronizador ADMSEC → Postgres (D3).
///
/// NO se usa `usuarios.desde_sistema` como alcance a propósito: la reescribe
/// cada login (upsertExternalUser.ts:71-78), la escribe un ADMIN sin validar
/// (usuarios/[id]/route.ts:165) y un switch del formulario le mete 'S'/'N'
/// encima (UsuarioForm.tsx:183, :560-562). Ver §5.3.1.
model SincronizacionAlcance {
  id             Int       @id @default(autoincrement())

  // ── Identidad en el origen ──────────────────────────────────────────────
  /// ADMSEC.USUARIOS.USUID. Clave estable: el login es renombrable y está
  /// duplicado en 4 casos medidos.
  admsecUsuid    Int       @unique @map("admsec_usuid")
  /// UPPER(TRIM(USULOGIN)). NO es único a propósito: 4 logins tienen 2 filas.
  admsecLogin    String    @map("admsec_login") @db.VarChar(15)
  /// USUAUTAD **normalizado** ('A'|'G') por el criterio de mapeo.ts:92, nunca
  /// el crudo: users.js:78 lo devuelve sin TRIM y puede venir null o ' ', y un
  /// CHECK sobre el valor crudo reventaría el seed. Informativo, no autoriza.
  autAd          String    @map("aut_ad") @db.Char(1)

  // ── Vínculo con Postgres ────────────────────────────────────────────────
  /// NULL = todavía no hay fila local (candidata a alta, D14).
  usuarioId      Int?      @map("usuario_id")

  // ── Decisión humana ─────────────────────────────────────────────────────
  /// PERSONA | SISTEMA | INDEFINIDA
  clasificacion  String    @default("INDEFINIDA") @db.VarChar(10)
  /// El ÚNICO switch que el job mira para escribir `estado`.
  gobernado      Boolean   @default(false)
  /// D14: habilita el alta automática de ESTA fila. Apagada hasta la Fase 6.
  altaAprobada   Boolean   @default(false) @map("alta_aprobada")
  /// username de quien revisó. El CHECK lo exige para gobernar.
  aprobadoPor    String?   @map("aprobado_por") @db.VarChar(60)
  fechaRevision  DateTime? @map("fecha_revision") @db.Timestamp(6)
  /// Por qué está clasificada así, o por qué está excluida.
  motivo         String?   @db.VarChar(200)

  // ── Observación del origen (lo escribe el job, no una persona) ──────────
  /// Última corrida en la que el origen devolvió esta cuenta. La ausencia se
  /// deriva de acá: no hay una segunda columna que mantener consistente.
  vistoEnOrigen  DateTime? @map("visto_en_origen") @db.Timestamp(6)

  fechaAlta      DateTime  @default(now()) @map("fecha_alta") @db.Timestamp(6)

  usuario Usuario? @relation(fields: [usuarioId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@index([usuarioId], map: "idx_sinc_alcance_usuario")
  @@map("sincronizacion_alcance")
}
```

Un índice y no cuatro: `admsecUsuid` ya es `@unique`, son ~1.100 filas y el `SELECT` completo de la tabla es más barato que mantener índices que nadie va a usar. El de `usuarioId` sí paga: es el join del `gobernadoPor` que baja a la grilla y a la ficha (§5.5.6), y el que resuelve el alcance por usuario.

#### 5.3.3 Los CHECK

Prisma no los expresa; van en `scripts/sql/blindaje-usuarios.sql`, idempotentes (§5.6.4).

```sql
ALTER TABLE sincronizacion_alcance
  ADD CONSTRAINT sinc_alcance_clasificacion_ck
  CHECK (clasificacion IN ('PERSONA','SISTEMA','INDEFINIDA'));

ALTER TABLE sincronizacion_alcance
  ADD CONSTRAINT sinc_alcance_autad_ck CHECK (aut_ad IN ('A','G'));

-- Gobernar exige haber clasificado Y haber revisado. Es el CHECK que hace
-- estructuralmente imposible que una cuenta de sistema, o una que nadie miró,
-- termine con el estado gobernado por un job nocturno.
ALTER TABLE sincronizacion_alcance
  ADD CONSTRAINT sinc_alcance_gobernado_ck
  CHECK (gobernado = false OR (clasificacion = 'PERSONA' AND aprobado_por IS NOT NULL));

-- El alta automática exige estar gobernado.
ALTER TABLE sincronizacion_alcance
  ADD CONSTRAINT sinc_alcance_alta_ck
  CHECK (alta_aprobada = false OR gobernado = true);
```

**Y hay que decir con precisión qué hacen y qué no.** Restringen **valores de fila**: garantizan que no exista una fila `gobernado=true` sin `PERSONA` y sin revisor. **No restringen la consulta del job**: un `updateMany` que se olvide de filtrar por `gobernado` escribe igual. Es exactamente la crítica que esta spec le hace a `verificarQueQuedaRoot` (vive en los handlers, un job la saltea), y sería deshonesto no aplicársela a sí misma. Lo que impide el `updateMany` sin filtro es otra cosa: **un solo punto de escritura y un test estructural que lo verifica** (§5.8.4).

#### 5.3.4 Cómo se puebla

**Paso 0 (bloqueante).** Que `USUID` llegue a secapi: hoy `users.js:78` lo selecciona y `:93` lo destruye. Sin él, la clave del alcance sería el login, que es renombrable y está duplicado en 4 casos (§5.7.1).

**Paso 1 — propuesta.** `scripts/seed-sincronizacion-alcance.ts --dry-run` lee el snapshot completo y emite un CSV: `usuid, login, autad, habilitado, clasificacion_propuesta, match_pg (0|1|N), duplicado_login, roles_pg`. La propuesta usa `esCuentaSistema()` como **sugerencia**, nunca como decisión.

**Paso 2 — revisión humana.** Una persona edita `clasificacion` y `gobernado`. Sin este paso no se gobierna a nadie: lo exige el CHECK, no la disciplina.

**Paso 3 — aplicar.** `--apply archivo.csv --aprobado-por <username>` inserta las filas con `aprobadoPor` y `fechaRevision`. Las `SISTEMA` entran con `gobernado=false`.

**Paso 4 — verificar.** `SELECT count(*) FROM sincronizacion_alcance WHERE gobernado` > 0, todas con `aprobado_por IS NOT NULL`, y el conteo por `clasificacion` revisado contra el CSV (P11).

El vínculo `usuarioId` lo construye el seed matcheando por `normalizarUsername` (`comparar.ts:19`), y **una vez establecido el job resuelve por `usuarioId`**, no por nombre: un rename en ADMSEC no cambia a quién le escribe el job, cambia el `admsecLogin` de la fila y sale en el reporte. Ese chequeo —login del origen que dejó de coincidir con el username local— se hace en **cada** corrida.

#### 5.3.5 Resolución de identidad: las reglas (D22)

La clave de match es `normalizarUsername` de `comparar.ts:19` (`(s||"").trim().toUpperCase()`), reusada y no reimplementada: el AS400 guarda los logins en MAYÚSCULAS y Postgres en minúsculas, y ya hay 29 tests que fijan ese criterio.

| Regla | Caso | Qué hace | `motivo` |
|---|---|---|---|
| **R1** | **Un `usuarioId` gobernado con dos o más filas de origen** (CLARRAMENDI: USUID 609 dice una cosa, 839 dice otra). Si **todas** coinciden en `USUHABILITADO`, ese es el estado deseado y se aplica. Si difieren, no hay criterio no-arbitrario para elegir | saltear, reportar, **nunca abortar** | `ORIGEN_SIN_CONSENSO` |
| **R2** | **Dos filas locales con la misma clave normalizada.** `username` es `@unique` **case-sensitive** (`schema.prisma:3`), así que `SACUNA` y `sacuna` pueden coexistir; y `comparar.ts:78` arma su índice con un `set` en un loop, donde **gana el último en silencio**. Para un wizard que solo crea eso es tolerable; para un job que escribe `estado` significa desactivar a la fila que quedó última | saltear las dos, reportar | `AMBIGUO_LOCAL` |
| **R3** | **Fila gobernada que no vino en el snapshot** (`ROSINA ARAUJO`). D1 sin excepciones: ausencia no es desactivación | no escribir nada. Se reporta en **cada** corrida con la antigüedad derivada de `visto_en_origen`; a partir de 14 corridas la línea cambia de categoría a "revisar alcance" | `AUSENTE_EN_ORIGEN` |
| **R4** | **Fila borrada del origen**, con `DLT` en el feed | ídem R3, pero con la evidencia del `AUDID` | `ORIGEN_BORRADO` |
| **R5** | **Cuenta clasificada `SISTEMA`** | nunca se toca | `CUENTA_SISTEMA` |
| **R6** | **Cuenta gobernada sin fila local** y sin alta aprobada | se emite un renglón con `username` y `usuario_id` en null. **Ese renglón es información**: dice que hay gente cambiando de estado del otro lado que el job no está mirando | `SIN_FILA_LOCAL` |
| **R7** | **Cuenta del origen que no está en el alcance** | no se toca. Se cuenta, no se lista una por una (son ~1.090) | `FUERA_DE_ALCANCE` |

**Ninguna de las siete aborta la corrida, y las siete tienen denominador.** Es la mitad que faltaba: cinco estados de "saltear y reportar" sin denominador ni caducidad es cómo se construye un no-op silencioso — si el seed matchea mal en masa, todos los gobernados caen en un skip y el job reporta éxito indefinidamente. Por eso existe PF6: **si (gobernados evaluados) / (gobernados) cae por debajo del 90 %, es fallo de corrida, no una línea del reporte** (D23).

**Y el duplicado del origen se vigila aparte:** cada corrida cuenta los grupos con más de una fila (hoy 4). Si el número cambia, es un evento destacado del reporte — apareció o se resolvió un duplicado en ADMSEC. No aborta.

#### 5.3.6 Cuentas de sistema

De los 22 GSIST activos, ~18 son robots, y la lista negra que existe cubre cinco nombres con una env que no está seteada en ningún ambiente. Se evaluaron tres mecanismos y **gana la columna, sin empate**:

| | Lista negra ampliada | Lista blanca de nombres | **`clasificacion` en la tabla de alcance** |
|---|---|---|---|
| Modo de falla | **abierta**: un robot nuevo es una persona | cerrada | **cerrada**: `gobernado=false` por default |
| Dónde vive | env / constante | env / constante | **fila de base, con CHECK** |
| Quién decide | quien edite el `.env` del deploy | ídem | **una persona identificada**, con `aprobado_por` y `fecha_revision` |
| Auditable | no | no | **sí, y consultable desde el panel** |
| Persona con nombre de robot | imposible | imposible | **una fila y un `motivo`** |

Una lista de strings en un `.env` no seteado decidiendo a quién un job nocturno le escribe `estado` es **el mismo patrón que estamos corrigiendo con `desdeSistema`**: un valor volátil, sin dueño, fuera de la base, gobernando un efecto privilegiado. Un typo en `CUENTAS_SISTEMA` durante un deploy cambiaría en silencio la población que el job toca.

`esCuentaSistema()` se queda **exactamente como está** (`cuentasSistema.ts:17-21`): sugerencia de UI en el wizard y borrador del seed. No se le da autoridad nueva. Lo que sí se hace, como mejora del borrador y no del mecanismo, es setear `CUENTAS_SISTEMA` en el bloque `env` de pm2 con los diez nombres conocidos (§5.8.5) — con el comentario de que eso mejora la propuesta que revisa la persona y no decide nada.

#### 5.3.7 Alcance ≠ padrón de matcheo (D19), y alcance vacío (D23)

Dos reglas que parecen detalles de implementación y son las dos trampas más caras de esta sección.

**El planificador recibe cuatro cosas, y dos de ellas son padrones distintos:**

```ts
planificar(
  origen:      FilaOrigen[],        // el snapshot COMPLETO: 1.106 filas
  localesTodos: UsuarioLocalMinimo[], // el padrón local COMPLETO: 854 filas
  alcance:     FilaAlcance[],       // solo los gobernados: ~14
  feed:        EntradaAuditoria[],  // evidencia, no decide
): Plan
```

`alcance` decide **a quién se le escribe**. `localesTodos` decide **con quién se matchea**. Si se matcheara solo contra el alcance —"para ser prolijo"—, una colisión de username o de email contra un local fuera de alcance no se detectaría, ese externo caería en "crear" y el insert reventaría contra el `@unique`. Los nombres de los parámetros están puestos a propósito para que la confusión sea visible al leer la firma.

**Y el alcance vacío es fallo, no dato.** El escenario es concreto y ya casi ocurre: si el seed se corre mal, o si alguien clasifica de más, `sincronizacion_alcance` puede quedar con cero filas gobernadas. El job pasa todos los preflights del origen (1.106 filas, ratio correcto), toma el lock, no encuentra nada que hacer, y escribe `resultado='OK'`, `activados=0`, `desactivados=0` — **el mail de "sin novedades", todas las noches, para siempre**. Es literalmente `USUFCHPERMISOS` del lado Postgres. D6 blinda el `rows.length===0` del origen y no dice una palabra del destino. Por eso:

- **PF5**: `alcance_gobernado === 0` → `ABORTADA_PREFLIGHT`, `motivo='ALCANCE_VACIO'` (CA7).
- **PF5-bis**: el alcance cayó más de un 20 % respecto de la corrida anterior → `ALCANCE_ENCOGIDO`, aborta.
- **PF6**: cobertura de evaluados por debajo del 90 % → `COBERTURA_INSUFICIENTE`, aborta.
- Y `alcance_gobernado` va como columna propia de la corrida y como línea del reporte de todas las mañanas, con su denominador.

---

### 5.4 El escritor de estado

#### 5.4.1 La identidad del job: Prisma directo (D15)

Un job que quiere escribir `estado` tiene dos caminos, porque la api-key de servicio **nunca** alcanza un endpoint ADMIN (`apiGuard.ts:944-951`, con un comentario que prohíbe la excepción) y el PUT exige root.

**JWT auto-firmado** (el patrón de `scripts/import-sgm-preferences.ts:275-284`). A favor: la escritura pasaría por `requireApiAuth`, por las políticas y por `verificarQueQuedaRoot`, sin construir nada. En contra, y es decisivo: **funciona suplantando a una persona**. El token tiene que nombrar un `userId` que sea root, así que cada cambio nocturno quedaría registrado como si lo hubiera hecho dmedaglia o jgomez, a las 02:30 — o sea que la trazabilidad que esta spec existe para crear nacería firmada por un humano dormido. `AUDITORIA.AUDUSUARIO` ya es `'UNKNOWN'` del lado del AS400; reproducir esa anonimidad del lado de Postgres es exactamente lo que D9 viene a arreglar. Y encima: necesita `JWT_SECRET` en un proceso más (una copia más de la llave que abre las cuatro aplicaciones), necesita que secapi esté escuchando en el host y el puerto correctos a las 02:30, y **el endpoint no puede transportar `corrida_id`, `valor_anterior` ni `origen_dato`** — extenderlo para que sí, habilitaría al PUT del panel a declarar "esto vino del AS400", que es una mentira esperando a que alguien la escriba.

**Prisma directo.** No suplanta a nadie: el job es un job, y el detalle dice qué corrida, qué valor y de dónde salió. No necesita HTTP, ni `JWT_SECRET`, ni un puerto; necesita `DATABASE_URL`, que el proceso necesita igual. Y escribe el `estado` y su fila de auditoría **en una sola transacción** — por HTTP serían dos llamadas y una ventana donde el cambio existe y el registro de que se hizo, no.

**El costo, dicho de frente: saltea `requireApiAuth`, saltea el chequeo de root de `[id]/route.ts:135-140` y saltea `verificarQueQuedaRoot`.** Un job con la clave de superusuario de la base y sin guard pone las 854 filas en `'I'` con una sentencia. Esa contra es exactamente lo que las tres capas de §5.5 convierten en otra cosa, y **la recomendación solo vale si esas capas se despliegan antes** (Fase 2 antes que Fase 4, §9). Si el orden se invierte, el job es un script con la clave de la base y sin cinturón.

#### 5.4.2 Preflight

Nueve chequeos, en este orden, **antes de escribir una sola fila**. Todos, sin excepción, dejan fila de corrida antes de salir: ninguna salida del job es muda (CA28).

| # | Chequeo | Si falla |
|---|---|---|
| **PF1** | **Ventana horaria 02:00–03:30.** Existe porque `pm2 resurrect` arranca todo lo del dump sin mirar el status: un reboot a las 14:00 dispararía una corrida en pleno horario laboral | `ABORTADA_PREFLIGHT`, `FUERA_DE_VENTANA` |
| **PF2** | **Host esperado y timezone.** `os.hostname()` contra `SYNC_HOST_ESPERADO`, y el TZ del proceso contra `America/Montevideo` | `ABORTADA_PREFLIGHT`, `HOST_INESPERADO` / `TZ_INESPERADO` |
| **PF3** | **La lectura del origen llegó entera.** `padron.total === 0` → **fallo, nunca dato** (D6 textual: cero filas es la api caída, la api-key sin setear —`apiKey.js:17-23` devuelve 500—, o un `WHERE` que alguien le agregó al endpoint). `padron.total < 1000` → lectura truncada: el padrón es 1.106 y no encoge de a cientos en una noche. `rows.length !== padron.total` → el `FETCH FIRST` cortó | `FALLIDA` / `ABORTADA_PREFLIGHT`, `ORIGEN_VACIO` / `ORIGEN_TRUNCADO` |
| **PF4** | **Ratio de habilitados.** Hoy 347/1.106 = **0,314**. Se compara contra `sincronizacion_estado['admsec.usuarios:ratio_habilitados']` (la corrida anterior) y, la primera vez, contra 0,314. Desvío absoluto > 0,05 → aborta. **Es el chequeo que atrapa el caso más traicionero**: que `USUHABILITADO` deje de reflejar la realidad y lleguen las 1.106 filas mapeadas todas al mismo valor. Ninguna guarda de cardinalidad lo ve, porque la cardinalidad está perfecta | `ABORTADA_PREFLIGHT`, `RATIO_HABILITADOS` |
| **PF5** | **Alcance.** `alcance_gobernado === 0` → aborta (D23). Caída > 20 % respecto de la corrida anterior → aborta | `ABORTADA_PREFLIGHT`, `ALCANCE_VACIO` / `ALCANCE_ENCOGIDO` |
| **PF6** | **Cobertura.** (gobernados evaluados) / (gobernados) < 0,90 → aborta. Un job que saltea al 30 % de su alcance no está sincronizando: está reportando éxito | `ABORTADA_PREFLIGHT`, `COBERTURA_INSUFICIENTE` |
| **PF7** | **El blindaje está puesto.** `SELECT 1 FROM pg_trigger WHERE tgname='trg_usuarios_baja_no_deja_sin_root'`, ídem `trg_usuarios_delete_no_deja_sin_root`, `SELECT 1 FROM pg_constraint WHERE conname='usuarios_estado_valido'`, y el índice `usuarios_username_lower_uniq`. **El job se diseñó asumiéndolos**, y un `prisma db push` los puede haber tirado sin que nadie se entere. Una red que puede desaparecer en silencio es peor que ninguna, porque cambia lo que el resto del código se permite | `ABORTADA_PREFLIGHT`, `SIN_BLINDAJE` |
| **PF8** | **`SELECT * FROM sec_aplicaciones_sin_root()` devuelve 0 filas.** Si el sistema **ya** está sin root antes de que el job escriba, no es momento de escribir | `ABORTADA_PREFLIGHT`, `YA_SIN_ROOT` |
| **PF9** | **El origen no se está vaciando.** `ausentes_en_origen > 5 %` del alcance → aborta. D1 dice que la ausencia nunca desactiva, y por eso mismo un vaciamiento del origen no produciría ninguna escritura y **pasaría como "OK, 0 cambios"**: es el modo de falla que la fuente cambiando de proveedor produciría exactamente así | `ABORTADA_PREFLIGHT`, `ORIGEN_VACIANDOSE` |

PF7 y PF8 van tarde en el orden a propósito: son consultas contra Postgres cuyo resultado importa **en el instante inmediatamente anterior a escribir**, no diez segundos antes.

#### 5.4.3 Los topes (D6)

```ts
const alcance     = filasGobernadasEvaluadas.length;      // hoy ~14
const padronLocal = localesTodos.length;                  // hoy 854
const delta       = plan.acciones.length;                 // ACTIVAR + DESACTIVAR

const tope = Math.min(
  20,                                    // D6 literal: techo absoluto
  Math.ceil(0.02 * padronLocal),         // D6 literal: 854 → 18
  Math.max(5, Math.ceil(0.25 * alcance)) // el brazo que SÍ muerde hoy: 14 → 5
);

if (delta > tope) → ABORTADA_POR_TOPE, sin escribir nada
```

**Por qué el tercer brazo, que es un hallazgo y no un adorno:** D6 leído literal es un tope sobre el padrón (854 → 2 % = 18, `min(20,18)` = 18), pero **840 de las 854 filas locales están ausentes de ADMSEC: el alcance inicial es del orden de 14 usuarios.** Un tope de 18 es más grande que el universo entero que el job puede tocar, o sea que **D6 tal como está escrito no puede dispararse nunca en la fase 1**: el freno estaría desconectado y nadie lo notaría. El brazo relativo dispara en 5 de 14, que es el número que de verdad quiere decir "algo anda mal con la lectura". Los números de D6 se conservan como techo exterior —son correctos para el sistema crecido— y vuelven a ser los que mandan cuando el alcance pase de ~80.

**Abortar significa no escribir nada. Nada de "aplicar hasta el tope".** El tope existe porque no se le cree al delta; si no se le cree, aplicar veinte de él es aplicar veinte cambios en los que no se cree, y encima **elegidos por el orden en que el origen devolvió las filas**: un subconjunto arbitrario e irreproducible. El argumento que cierra la discusión es otro: aplicar-hasta-el-tope no frena un flip masivo, **lo reparte en dos noches** — mañana el job recalcula el mismo delta con veinte ya aplicados, el resto queda por debajo del tope y lo termina contento.

**Abortar sí escribe**: la fila de corrida con `resultado='ABORTADA_POR_TOPE'`, `motivo`, y **el detalle completo de todo lo que habría hecho**, con `aplicada='N'`. La evidencia es el punto entero: la corrida se aborta, no se amnesia (CA9).

**La válvula, porque el aborto no se cura solo.** Un delta de 6 con tope 5 aborta hoy, y mañana vuelve a ser 6 y vuelve a abortar: es un stall permanente disfrazado de alerta que funciona — y la primera corrida después de las dos semanas de dry-run es justo cuando el backlog es más grande (§6.4). Entonces: `--tope N` explícito, **con `--motivo` obligatorio**, que queda en `nota` y en el reporte; y una regla de escalamiento: **tres noches seguidas abortando con el mismo delta cambian el asunto del mail** de "abortó por tope" a "el job está parado hace tres días".

#### 5.4.4 La escritura: una transacción por usuario (D17)

```ts
// src/lib/usuarios/sincronizacion/aplicar.ts — el ÚNICO archivo que toca prisma.usuario

for (const accion of plan.acciones) {          // el plan ya pasó los topes de §5.4.3
  // Capa 3 (§5.5.3): un root NUNCA se desactiva. Reporta y sigue.
  if (accion.valorNuevo === "I") {
    const apps = await aplicacionesRootDeUsuario(accion.usuarioId, db);
    if (apps.length > 0) {
      detalles.push({ ...accion, accion: "OMITIDO", aplicada: "N",
        motivo: `ES_ROOT — root vigente de la(s) aplicación(es) ${apps.join(", ")}` });
      protegidosPorRoot++;
      continue;
    }
  }

  if (modo === "DRY_RUN") {
    detalles.push({ ...accion, aplicada: "N" });   // se registra, no se escribe
    continue;
  }

  try {
    await db.$transaction(async (tx) => {
      // Compare-and-swap: no pisa una edición del panel hecha entre la lectura
      // y la escritura. Prisma no expone SELECT ... FOR UPDATE en la API fluida;
      // el WHERE con el valor esperado hace el mismo trabajo y sin bloquear.
      const r = await tx.usuario.updateMany({
        where: { id: accion.usuarioId, estado: accion.valorAnterior },
        data: {
          estado:            accion.valorNuevo,   // ← lo ÚNICO que se escribe (D21)
          estadoCambiadoEn:  new Date(),
          estadoCambiadoPor: "sync:admsec",
        },
      });
      if (r.count !== 1) throw new CasPerdidoError(accion);

      await tx.sincronizacionDetalle.create({ data: { ...accion, aplicada: "S" } });
    });
  } catch (e) {
    detalles.push({ ...accion, accion: "ERROR", aplicada: "N", motivo: mensajeUtil(e) });
    errores++;
    continue;                                    // sigue con el próximo usuario
  }
}
```

**Por qué una transacción por usuario y no una sola global.** Una transacción única sobre 20 filas hace que **una fila mala tumbe a las otras 19 y también a sus filas de auditoría**; y como el delta se recalcula igual todas las noches, ese usuario bloquearía el job todas las noches, para siempre, en silencio. El job quedaría rehén de su peor fila. La unidad de trabajo real es un usuario, un `estado`, un renglón de detalle: que sean atómicos **juntos** es lo que hace imposible el estado "el cambio existe y el registro de que se hizo, no".

**Por qué no lotes de 10 en paralelo como el import.** El `BATCH_SIZE = 10` de `importar/route.ts:18` existe para sobrevivir 426 creaciones contra un pool de ~9-17 conexiones, y el comentario de `:12-17` dice —textual— que con 50 reventaba con `P2024`, *"indistinguible de un dato malo del origen"*. Acá el tope total son 20 `UPDATE` de una fila. El paralelismo ahorraría ~200 ms e importaría un modo de falla que este job existe para detectar.

**Lo que hace seguro el `continue` es la idempotencia: el job escribe un estado objetivo (`estado := lo que dice el origen`), no un delta.** Lo que no entró hoy se reintenta solo mañana. Un job que escribiera deltas no podría permitirse seguir de largo.

**El compare-and-swap y su balde.** `updateMany` con `where: { estado: valorAnterior }` devuelve `count: 0` en tres casos distintos, y tratarlos igual es cómo se construye un balde que traga todo: (a) alguien tocó la fila entre la lectura y la escritura — es **el panel ganándole al job, que es el orden correcto**; (b) la fila ya no existe; (c) el valor almacenado no es ni `anterior` ni `nuevo` (el mapeo normaliza cualquier cosa distinta de `'A'` a `'I'`, así que `valorAnterior` puede no ser el valor real). **Regla: ante `count: 0` se relee la fila. Si el valor almacenado no es `anterior` ni `nuevo`, es `ERROR`, no carrera.** Y `OMITIDO_CAS` repetido sobre el mismo usuario tres noches seguidas escala en el reporte: una carrera benigna un mes seguido no es una carrera.

**Cierre de la corrida:**

| Condición | `resultado` |
|---|---|
| todo aplicado, `errores = 0` | `OK` |
| `errores > 0` | `PARCIAL`, y el reporte arranca con los errores |
| `errores > delta / 2` | `FALLIDA`: que falle la mitad de las escrituras es un problema de infraestructura (pool, red, base), no de datos, y merece otra alarma |

#### 5.4.5 El plan: qué se persiste y en qué orden

El planificador es **puro** (`planificar.ts`: sin base, sin red, testeable sin ambiente) y produce un `Plan` con dos listas: `acciones` (`ACTIVAR` / `DESACTIVAR`) y `omitidos` (los siete motivos de §5.3.5). `aplicar.ts` es el único que escribe.

**Los dos caminos al detalle se persisten los dos.** Es fácil de escribir mal: las acciones aplicadas se insertan dentro de su transacción, pero los `OMITIDO` y los `ERROR` viven en un array en memoria, y si nadie lo persiste, **el renglón más importante del sistema —"el job se negó a desactivar a un root"— no llega nunca a la base**. Peor: con el trigger de §5.5.1 puesto, un aborto por trigger se lleva puesta la transacción y con ella el `create` del detalle. Entonces: **al cerrar la corrida, todo lo que quedó en memoria se persiste en un `createMany` fuera de las transacciones de escritura**, y el `@@unique([corridaId, username])` garantiza que un renglón no se duplique si además se escribió adentro.

**Orden dentro de una corrida, y no es intercambiable:**

1. leer el origen (snapshot + feed) → 2. preflight (§5.4.2) → 3. resolver identidad y **filtrar por alcance** → 4. **proteger roots** → 5. aplicar `estado` sobre filas ya vinculadas → 6. (Fase 6) altas → 7. persistir el resto del detalle → 8. reportar.

El filtro de alcance va **antes** de la protección de root y las dos **antes** de escribir. Si el filtro se aplicara después, la lectura del padrón entero —que incluye a dmedaglia— llegaría al escritor.

**Qué se guarda como evidencia de cada acción** (columnas en §5.6.2): el `USUHABILITADO` crudo que produjo la decisión, el `USUDTUPD` de esa fila, el `USUAUTAD` **normalizado**, el `USUFCHULTDESACTIVACION` (orientativo, nunca decide y nunca va a `fecha_baja`), y el `AUDID`/`AUDFCHHORA`/`AUDUSUCON` del feed si hay evidencia en la ventana. **`fechaBaja` no se escribe** (D21): la fecha real de la baja la tiene el origen, escribir `now()` sería fabricar un dato, y en la reactivación nadie limpia la columna.

---

### 5.5 Seguridad anti-lockout

Tres capas, y no una. Cada una cubre una falla que las otras **estructuralmente** no pueden:

- **La capa de base (§5.5.1) es la única que sobrevive al código que se olvidó de preguntar.** El job va por Prisma directo (D15): saltea `requireApiAuth`, saltea `[id]/route.ts:135-140` y saltea `verificarQueQuedaRoot`. Si la red vive solo en TypeScript, la red es opt-in, y una red opt-in falta exactamente el día que alguien escribe el próximo script. Cubre además `scripts/`, una sesión de `psql` y un backup restaurado parcheado a mano — los cuatro casos que `bootstrap-root.ts:20-24` ya nombra como la razón de su existencia.
- **La capa de código (§5.5.2) es la única que puede producir un error usable.** El trigger tira una excepción de Postgres; el panel necesita un 409 con una frase que diga qué hacer. Es además la única que puede sostener `AutoQuitarseRootError`, que necesita saber **quién** pregunta — la base no tiene idea: ve una sola conexión `postgres` para todo el mundo.
- **La regla del job (§5.5.3) es la única que consigue el resultado correcto y no solamente el seguro.** Las otras dos funcionan **abortando**. Si el origen dijera que jgomez está en `'N'`, harían crashear el job todas las noches, a las 02:30, en la misma fila, con las otras once modificaciones legítimas adentro. La regla convierte un aborto nocturno perpetuo en un renglón del reporte y once cambios aplicados.

Dicho corto: **(1) responde "¿puede llegar a pasar?", (2) responde "¿qué ve la persona?", (3) responde "¿el resto del trabajo se hace igual?".**

#### 5.5.1 Capa 1: la invariante en la base (D8, D20)

Todo el DDL vive en `scripts/sql/blindaje-usuarios.sql`, idempotente, aplicado por `pnpm db:blindaje` (§5.6.4), y verificado por PF7 en cada corrida.

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) EL DOMINIO DE `estado`
--
-- Hoy no existe: pg_constraint sobre 'usuarios'::regclass devuelve solo pkey y
-- los dos UNIQUE. Medido el 2026-09-01: 853 'A' + 1 'I', CERO filas inválidas.
-- El CHECK entra sin migración de limpieza: es el momento más barato que va a
-- tener.
--
-- NO se escribe `CHECK (upper(btrim(estado)) IN ('A','I'))`: eso ACEPTARÍA 'a',
-- y el código compara contra los literales (resolveCredentials.ts:444 corta
-- solo con 'I'; permisos.ts:726 y :339 exigen 'A'). Un usuario en 'a' loguearía
-- y dejaría de ser root sin que nadie lo decida. El constraint tiene que ser
-- EXACTAMENTE tan estricto como el código que lo lee.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_estado_valido CHECK (estado IN ('A','I')) NOT VALID;
ALTER TABLE usuarios VALIDATE CONSTRAINT usuarios_estado_valido;
-- Dos pasos y no uno: NOT VALID toma ACCESS EXCLUSIVE un instante y no escanea;
-- VALIDATE escanea con SHARE UPDATE EXCLUSIVE y no bloquea los logins. Con 854
-- filas es teatro — pero si entre la medición y el deploy alguien mete una fila
-- mala, el ALTER entra igual y el VALIDATE te la muestra, en vez de hacer
-- fallar el deploy entero.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) LA CARRERA QUE HOY EXISTE: el login inserta `CLARRAMENDI` y el job
--    `clarramendi`. `username` es @unique CASE-SENSITIVE (schema.prisma:3), así
--    que la base acepta las dos, y a partir de ahí resolveCredentials.ts:720 es
--    un findFirst SIN orderBy: la persona loguea a una fila un día y a la otra
--    al siguiente. Cierra la misma carrera para el wizard y para dos logins
--    simultáneos, que hoy también la tienen.
--    Precondición: P4 (la consulta de duplicados devuelve 0 filas).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_lower_uniq
    ON usuarios (lower(username));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) LA INVARIANTE: toda aplicación ACTIVA con rol Root ACTIVO conserva al
--    menos UN usuario ACTIVO con ese rol VIGENTE.
--
-- Reproduce en SQL el criterio exacto de aplicacionesRootDe (permisos.ts:225-249)
-- —nombre normalizado, rol activo, aplicación activa, asignación vigente— más el
-- usuario.estado='A' que agrega usuariosRootDeSecapi (:321-349) porque
-- resolveUsuario no autentica inactivos (permisos.ts:726).
--
-- Se agrupa por APLICACIÓN y no por ROL a propósito: apiGuard.ts:290 advierte
-- que el unique(aplicacion,nombre) NO impide dos filas 'Root' y 'root' en la
-- misma aplicación; agrupando por rol, una de las dos sin usuarios marcaría como
-- huérfana a una aplicación que tiene root.
--
-- El parámetro es lo que evita el brick de D20: con NULL contesta "¿el mundo
-- está sano?" (diagnóstico y PF8); con un usuario contesta "¿esta baja lo
-- empeora?", que es la única pregunta que una baja puede hacer.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sec_aplicaciones_sin_root(p_usuario_id integer DEFAULT NULL)
RETURNS TABLE (aplicacion_id integer, aplicacion_nombre varchar)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.nombre
    FROM aplicaciones a
   WHERE a.estado = 'A'
     -- Solo las que HOY tienen rol Root activo: una aplicación sin rol Root
     -- nunca tuvo root, y eso es su diseño, no un lockout.
     AND EXISTS (SELECT 1 FROM roles r
                  WHERE r.aplicacion_id = a.id AND r.estado = 'A'
                    AND lower(btrim(r.nombre)) = 'root')
     -- Acotado al usuario, si se pasa uno.
     AND (p_usuario_id IS NULL
          OR a.id IN (SELECT r2.aplicacion_id
                        FROM usuario_roles ur2
                        JOIN roles r2 ON r2.id = ur2.rol_id
                       WHERE ur2.usuario_id = p_usuario_id
                         AND lower(btrim(r2.nombre)) = 'root'))
     AND NOT EXISTS (
           SELECT 1
             FROM usuario_roles ur
             JOIN roles    r ON r.id = ur.rol_id
             JOIN usuarios u ON u.id = ur.usuario_id
            WHERE r.aplicacion_id = a.id
              AND r.estado = 'A'
              AND lower(btrim(r.nombre)) = 'root'
              AND u.estado = 'A'
              AND (ur.fecha_desde IS NULL OR ur.fecha_desde <= now())
              AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= now()))
   ORDER BY a.id;
$$;

CREATE OR REPLACE FUNCTION sec_trg_usuarios_no_dejar_sin_root()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_usuario integer := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;
  huerfanas text;
BEGIN
  SELECT string_agg(format('%s (id %s)', aplicacion_nombre, aplicacion_id),
                    ', ' ORDER BY aplicacion_id)
    INTO huerfanas FROM sec_aplicaciones_sin_root(v_usuario);

  IF huerfanas IS NOT NULL THEN
    -- El prefijo SEC_SIN_ROOT: es el contrato con respuestaSiDejaSinRoot. Va en
    -- el MENSAJE y no solo en el ERRCODE porque NO ESTÁ VERIFICADO cómo expone
    -- Prisma un SQLSTATE de usuario por el camino del ORM.
    RAISE EXCEPTION 'SEC_SIN_ROOT: la operación deja sin ningún usuario root a: %', huerfanas
      USING ERRCODE = 'S1R00',
            HINT = 'Asignale el rol Root de esa aplicación a otro usuario ACTIVO '
                || 'antes de desactivar a este. Recuperación: '
                || 'pnpm bootstrap:root -- --usuario <username> --aplicacion <id>';
  END IF;
  RETURN NULL;   -- AFTER: el retorno se ignora
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_baja_no_deja_sin_root ON usuarios;
CREATE TRIGGER trg_usuarios_baja_no_deja_sin_root
  AFTER UPDATE OF estado ON usuarios
  FOR EACH ROW
  WHEN (OLD.estado = 'A' AND NEW.estado <> 'A')
  EXECUTE FUNCTION sec_trg_usuarios_no_dejar_sin_root();

DROP TRIGGER IF EXISTS trg_usuarios_delete_no_deja_sin_root ON usuarios;
CREATE TRIGGER trg_usuarios_delete_no_deja_sin_root
  AFTER DELETE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION sec_trg_usuarios_no_dejar_sin_root();
```

**Cinco cosas que hay que decir en voz alta sobre este DDL:**

1. **`ROW` con `WHEN`, no `STATEMENT`.** El `WHEN (OLD.estado='A' AND NEW.estado<>'A')` hace que el trigger **no pueda ser disparado por las escrituras calientes del sistema**: ni el `fechaUltimoLogin` de cada login (`responses.ts:67`, que corre en cada login exitoso de las cuatro aplicaciones), ni el backfill de nombre/mail desde AD (`resolveCredentials.ts:405-435`). La variante statement-level necesitaría transition tables, que PostgreSQL prohíbe en un trigger `UPDATE OF <columna>`: habría que dispararlo en **todo** update a `usuarios`. Con el delta topeado en 20, el costo del ROW son ≤20 evaluaciones de una consulta sobre 6 aplicaciones y unas decenas de roles.
2. **Por qué el `UPDATE` va acotado al usuario (D20).** Una postcondición global dependiente de `now()` **se viola sola**: el día que venza la asignación Root de app 6 de dmedaglia —o que alguien cree un rol "Root" en otra aplicación y no lo asigne—, `sec_aplicaciones_sin_root()` empieza a devolver filas sin que nadie escriba nada, y desde ese instante **toda desactivación de cualquier usuario falla**, con un mensaje que habla de Granel mientras el admin editaba a otra persona. Es un brick por caducidad de fecha. Acotado al usuario, una baja solo puede huerfanizar las aplicaciones donde **ese** usuario era root, que es la única pregunta que una baja puede hacer.
3. **Por qué el `DELETE` va global.** En un `AFTER DELETE`, las filas de `usuario_roles` ya se fueron por cascada, así que el scope por usuario daría vacío y el trigger no chequearía nada. Y global es inofensivo acá: **no hay ningún hard delete de `usuario` en todo el repo** (`grep -rn "usuario\.delete\|usuario\.deleteMany" src/ scripts/` → cero hits; el DELETE del endpoint es soft, `[id]/route.ts:283-290`). O sea que ese trigger solo se dispara ante SQL a mano, que es exactamente donde querés la versión paranoica.
4. **La invariante se ensancha y muerde una fila real el día uno.** Hoy `verificarQueQuedaRoot` solo cuenta la aplicación 1, así que el DELETE de dmedaglia se acepta porque jgomez conserva app 1. Con el trigger, **ese DELETE empieza a dar 409, porque Granel tiene exactamente un root vigente y es dmedaglia**. Es el arreglo buscado, pero la primera vez va a parecer un bug: por eso **P3 es prerrequisito y no seguimiento** — `pnpm bootstrap:root -- --usuario <x> --aplicacion 6` **antes** de instalar el trigger, y volver a medir.
5. **El trigger es derrotable por quien tenga la clave de la base.** `DATABASE_URL` conecta como `postgres`, que es superusuario y puede `SET session_replication_role = replica`. Esta capa frena accidentes y frena código que se olvidó de preguntar; **no frena a alguien con la clave**. Decirlo, y no dejar implícito que la base es una bóveda (RA-5).

#### 5.5.2 Capa 2: el error usable, y lo que deliberadamente no se toca

**El cambio obligatorio es uno solo: `respuestaSiDejaSinRoot` aprende el marcador.**

Hoy el flujo del panel es: `update` → `verificarQueQuedaRoot` tira `SistemaSinRootError` → `respuestaSiDejaSinRoot` (`permisos.ts:419-431`) → 409 con `codigo` y una frase accionable. Con el trigger puesto, el `AFTER ROW` dispara **al final del `UPDATE`, o sea antes de que `verificarQueQuedaRoot` llegue a correr**: el error de JS queda inalcanzable para ese caso y lo que sale es un error crudo de Prisma que cae al `{error: error.message}` con status 500 (`[id]/route.ts:237-241`). **Sería una regresión en el único camino que existe hoy para prevenir un lockout**, y es la forma más probable de mandar esto mal.

```ts
// src/lib/permisos.ts — tercera rama de respuestaSiDejaSinRoot (:419)
const MARCADOR_SIN_ROOT = "SEC_SIN_ROOT";

export function respuestaSiDejaSinRoot(error: unknown): NextResponse | null {
  if (error instanceof SistemaSinRootError || error instanceof AutoQuitarseRootError) {
    return NextResponse.json(
      { success: false, error: error.message, codigo: error.name },
      { status: 409 },
    );
  }
  // El trigger de §5.5.1. Se matchea el MARCADOR de texto y también el ERRCODE,
  // porque NO ESTÁ VERIFICADO cómo expone Prisma un SQLSTATE de usuario por el
  // camino del ORM (P2010 con meta.code vs PrismaClientUnknownRequestError con
  // el mensaje adentro). Matchear los dos aguanta las dos posibilidades.
  const msg = (error as { message?: string })?.message ?? "";
  const code = (error as { meta?: { code?: string } })?.meta?.code ?? "";
  if (msg.includes(MARCADOR_SIN_ROOT) || code === "S1R00") {
    return NextResponse.json(
      { success: false, codigo: "SistemaSinRootError",
        error: msg.slice(msg.indexOf(MARCADOR_SIN_ROOT)).replace(`${MARCADOR_SIN_ROOT}: `, "") },
      { status: 409 },
    );
  }
  return null;
}
```

Una función, **los 7 call sites arreglados de una**: para eso existía el helper.

**Lo que NO se hace, y es una decisión, no un olvido (D20):** no se ensancha `verificarQueQuedaRoot` a todas las aplicaciones, no se agrega `usuariosRootDeAplicacion`, no se agrega `aplicacionesQueQuedanSinRoot`, no se ensancha `ClientePrismaRoles` y no se le cambia el constructor a `SistemaSinRootError`. Tres razones, las tres verificadas:

- **En el camino de `estado`, la versión ensanchada es inalcanzable**: el trigger dispara primero. La mitad de su valor declarado no existe.
- **Rompe seis tests, y no por donde se cree.** El cliente falso de `scripts/test-root-por-rol.ts:409` termina en `} as never;`, y **`never` es asignable a cualquier tipo**: ensanchar el tipo no rompe la compilación de nada. Lo que pasa es peor: los seis tests que llaman `verificarQueQuedaRoot` reciben un objeto sin `aplicacion` y explotan en runtime con `TypeError`. Y si alguien lo "arregla" defensivo (`cliente.aplicacion?.findMany ?? []`), **la capa nueva queda silenciosamente desactivada en los tests y verde en `pnpm test`**.
- **Los otros 5 call sites** (`roles`, `aplicaciones`, `usuarios/:id/roles`) escriben tablas que el job no toca y que no tienen trigger: su comportamiento queda **idéntico**. Cuatro triggers más en el mismo cambio cuadruplican la chance de romper el panel por un agujero que este job no abre.

`AutoQuitarseRootError` tampoco se toca: no es una invariante de base (depende de **quién** pregunta y de si confirmó), vive en JS y sigue corriendo. El trigger solo dispara cuando el conteo llegaría a cero, y el caso de auto-quitarse deja ≥1.

Y una precisión de firma: **`aplicacionesRootDeUsuario` (`permisos.ts:272`) hoy no acepta cliente** y consulta el singleton de módulo. El job la llama con su propio `PrismaClient` de `connection_limit=1` (§5.8.2), así que se le agrega un parámetro `cliente` con default, igual que lo tiene `usuariosRootDeSecapi`. Sin eso, el job termina con **dos** clientes contra la misma base y el argumento de que `connection_limit=1` ata el lock a la corrida deja de ser toda la verdad.

#### 5.5.3 Capa 3: el job nunca desactiva a un root

**Regla dura: si el origen pide `'I'` sobre un usuario que tiene el rol Root de cualquier aplicación, el job registra `OMITIDO` con `motivo='ES_ROOT'`, incrementa `protegidos_por_root`, y sigue con el resto del plan.** No aborta (CA10).

- **El criterio se reusa, no se reinventa**: `aplicacionesRootDeUsuario` (`permisos.ts:272`), que llama a `aplicacionesRootDe` (`:225-249`) — el mismo nombre normalizado, rol activo, aplicación activa y asignación vigente que usa todo el resto del sistema. **Sin filtrar por aplicación**: el bug de alcance de `usuariosRootDeSecapi` (`:327`) es precisamente lo que D8 corrige.
- **El conjunto se recalcula en cada corrida, y no puede ser una lista fija**: `applyAdmsecGroupRoles.ts:82-89` otorga el rol Root de trackmovil a cualquiera del grupo 1 de ADMSEC **en el login**, sin que ningún admin intervenga. El conjunto de roots cambia solo, del otro lado, sin avisar (RA-6).
- **`protegidos_por_root` va en el reporte de todas las mañanas con su tamaño, y un cambio en ese número es un evento destacado.** Es la única visibilidad que tenemos sobre una decisión que se toma en otro sistema.
- **Un root con la asignación vencida es invisible para esta capa y para el trigger.** Si su `usuario_roles.fecha_hasta` ya pasó, no está en el conjunto: el job lo puede desactivar y el trigger no se opone, porque los dos usan el mismo criterio de vigencia — y si era el único de su aplicación, la aplicación queda sin root **con la aprobación de las dos guardias**. `dmedaglia` está exactamente en ese perfil de riesgo. Lo que lo tapa es PF8 (`sec_aplicaciones_sin_root()` en cada corrida, antes de escribir) más P3 (un segundo root en Granel). **No hay una tercera capa acá y hay que decirlo: la vigencia es un dato que alguien tiene que mantener.**

#### 5.5.4 La escalera de incendio

**El problema exacto:** `scripts/bootstrap-root.ts:153-160` se niega cuando `usuario.estado !== 'A'`, con un motivo correcto (darle el rol a un inactivo no sirve, porque `resolveUsuario` exige `'A'`). Pero **el modo de falla de este job es precisamente dejar a un root inactivo**: la herramienta que existe para el lockout se niega justo ante la firma del lockout, y no hay otra puerta que SQL a mano.

**Cambio mínimo: agregar el verbo que falta, no debilitar el chequeo.**

- **Flag `--activar`, default `false`.** Sin él, **comportamiento idéntico al de hoy**, incluida la negativa de `:153-160` con su mensaje.
- Con él, y solo si el usuario no está en `'A'`: `update({ estado:'A', fechaBaja:null })` —también `fecha_baja`, porque dejar fecha de baja en un usuario activo es la inconsistencia que nadie mira pero cualquiera que abra la ficha ve—, imprime `⚠ Se REACTIVÓ a <username> (estado '<X>' → 'A')` bien fuerte (reactivar a alguien que el origen dice que está afuera es una decisión, no una reparación), y recién ahí sigue a otorgar el rol.
- **El `update` de `estado`/`fechaBaja` va primero y solo.** Las escrituras de rastro —una fila `tipo='RESCATE'` en `sincronizacion_corridas` y un detalle con `accion='RESCATE_MANUAL'`— van después y son **best-effort con `console.warn`**: `bootstrap-root.ts:20-24` existe justamente para *"una restauración de un backup viejo, un rol renombrado por SQL"*, escenarios donde esas tablas pueden no existir o no ser coherentes. **Un rescate que falla porque no pudo escribir su propio registro es una escalera de incendio con candado.**
- **La reincidencia ya está cubierta, y conviene decir por qué en vez de agregar un mecanismo.** El miedo razonable es: si el origen sigue diciendo `'N'` y el usuario está en el alcance, el job de las 02:30 lo vuelve a poner en `'I'` esa misma noche, y la escalera de incendio devuelve al incendio. No pasa, y no hace falta una columna de pausa ni un motivo nuevo: **`bootstrap-root --activar` reactiva y otorga el rol Root en el mismo comando**, así que desde ese instante la persona es root vigente y §5.5.3 la protege — el job la omite con `ES_ROOT` y lo publica en el reporte de todas las mañanas. La única forma de perder esa cobertura es rescatar a alguien **sin** darle el rol, que es precisamente lo que este script no hace.
- **`bootstrap-root.ts` deja de mentir sobre las aplicaciones** (P6). Hoy `:118` llama `usuariosRootDeSecapi()` **sin argumentos** y `:126-129` imprime siempre los roots de la app 1: el `--aplicacion 6` solo cambia el listado de roles de `:101`. Un operador a las 3 de la mañana lee "dmedaglia, jgomez" y concluye que Granel está sano. **Es el peor lugar posible del sistema para una afirmación falsa** — está adentro de la escalera de incendio.

**Runbook, para pegar tal cual:**

```bash
# ══ LOCKOUT: nadie puede administrar el sistema ═══════════════════════════
# Síntoma A: el login responde "Usuario inactivo" (403, resolveCredentials.ts:444)
# Síntoma B: entra, pero todo /api/db devuelve 401 (resolveUsuario exige 'A')
# Síntoma C: el panel muestra todo gris

# 0. Cortar la reincidencia ANTES de tocar nada. El job corre 02:30 por pm2.
ssh secapi-prod
sudo -u node pm2 delete secapi-sync-admsec        # `stop` NO desregistra el cron
sudo -u node pm2 save

# 1. Diagnóstico (no escribe nada; usa el criterio del código, no el ojo)
cd /var/www/secapi
sudo -u node pnpm bootstrap:root                      # roots de la app 1
sudo -u node pnpm bootstrap:root -- --aplicacion 6    # roots de Granel (tras P6)

# 2. Reactivar Y devolver el rol, un comando por aplicación.
sudo -u node pnpm bootstrap:root -- --usuario jgomez --activar
sudo -u node pnpm bootstrap:root -- --usuario jgomez --activar --aplicacion 6

# 3. Confirmar la invariante desde la base. 0 filas = sano.
psql "$DATABASE_URL" -c "SELECT * FROM sec_aplicaciones_sin_root();"

# 4. PROBAR EL LOGIN DE VERDAD. "El UPDATE no dio error" no es "puedo entrar".
curl -s -X POST https://secapi.glp.riogas.com.uy/api/db/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"jgomez","password":"<...>"}' | head -c 300

# 5. Recién con el paso 4 en verde: entender por qué pasó, y volver a prender.
psql "$DATABASE_URL" -c \
  "SELECT username, accion, valor_anterior, valor_nuevo, aplicada, motivo
     FROM sincronizacion_detalle
    WHERE corrida_id = (SELECT max(id) FROM sincronizacion_corridas) ORDER BY id;"
sudo -u node pm2 start pm2.config.js --only secapi-sync-admsec && sudo -u node pm2 save

# ══ Si pnpm no arranca (build roto, node_modules a medias) ════════════════
# Último recurso. Es lo ÚNICO que hay HOY, y por eso existe el paso 2.
# Ids de rol medidos el 2026-09-01: 57=app1 SecuritySuite, 55=app3 GOYA,
#                                   52=app5 trackmovil, 60=app6 Granel.
psql "$DATABASE_URL" <<'SQL'
BEGIN;
  UPDATE usuarios SET estado='A', fecha_baja=NULL WHERE lower(username)='jgomez';
  INSERT INTO usuario_roles (usuario_id, rol_id, fecha_desde, fecha_hasta)
  SELECT u.id, 57, NULL, NULL FROM usuarios u WHERE lower(u.username)='jgomez'
  ON CONFLICT (usuario_id, rol_id) DO UPDATE SET fecha_desde=NULL, fecha_hasta=NULL;
  -- y, si el lockout es de otra aplicación, repetir con 55 / 52 / 60.
  SELECT * FROM sec_aplicaciones_sin_root();   -- TIENE que devolver 0 filas
COMMIT;
SQL
```

**La reactivación nunca choca con el trigger**: solo dispara en `'A' → no-'A'`. El camino de vuelta está abierto por diseño, siempre.

#### 5.5.5 Validación de `estado` en los tres bordes

Hoy `estado` no está validado en ningún lado, y el resultado de escribir cualquier otra cosa es un **split-brain silencioso**: `resolveCredentials.ts:444` bloquea solo el literal `'I'`, `permisos.ts:726` exige el literal `'A'` y `usuariosRootDeSecapi` (`:339`) también. O sea que un usuario en `'X'` **loguea, recibe token, come 401 en cada llamada a `/api/db` y deja de ser root en silencio**. No es hipotético: `desde_sistema` es la demostración de qué le pasa a una columna de un carácter sin validar en este código.

**Borde 1 — la base.** El CHECK de §5.5.1. Es el único que cubre `scripts/`, una sesión de `psql` y el Prisma directo de este job. Es la definición de la columna, así que no puede derivar.

**Borde 2 — el código, un tipo y un guard compartidos.** Prisma no puede tipar un `@db.Char(1)` como unión sin un enum de PG, y crear un enum acá reescribe la columna y toda consulta contra ella (y el schema **no tiene ni un solo `enum`**, §5.6.1).

```ts
// src/lib/usuarios/estado.ts
export const ESTADOS = ["A", "I"] as const;
export type EstadoUsuario = (typeof ESTADOS)[number];
export function esEstadoValido(v: unknown): v is EstadoUsuario {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}
```

**Borde 3 — los handlers**, para que la persona vea un 400 con una frase y no un error de constraint saliendo como 500 opaco. Son **tres** puntos y ninguno es opcional:

```ts
// src/app/api/db/usuarios/[id]/route.ts, dentro del if de :135 y ANTES del :138
if (!esEstadoValido(body.estado)) {
  return NextResponse.json({
    success: false, codigo: "ESTADO_INVALIDO",
    error: `Estado inválido: "${body.estado}". Los únicos válidos son 'A' (activo) e 'I' (inactivo).`,
  }, { status: 400 });
}
```

1. **El PUT** (`usuarios/[id]/route.ts:135`), como arriba.
2. **El POST de alta** (`usuarios/route.ts:187`), que hoy es `estado: body.estado || "A"` **sin validación y sin chequeo de root, en un endpoint de nivel ADMIN**. O sea que una mesa de ayuda delegada puede crear un usuario en `'X'` — y **con el CHECK puesto eso pasa a devolver 500 por el catch genérico**. Es un cambio obligatorio del mismo commit, no un "lo mismo en el otro lado".
3. **El job**, en el mapeo. Es seguro por construcción (`comparar.ts:55-56` solo produce `'A'` o `'I'`), pero se valida igual en el borde, porque "seguro por construcción" es una propiedad del código de hoy.

**Qué pasa con las filas existentes: nada, no hay ninguna que arreglar** (853 `'A'` + 1 `'I'`, cero inválidas). La consulta de limpieza va igual en el runbook del deploy, porque el `ALTER` se aplica sobre una base viva:

```sql
-- Correr ANTES del ALTER. Hoy (2026-09-01) devuelve 0 filas.
SELECT id, username, estado, length(estado) AS len
  FROM usuarios WHERE estado NOT IN ('A','I');

-- Si devolviera algo: NO normalizar a ciegas a 'A'. Un usuario que hoy no puede
-- usar /api/db pasaría a estar activo y elegible para root sin que nadie lo haya
-- decidido. Se revisa fila por fila y se deja constancia.
```

#### 5.5.6 El gate de UI (D2)

El patrón existente es: un hook contesta "¿puede?", y el componente renderiza **deshabilitado con el motivo en tooltip, nunca escondido** — el argumento está escrito en `src/components/ui/solo-root.tsx:26-30` y aplica textual acá: esconder hace que la persona crea que la función no existe y termine llamando a Soporte.

**No se dobla `usePuedeAdministrar`**: ese hook contesta una pregunta sobre la **persona** (`usePuedeAdministrar.ts:104`: root pasa siempre). "El estado de este usuario lo gobierna el AS400" es una pregunta sobre la **fila**, y bloquea también a un root. Hermana con la misma forma:

```ts
// src/hooks/useEstadoGobernado.ts
export const MOTIVO_ESTADO_GOBERNADO =
  "El alta y la baja de este usuario las manda Gestión de Sistemas (AS400)";

export function useEstadoGobernado(u: { gobernadoPor: string | null }) {
  return u.gobernadoPor
    ? { puede: false,
        motivo: `${MOTIVO_ESTADO_GOBERNADO}. Cambialo allá: la próxima sincronización lo replica acá.` }
    : { puede: true, motivo: "" };
}
```

`gobernadoPor` baja de `GET /api/db/usuarios/:id` y del `select` de la grilla como un campo más, por left join sobre `sincronizacion_alcance`.

**Trabajo real que hay que presupuestar, y que un diseño dio por hecho equivocadamente:** `BotonRoot` (`solo-root.tsx:77-82`) **no soporta "deshabilitado + tooltip" para quien sí puede**. Su rama `if (puede)` devuelve un `<Button>` pelado y **descarta el `motivo`**. Pasarle `disabled`+`motivo` en una fila gobernada le muestra a los dos roots —que son justamente quienes van a chocar con esto— un botón gris sin explicación, o sea exactamente lo que `solo-root.tsx:88-90` declara inaceptable. Hace falta una **tercera rama** (`puede && disabledExterno && motivo` → `<Tooltip>` + `<Button disabled>`). Es una modificación de componente, no un prop.

Dónde se pinta:

- `UsuarioForm.tsx:490-503` — el `<Select>` de Estado queda `disabled` dentro de un `<Tooltip>` con el motivo más "Sincronizado del AS400 el DD/MM 02:30". **No escondido**: la persona tiene que poder ver el estado; lo que no puede es fijarlo.
- `Usuarios.tsx:401-409` — el botón destructivo (Desactivar) deshabilitado con el mismo tooltip.
- `Usuarios.tsx:313-323` — un candado chico junto al badge de Estado, para que se lea en la grilla sin abrir la ficha.

**Si igual llega un PUT** (curl, pestaña vieja, bundle desactualizado): **409 Conflict, no 403.** En este código 403 significa "vos, la persona, no tenés el permiso" (`prohibido()` en `[id]/route.ts:126-130`, `denegar()` en `apiGuard.ts:864-870`). Acá la persona puede ser root y tener todos los permisos: lo que está mal es de quién es el estado del recurso. Y 409 ya es el verbo del código para "el payload es válido, el estado resultante no" (`permisos.ts:413-416`).

```json
{ "success": false,
  "codigo": "ESTADO_GOBERNADO_POR_ORIGEN",
  "error": "El estado de este usuario lo administra Gestión de Sistemas (AS400). Cambialo allá: la próxima sincronización (02:30) lo replica acá. Si tiene que cambiar YA y desde secapi, sacalo del alcance del job.",
  "detalle": { "usuid": 3922, "ultimaSincronizacion": "2026-09-15T05:30:11Z", "valorDelOrigen": "N" } }
```

Cómo lo distingue el front sin parsear texto:

| Caso | status | `body.codigo` | header `x-auth-guard` |
|---|---|---|---|
| El guard te frenó | 401/403 | ausente | **presente** (`apiGuard.ts:867`) |
| El handler te frenó por permiso | 403 | ausente | ausente |
| Estado gobernado | **409** | **`ESTADO_GOBERNADO_POR_ORIGEN`** | ausente |
| Dejaría sin root | 409 | `SistemaSinRootError` | ausente |

**Dónde va el chequeo — las dos puertas, no una.** En el PUT, justo después del `if (body.estado !== undefined && body.estado !== existing.estado)` de `[id]/route.ts:135` y **antes** del chequeo de root de `:138` (porque la respuesta es "nadie, ni siquiera root, por esta puerta", y preguntar el permiso primero le daría 403 a un root, que es la historia equivocada). Y **lo mismo en el DELETE** (`[id]/route.ts:284`), que es la **otra puerta a `estado='I'`** y escribe además `fechaBaja` (`:287-290`). El comentario de `:246-254` ya deja registrado que olvidarse de la segunda puerta fue el último bug de esta zona.

**La trampa del round-trip:** el panel manda la ficha entera, así que `body.estado` llega en cada guardado aunque nadie lo haya tocado (`UsuarioForm.tsx:178`). El chequeo tiene que dispararse **solo cuando el valor cambia** — que es exactamente lo que ya hace la línea `:135`. Si se pierde, guardar el teléfono de un usuario gobernado devuelve 409.

**Trabajo nuevo, no gratis:** ni `Usuarios.tsx` ni `UsuarioForm.tsx` leen `codigo` hoy; el mecanismo existe (`services/api.ts:1603` cuelga `json.codigo` del error, y `AsignarRolesModal.tsx:235` ya lo consume), pero acá hay que cablearlo.

---

### 5.6 Modelo de datos (D9)

#### 5.6.1 Convenciones respetadas

Verificadas contra `prisma/schema.prisma` (277 líneas, 16 modelos): modelo PascalCase singular + `@@map("snake_case_plural")`; campos camelCase con `@map()` cuando son compuestos; `id Int @id @default(autoincrement())`; fechas `DateTime @db.Timestamp(6)` (**nunca `Timestamptz`**); estados como `String @db.Char(1)` o `@db.VarChar(20)`; **cero `enum` en todo el schema**; índices `@@index([campo], map: "idx_<tabla>_<campo>")`. PK no-autoincrement ya existe (`UsuarioRol`, `:112`).

#### 5.6.2 Los modelos

```prisma
// =====================================================================
// Sincronización de estado ADMSEC.USUARIOS → usuarios (D9)
//
// Se crean ANTES de la primera ejecución real: un job que escribe `estado`
// sobre el padrón sin dejar rastro no se puede auditar ni revertir, y
// `usuarios` no tiene ninguna fecha de modificación.
//
// Convención de esta familia: NADA se borra ni se pisa.
// =====================================================================

model SincronizacionCorrida {
  id           Int       @id @default(autoincrement())

  /// SINCRONIZACION | SIEMBRA | RESCATE
  tipo         String    @default("SINCRONIZACION") @db.VarChar(20)
  /// DRY_RUN | REAL. Ortogonal a `resultado`: un dry-run también aborta y falla.
  /// Es el modo RESUELTO (§5.8.3), no el pedido.
  modo         String    @db.VarChar(10)
  /// EN_CURSO | OK | PARCIAL | ABORTADA_POR_TOPE | ABORTADA_PREFLIGHT
  ///          | FALLIDA | SALTADA_POR_LOCK | INTERRUMPIDA
  /// Nace EN_CURSO: si el proceso muere de un OOM, la fila queda EN_CURSO con
  /// `fin` en null, y eso ES el dato.
  resultado    String    @default("EN_CURSO") @db.VarChar(24)
  /// "cron" | "manual:<username>" | "rescate:<username>"
  disparadaPor String    @default("cron") @map("disparada_por") @db.VarChar(60)

  inicio       DateTime  @default(now()) @db.Timestamp(6)
  fin          DateTime? @db.Timestamp(6)

  // ── Quién escribió: indispensable con base compartida entre dev y prod ──
  host         String?   @db.VarChar(60)
  pid          Int?
  nodeEnv      String?   @map("node_env") @db.VarChar(20)
  commit       String?   @db.VarChar(40)

  // ── Lectura del origen ──────────────────────────────────────────────────
  origenFilas       Int? @map("origen_filas")            // esperado 1.106
  origenHabilitados Int? @map("origen_habilitados")      // esperado 347
  origenLoginsUnicos Int? @map("origen_logins_unicos")   // esperado 1.102
  padronLocal       Int? @map("padron_local")            // 854: denominador de D6
  alcanceGobernado  Int? @map("alcance_gobernado")       // D23: 0 es FALLO

  // ── Señal de USUDTUPD (D5/D10) ──────────────────────────────────────────
  // La columna canónica es el TEXTO, tal cual lo devolvió DB2. Convertir a
  // DateTime es lossy: Timestamp(6) es naive, el AS400 responde en local −03 y
  // Postgres corre en UTC, y un watermark corrido 3 h saltea cambios en silencio.
  origenUsudtupdMax       String? @map("origen_usudtupd_max") @db.VarChar(26)
  /// COUNT(DISTINCT USUDTUPD) del padrón entero. HOY VALE 1. Que siga en 1
  /// después de semanas es la prueba de una sola cifra de que nunca se movió.
  origenUsudtupdDistintos Int?    @map("origen_usudtupd_distintos")
  origenUsudtupdNulos     Int?    @map("origen_usudtupd_nulos")
  diasSinMoverUsudtupd    Int?    @map("dias_sin_mover_usudtupd")
  /// OK | CONGELADO | RESELLADO | SIN_DATO
  usudtupdVeredicto       String  @default("SIN_DATO") @map("usudtupd_veredicto") @db.VarChar(16)

  // ── Testigo AUDITORIA (D11) ─────────────────────────────────────────────
  testigoTotal      Int?    @map("testigo_total")        // sin filtro de relevancia
  testigoRelevantes Int?    @map("testigo_relevantes")   // (USUHABILITADO) | INS | DLT
  testigoUltimoAudid Int?   @map("testigo_ultimo_audid")
  testigoUltima     String? @map("testigo_ultima") @db.VarChar(26)
  /// 'S' si la ventana de 48 h con día hábil devolvió 0 entradas totales.
  testigoCaido      String  @default("N") @map("testigo_caido") @db.Char(1)

  // ── Contadores del plan ─────────────────────────────────────────────────
  activados        Int @default(0)
  desactivados     Int @default(0)
  altas            Int @default(0)
  omitidos         Int @default(0)
  errores          Int @default(0)
  /// D1: gobernados que NO vinieron del origen. Se REPORTAN, nunca se desactivan.
  /// Contarlos aparte de `omitidos` es lo que deja ver si el origen se vacía,
  /// y tiene umbral propio (§6.1).
  ausentesEnOrigen Int @default(0) @map("ausentes_en_origen")
  /// Usuarios que el job se negó a desactivar por tener rol Root (§5.5.3).
  protegidosPorRoot Int @default(0) @map("protegidos_por_root")

  // ── Cierre ──────────────────────────────────────────────────────────────
  /// Por qué abortó o falló. Texto libre y en castellano: lo lee una persona
  /// a las 8 de la mañana, no un parser.
  motivo          String?
  nota            String?
  desvioRelojSeg  Int?    @map("desvio_reloj_seg")
  /// 'S' si el detalle se cortó por el tope de 500 filas por corrida.
  detalleTruncado String  @default("N") @map("detalle_truncado") @db.Char(1)

  // ── Reporte: un canal que falla en silencio tiene el mismo modo de falla
  //    que el watermark congelado. Se registra si salió.
  reporteEnviado String  @default("N") @map("reporte_enviado") @db.Char(1)
  reporteError   String? @map("reporte_error")

  detalles SincronizacionDetalle[]

  @@index([inicio], map: "idx_sinc_corridas_inicio")
  @@index([resultado], map: "idx_sinc_corridas_resultado")
  @@map("sincronizacion_corridas")
}

model SincronizacionDetalle {
  id        Int @id @default(autoincrement())
  corridaId Int @map("corrida_id")

  /// FK opcional: un OMITIDO_SIN_FILA_LOCAL tiene username y no tiene id, y ese
  /// renglón es información — dice que hay gente cambiando de estado del otro
  /// lado que el job no está mirando.
  usuarioId     Int?    @map("usuario_id")
  /// El login TAL COMO vino del AS400. Identidad durable: sobrevive si la fila
  /// local se borra.
  username      String  @db.VarChar(60)
  usernameLocal String? @map("username_local") @db.VarChar(60)
  origenUsuid   Int?    @map("origen_usuid")

  /// ACTIVAR | DESACTIVAR | ALTA | OMITIDO | ERROR | RESCATE_MANUAL
  accion   String @db.VarChar(20)
  /// ¿Se escribió de verdad? En DRY_RUN es SIEMPRE 'N'. Es la columna sobre la
  /// que trabajaría un rollback: revertir lo que nunca se aplicó es corromper.
  aplicada String @default("N") @db.Char(1)

  valorAnterior String? @map("valor_anterior") @db.VarChar(20)
  valorNuevo    String? @map("valor_nuevo") @db.VarChar(20)

  // ── Origen del dato: por qué el job creyó que había que hacer esto ───────
  /// USUHABILITADO crudo ('S'/'N') que produjo la decisión. D2 dice que el
  /// AS400 es autoritativo: esta es la frase textual del autoritativo.
  origenHabilitado String? @map("origen_habilitado") @db.Char(1)
  origenUsudtupd   String? @map("origen_usudtupd") @db.VarChar(26)
  /// USUAUTAD NORMALIZADO ('A'/'G'), nunca el crudo: users.js:78 lo devuelve sin
  /// TRIM y puede venir null o ' '.
  origenAutad      String? @map("origen_autad") @db.Char(1)
  /// USUFCHULTDESACTIVACION. ORIENTATIVO: 761 filas en '00000000' y 86
  /// habilitados con fecha vieja. Nunca decide nada, nunca va a fecha_baja.
  origenFchDesact  String? @map("origen_fch_desact") @db.VarChar(8)
  /// Evidencia de AUDITORIA (D11), si la hay en la ventana de 48 h.
  audId            Int?    @map("aud_id")
  audFchhora       String? @map("aud_fchhora") @db.VarChar(26)
  /// AUDUSUCON, NO AudApp: AUDAPP no discrimina el programa (las bajas salen
  /// con 'ULOGIN', igual que los logins).
  audUsucon        String? @map("aud_usucon") @db.VarChar(20)

  /// Motivo del OMITIDO (FUERA_DE_ALCANCE, ES_ROOT, ORIGEN_SIN_CONSENSO,
  /// AMBIGUO_LOCAL, SIN_FILA_LOCAL, AUSENTE_EN_ORIGEN, CUENTA_SISTEMA,
  /// ORIGEN_BORRADO, OMITIDO_CAS) o el detalle del error.
  motivo String?
  fecha  DateTime @default(now()) @db.Timestamp(6)

  corrida SincronizacionCorrida @relation(fields: [corridaId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  /// SetNull y NO Cascade, a diferencia del resto del schema: si algún día se
  /// borra una fila de `usuarios` en duro, la evidencia de qué le hizo el job
  /// NO se puede ir con ella.
  usuario Usuario?              @relation(fields: [usuarioId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@unique([corridaId, username], map: "uq_sinc_detalle_corrida_username")
  @@index([corridaId], map: "idx_sinc_detalle_corrida")
  @@index([usuarioId], map: "idx_sinc_detalle_usuario")
  @@index([username], map: "idx_sinc_detalle_username")
  @@map("sincronizacion_detalle")
}

/// Estado persistente del job. Clave/valor PURO: nada de columnas cuyo
/// significado dependa de la clave — ese es el defecto de `desde_sistema` que
/// esta spec entera existe para no repetir.
///
/// Claves usadas:
///   sync:modo                            → 'DRY_RUN' | 'REAL'
///   admsec.auditoria:ultimo_audid        → entero como texto
///   admsec.usuarios:usudtupd_max         → texto crudo de DB2, 26 chars
///   admsec.usuarios:usudtupd_cambio_en   → fecha ISO en que usudtupd_max cambió
///   admsec.usuarios:ratio_habilitados    → ratio de la corrida anterior (PF4)
model SincronizacionEstado {
  clave          String   @id @db.VarChar(60)
  valor          String?  @db.VarChar(120)
  establecidoPor String?  @map("establecido_por") @db.VarChar(60)
  establecidoEn  DateTime @default(now()) @map("establecido_en") @db.Timestamp(6)
  nota           String?

  @@map("sincronizacion_estado")
}
```

Y en `model Usuario`, tres líneas:

```prisma
  /// Cuándo y quién cambió `estado` por última vez. NO es un `updatedAt`
  /// genérico: ver §5.6.3.
  estadoCambiadoEn  DateTime? @map("estado_cambiado_en") @db.Timestamp(6)
  /// "sync:admsec" | "panel:<username>" | "import:<username>"
  estadoCambiadoPor String?   @map("estado_cambiado_por") @db.VarChar(60)

  sincronizaciones SincronizacionDetalle[]
  sincAlcance      SincronizacionAlcance[]
```

**Decisiones de forma que hay que justificar, porque son podas:**

- **Un solo watermark de `AUDITORIA`, y es un entero** (`ultimo_audid`). Nada de columnas `DateTime` de watermark: guardarlas al lado del texto invita a que alguien ordene o filtre por la lossy, que es el bug de 3 horas que se está evitando. `inicio` ya ordena las corridas.
- **No hay aparato de reversión en v1** (`tipo='REVERSION'`, self-relation, `revertidoEnCorrida`). Con el tope en ~5 cambios por noche y una regla de "no revertir nada de más de 30 días", la primera reversión es un script que lee `sincronizacion_detalle WHERE aplicada='S'`, hace compare-and-swap contra el valor actual y escribe. La mitad que importa (`valorAnterior` + `aplicada`) ya está. El modelo se agrega cuando exista la primera reversión, no antes de la primera corrida.
- **No hay retención.** Los propios números: 365 corridas/año a ~400 bytes = ~150 KB; el detalle, con 77 cambios de estado en 8 meses medidos, no llega a 200 KB/año. **Diez años entran en ~3 MB.** Un `deleteMany` a las 02:30 dentro de un job cuyo objetivo declarado es no hacer escrituras sorpresivas es superficie negativa. Queda solo el tope de **500 filas de detalle por corrida** con `detalleTruncado='S'` cuando corta — que existe porque los `OMITIDO` no tienen tope natural.
- **`@@unique([corridaId, username])`** cierra el caso del duplicado de origen emitiendo dos filas contradictorias en la misma corrida.

#### 5.6.3 `updatedAt`: sí a dos columnas, NO a `@updatedAt`

`src/lib/auth/responses.ts:67` hace `prisma.usuario.update({ data: { fechaUltimoLogin: new Date() } })` **dentro de `buildSuccessResponse`**, o sea **en cada login exitoso de las cuatro aplicaciones**. Y hay dos escritores silenciosos más en el mismo camino (`resolveCredentials.ts:405-435`, backfill de nombre/email desde AD; `upsertExternalUser.ts:138`, re-vínculo por email).

Con `@updatedAt`, `updated_at` significaría *"la última vez que esta persona entró, o cambió de nombre en el AD, o cualquier otra cosa"*. **Es exactamente la enfermedad de `USUFCHPERMISOS`**: un timestamp que se mueve por el motivo equivocado y por eso no sirve para detectar nada. Agregarlo sería reproducir del lado de Postgres el mismo error que estamos yendo a arreglar del lado del AS400, con un nombre que promete lo contrario.

Lo que sí va son `estadoCambiadoEn` / `estadoCambiadoPor`, escritas **solo** por los caminos que tocan `estado`, ninguno en el path de login: `[id]/route.ts:218`/`:225` (PUT) → `panel:<username>`; `[id]/route.ts:285` (DELETE) → `panel:<username>`; el job → `sync:admsec`; `importar/route.ts:107` (alta) → `import:<username>`. Responden la pregunta que se hace de verdad —*quién cambió el estado de este usuario y cuándo*— que un `updated_at` genérico no puede responder porque no dice qué campo cambió. Backfill: **ninguno**; las 854 filas quedan en `NULL`, que significa "nunca se observó", y es literalmente cierto.

#### 5.6.4 Dónde vive el SQL que Prisma no expresa

**No hay `prisma/migrations/`** (solo `schema.prisma` y `test-connection.js`); el camino a la base es `prisma db push` (`package.json:14-15`). Prisma no modela CHECKs ni triggers, y **NO VERIFICADO** si un `db push` los tira en esta versión — pero el modo de falla (alguien corre `pnpm prisma:push` y la red desaparece sin que nadie se entere) se defiende barato y sin depender de la respuesta:

1. El DDL se versiona como `scripts/sql/blindaje-usuarios.sql`, **idempotente** (`DROP TRIGGER IF EXISTS` + `CREATE OR REPLACE` + `ADD CONSTRAINT` guardado por un `NOT EXISTS` sobre `pg_constraint`).
2. Se agrega `"db:blindaje": "psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f scripts/sql/blindaje-usuarios.sql"` a `package.json`.
3. **El job se niega a correr si el blindaje no está** (PF7). Una red que puede desaparecer sin ruido es peor que ninguna, porque el job se diseñó asumiéndola.
4. Se agrega la llamada a `db:blindaje` **después** del `prisma:push` en los scripts de deploy — teniendo presente que `deploy-dev.sh:161` se traga el error del push con un `|| echo 'ADVERTENCIA...'`, así que ese `||` hay que sacarlo o el fallo del schema pasa como una línea de log.

#### 5.6.5 La pantalla del panel

`/dashboard/sincronizacion`. El andamiaje es mecánico copiando `scripts/seed-docs-funcionalidad.ts`: un `scripts/seed-sincronizacion-funcionalidad.ts` crea el `Objeto` PAGE `key="sincronizacion"` con **`icon="activity"`** (está en `iconMap.ts:247`; **`refreshCw` no existe** y el Sidebar caería al ícono default, `Sidebar.tsx:60-62`), la `ObjetoAccion` `view`, la `Funcionalidad`, el vínculo al **rol 57** y el punto de menú colgado del **MENU raíz 18**, diferido con `--con-menu` hasta que la página esté desplegada.

**El corte de permisos va por la mitad de la pantalla:**

- **Lectura del historial: ADMIN.** El test de este repo (`apiGuard.ts:222`) es *"¿delegar esta operación es delegar root con otro nombre?"*. Leer qué usuarios se desactivaron anoche no otorga nada: es la misma clase de información que la grilla de usuarios (ADMIN, `apiGuard.ts:400-408`) y que `/usuarios/externos` (ADMIN, `:443-449`), y es la pregunta de mesa de ayuda — *"¿por qué Fulano no entra?"*. Si solo dos personas pueden responderla, el reporte se reenvía a mano y el registro deja de usarse.
- **Todo lo que cambia el comportamiento: ROOT.** Cambiar DRY_RUN→REAL, ejecutar a demanda, revertir. Motivo no argumentable: **escribir `estado` de un usuario ya exige ROOT** (`[id]/route.ts:135-140`) y el DELETE también (`apiGuard.ts:418-422`); habilitarlo para todos no puede ser delegable.

Entradas nuevas en `POLITICAS` (`apiGuard.ts`) — **obligatorias, no opcionales**: `scripts/test-api-guard.ts` falla si un handler nuevo no las declara, y **`:1136-1142` falla al revés si las políticas entran antes que los `route.ts`**, así que las dos cosas van en el mismo commit. Además `RUTAS_ADMIN` (`:667-693`) es una lista escrita a mano: sin agregar ahí las 3 rutas ADMIN nuevas, los tests de `:708` y `:719` no las cubren y pasan igual.

```ts
{ patron: "/sincronizacion/corridas",     metodos: ["GET"], nivel: "ADMIN",
  objetoKey: "sincronizacion", accion: ACCION_VIEW,
  motivo: "Historial del job de estado. Leer qué pasó anoche no otorga nada y es la pregunta de mesa de ayuda. Misma clase que la grilla de usuarios y /usuarios/externos, ambas ADMIN." },
{ patron: "/sincronizacion/corridas/:id", metodos: ["GET"], nivel: "ADMIN",
  objetoKey: "sincronizacion", accion: ACCION_VIEW, motivo: "Detalle de una corrida. Mismo criterio." },
{ patron: "/sincronizacion/modo",         metodos: ["GET"], nivel: "ADMIN",
  objetoKey: "sincronizacion", accion: ACCION_VIEW, motivo: "Leer en qué modo está el job." },
{ patron: "/sincronizacion/modo",         metodos: ["PUT"], nivel: "ROOT",
  motivo: "DRY_RUN→REAL. Es la diferencia entre un job que informa y uno que escribe `estado` sobre el padrón. Escribir `estado` de UN usuario ya exige root (usuarios/[id]/route.ts:135-140)." },
{ patron: "/sincronizacion/ejecutar",     metodos: ["POST"], nivel: "ROOT",
  motivo: "La misma escritura masiva de `estado`, disparada a mano." },
```

Qué muestra: una **banda superior con el MODO** (ámbar `DRY-RUN — no escribe`, verde `REAL — escribe estado`) con `establecidoPor`/`establecidoEn` al lado; una **tarjeta del watchdog** con los tres números crudos de `USUDTUPD` y `diasSinMoverUsudtupd` como número grande cuando pasa de 3; la **tabla de corridas**; el **detalle** con anterior → nuevo, origen del dato y motivo; y en la **ficha de usuario** (pantalla existente) una línea *"último cambio de estado: DD/MM por `sync:admsec`"* con link a la corrida.

**Nota sobre el gate visual automático:** `scripts/test-ui-gates-root.ts` deriva su universo leyendo los `dbFetch()` de `src/services/api.ts` (`:36-40`). Si la página nueva llamara `fetch("/api/db/sincronizacion/...")` directo, **el test no la ve y la red no existe**. Las llamadas van por `services/api.ts`, sin excepción.

---

### 5.7 Contrato de la fuente y cambios en el código existente

#### 5.7.1 El endpoint nuevo

Va **en el router `users.js`**, detrás de la api-key que ese router ya aplica en **`as400-api/src/routes/users.js:9`**. **No** por `/api/db/query`: que sea lo único desplegado en prod no lo convierte en el camino del cron — construir una funcionalidad de negocio encima de un agujero significa que el día que se tape, el job se cae.

```
POST /api/users/admsec/sync
Header: x-api-key: <USERS_API_KEY>
```

**Request:** `{ "desdeAudFchhora": "2026-09-01 02:30:00.000000", "desdeAudId": 103229602 }` — los dos obligatorios; sin ellos, 400. Nunca hay default: un default silencioso es cómo se cuela una corrida sobre una ventana equivocada. **No existe el parámetro `soloHabilitados`**: `rows` siempre trae el estado tal cual.

**Response 200:**

```json
{
  "ok": true,
  "contrato": 2,
  "modo": "SNAPSHOT",
  "generadoEn": "2026-09-02T02:30:04.118Z",
  "relojOrigen": "2026-09-02 02:30:03.918745",
  "padron": {
    "total": 1106,
    "habilitados": 347,
    "usudtupdNoNulos": 1106,
    "usudtupdDistintos": 1,
    "usudtupdMax": "2026-09-01 10:45:15.000000",
    "rows": [
      { "ID": 3922, "L": "DGUERRERO", "HAB": "N", "AUTAD": "A",
        "UPD": "2026-09-01 10:45:15.000000", "FDES": "20260824" }
    ]
  },
  "testigo": {
    "total": 138,
    "relevantes": 1,
    "ultima": "2026-09-02 01:14:22.981233",
    "maxAudId": 103312044,
    "rows": [
      { "AUDID": 103311908, "FCH": "2026-09-01 14:02:54.643545", "MOV": "UPD",
        "PK": "USUID=3922", "APP": "ULOGIN", "USUCON": "GXGSISTEMA",
        "ATRIB": "USUAUTAD|...|(USUFCHULTDESACTIVACION)|(USUHABILITADO)|USUID|USULOGIN|...",
        "VANT": "A|...|00000000|S|3922|DGUERRERO|...",
        "VNUE": "A|...|20260824|N|3922|DGUERRERO|..." }
    ]
  }
}
```

**`contrato: 2` y `modo` no son decoración.** Un Express que recibe un campo de body que no conoce **lo ignora y devuelve lo de siempre**. Hoy el `users.js` de producción no existe y el de node-dev es la versión vieja: sin el eco, el job pediría el snapshot con testigo, recibiría la lista pelada, y no tendría dónde notarlo. **Regla dura: si falta `contrato` o `contrato < 2`, el job aborta con `SERVIDOR_SIN_CONTRATO`. Nunca procesa.** Y para que ese campo tenga dónde vivir, el job **no usa `ExternalUserSource.list`** (que devuelve `ExternalUser[]`, `sources/index.ts:14`) ni `validarRespuesta` (que devuelve `r.rows` y tira el resto, `:39-47`): usa una función nueva `snapshotAdmsec()` en `src/lib/usuarios/sources/as400Users.ts` que devuelve el sobre completo tipado, reusando `postLista` (`:14-31`) para la api-key, el timeout y el mapeo de errores.

**Errores:** `401` sin api-key (`apiKey.js:29-32`) · `400` con parámetros faltantes o mal formados · `500 {"ok":false,"outcome":"UNAVAILABLE"}` si falla la query. Los códigos nuevos (`SERVIDOR_SIN_CONTRATO`, `PARAMETRO_INVALIDO`) hay que **agregarlos a `REASONS_CONOCIDOS`** (`sources/index.ts:25`), porque es una lista blanca y lo que no matchea cae a `"UNAVAILABLE"` (`:27-30`) — y "el servidor es viejo" y "se cayó la red" tienen respuestas operativas opuestas.

**El SQL, parametrizado.** `node-jt400` soporta parámetros (`as400-api/src/db/as400.js:47-49`, y `db.js:18-20` ya lo usa así). Ningún valor del cliente toca la string de SQL. Las tres consultas del padrón y las dos del testigo son las de §5.1 y §5.2, textuales.

**Detalles de implementación que no son opcionales:**

- **`u.USUID AS ID` tiene que llegar al cliente.** Hoy `users.js:78` lo selecciona y **`:93` lo destruye**: `rows.map(({ ID, ...r }) => ({ ...r, GRUPOS: ... }))`. En el endpoint nuevo se conserva; en `/admsec/list` **también** se deja de destruir (es aditivo: `FilaAdmsec` gana `ID?: number`, opcional, así los 5 fixtures de `test-usuarios-comparacion.ts` siguen compilando).
- **`USUAUTAD` se normaliza del lado de secapi, nunca se guarda crudo.** `users.js:78` lo devuelve sin `TRIM`, y el criterio de `mapeo.ts:92` (`=== 'A' ? 'A' : 'G'`, con default seguro `'G'` para `null`) es el que manda.
- **El handler no puede tirar fuera del `try`.** `express` es `^4.22.2` (`as400-api/package.json:13`) y `users.js` no usa `asyncHandler` (existe sin uso en `errorHandler.js:9`): un throw fuera del `try` es una unhandled rejection y **la request cuelga hasta el timeout del cliente** — o sea que el job leería `UNAVAILABLE` en vez del 400 con su motivo. Toda la validación va adentro del `try`, y el `catch` deja pasar el 400 antes del 500 genérico.
- **`FETCH FIRST` no se parametriza.** El límite es un entero clampeado del lado del servidor, así que se interpola como literal: **NO VERIFICADO** si este Db2 for i acepta un parameter marker ahí, y la pregunta se borra en vez de responderse.
- **El formato de timestamp es el que devuelve `VARCHAR_FORMAT`, sin `T`.** `YYYY-MM-DD HH:MM:SS.ffffff`, 26 caracteres. El literal de timestamp de Db2 es `yyyy-mm-dd-hh.mm.ss.ffffff` y `node-jt400` devuelve `yyyy-MM-dd HH:mm:ss.SSSSSS`: **ninguno lleva `T`**, y cualquier ejemplo con `T` está escrito, no medido. **El job trata esos strings como opacos: los guarda y los reenvía verbatim, sin parsear ni una fecha.**
- **Presupuesto de tiempo:** padrón 0,12 s + agregados + testigo 48 h ~2,3 s ≈ 3 s en el peor caso razonable. El timeout de 60 s de `as400Users.ts:5` es ~20× eso: si tarda más, no está lento, está roto. **No se toca ese timeout.**

#### 5.7.2 El default de `soloHabilitados` — qué NO se cambia

`users.js:73` (ADMSEC) y `:18` (SGM) tienen `soloHabilitados = true` por default, y con ese default un usuario que pasa a `'N'` desaparece de la lista. **El default no se cambia**: los tres llamadores que importan ya lo pasan explícito (`externos/route.ts:69`, `importar/route.ts:234`, y `sources/index.ts:112` reenvía el del que llama), así que cambiarlo tocaría una ruta de la que depende el wizard para arreglar un bug que el endpoint nuevo no puede tener. Lo que sí va es un comentario en `:73` que nombre la trampa, para que nadie la reintroduzca:

```js
// OJO: el default es `true` por compatibilidad con los llamadores viejos, pero
// para detectar BAJAS es el default equivocado — un usuario que pasa a 'N'
// desaparece de la lista en vez de venir con HAB:'N', y ausencia ≠ baja (D1).
// El endpoint /admsec/sync NO tiene este parámetro a propósito.
const { soloHabilitados = true } = req.body || {};
```

#### 5.7.3 Tipos

`FilaAdmsec` (`mapeo.ts:29-38`) gana **campos opcionales**, nunca obligatorios: `ID?: number`, `UPD?: string | null`, `FDES?: string | null`. Si fueran obligatorios, los 5 fixtures de `test-usuarios-comparacion.ts` dejarían de compilar en `pnpm build` **mientras `pnpm test` sigue en verde** (`tsx` no type-checkea), y el fallo aparecería recién en el deploy. Y hay una distinción semántica real que hay que preservar: `undefined` (el as400-api es viejo y no mandó el campo) es un estado **distinto** de `null` (la columna está vacía), y esa diferencia es la que alimenta el watchdog.

`ExternalUser` (`tipos.ts:9-28`) gana `modificadoEn?: string | null` arriba (no en `extras`), con los tres significados documentados; y `extras` gana `fchUltDesactivacion?: string | null`. `mapearFilaAdmsec` (`:87`) los completa con `"UPD" in row ? texto(row.UPD) : undefined`. **El corte GSIST/LDAP de `:92-95` no se toca ni un carácter**, y los 3 tests que lo fijan (`test-usuarios-comparacion.ts:287,293,298`) son la compuerta y no se modifican.

#### 5.7.4 Bug latente que se arregla en el mismo commit

`as400Users.ts:36-49` deduplica las promesas en vuelo de `listarAdmsec` con una clave que es **solo** `String(soloHabilitados)`. Existe porque `ldapSource.list` (`index.ts:98`) y `gsistSource.list` (`:112`) piden el mismo payload y lo filtran cada uno. Si mañana se agrega cualquier parámetro al body sin agregarlo a la clave, dos peticiones distintas comparten una sola promesa y una recibe en silencio los datos de la otra. La clave pasa a incluir **todo** lo que va en el body.

#### 5.7.5 `crearUsuario`: extracción, solo para la Fase 5

Se mueve a `src/lib/usuarios/importar.ts` con `export`, **con el comentario de `importar/route.ts:12-17` completo** (si `BATCH_SIZE` viaja sin la explicación de por qué 50 reventaba, alguien lo vuelve a subir en seis meses). **Corrección de estimación: no es "sin cambiar la lógica".** `Detalle` (`:26-30`) necesita dos campos nuevos, `id?: number` y `codigo?: string`, porque hoy `:140` descarta el `creado.id` que `:114` acaba de seleccionar, y el catch de `:141-146` aplana **todo** a `estado:"error"` con un string, perdiendo `error.code` y `error.meta.target`. Sin esos dos campos, el job no puede vincular la fila creada sin una re-consulta con su propia carrera, ni distinguir un `P2002` de un `P2024` de pool sin parsear texto. Son dos campos aditivos, cero cambio de comportamiento.

Y para el alta (Fase 5), tres reglas que se agregan encima:
- **`desdeSistema` se fuerza a `'GSIST'`**, no `ext.origen` (`importar/route.ts:111`). Motivo: una fila `'LDAP'` nace en la rama de login **sin fallback a ADMSEC** (`resolveCredentials.ts:546` → `validateLdap`, con `:591` comparando contra `password:""` que `:710` rechaza) — o sea que la persona **no podría entrar nunca** hasta que exista el AD, cuando sin el job hubiera entrado por `validateAgainstAdmsec:108-118`.
- **`creadoPor = "sync:admsec"`**, distinto de `"auto-migration"` (`upsertExternalUser.ts:69`) y del valor del wizard: los tres caminos quedan distinguibles con un `GROUP BY creado_por`.
- **`conRoles: false` y `conPreferencias: false`**, siempre. Una fila creada por el job tiene **cero roles** y `password: ""` (`:91-92`), o sea que es inutilizable hasta el primer login externo. Es la propiedad que hace que un alta equivocada **no otorgue acceso a nadie**: crea una fila muerta, no una cuenta.

#### 5.7.6 Invariantes verificables de lo que NO se toca

El servicio compartido de RBAC lo consumen goya (3000), secapi (3001), track (3002) y granel (3003). Cada invariante viene con su comando:

| # | Invariante | Verificación |
|---|---|---|
| 1 | El job nunca aparece en la app web | `grep -rn "sincronizacion/planificar\|sincronizacion/aplicar" src/app/ src/components/` → vacío |
| 2 | **El login no escribe `estado` en la rama `update`.** `upsertExternalUser.ts` pone `estado:"A"` solo en `create` (`:64`); el bloque `update` (`:71-78`) tiene `password`, `esExterno`, `desdeSistema`, `usuarioExterno` y nada más. **Si alguien agrega `estado` ahí "para que se sincronice", un usuario desactivado se reactiva solo con loguearse** y el job pelea contra el login todas las noches | `grep -n "estado" src/lib/auth/upsertExternalUser.ts` → solo `:64`, `:72` (comentario) y `:91` |
| 3 | `comparar.ts` y sus 29 tests no cambian | `pnpm test:usuarios-comparacion` → `29 ok, 0 fallidos`; `git diff --exit-code src/lib/usuarios/comparar.ts scripts/test-usuarios-comparacion.ts` |
| 4 | La api-key de servicio nunca alcanza un endpoint ADMIN | `apiGuard.ts:944-951` sin cambios |
| 5 | No se agrega ninguna ruta nueva al as400-api fuera del router `users` | `as400-api/server.js:14-20` sin cambios; `/api/db/query` **no se toca en esta spec** |
| 6 | `auth-admsec.js` no se entera de `USUDTUPD` | Su `loadAdmsecUser` no selecciona la columna |
| 7 | El type-check pasa | `pnpm build` (el único chequeo de tipos: `pnpm lint` está muerto) |
| 8 | El encadenado de tests pasa entero | `pnpm test` |

---

### 5.8 Runtime y despliegue (D7)

#### 5.8.1 Dónde vive el código

```
scripts/sync-admsec.ts                          CLI: args, env, lock, ventana, logging
src/lib/usuarios/sincronizacion/planificar.ts   PURO: (origen, locales, alcance, feed) → Plan
src/lib/usuarios/sincronizacion/aplicar.ts      ÚNICO archivo que escribe `usuario`
src/lib/usuarios/sincronizacion/lock.ts         advisory lock
src/lib/usuarios/sources/as400Users.ts          + snapshotAdmsec()
scripts/test-usuarios-sincronizacion.ts         tests sin base ni red
scripts/test-sync-solo-aplicar-escribe.ts       test estructural (§5.8.4)
```

`scripts/` ya es el lugar de los jobs one-shot (`scripts/import-sgm-preferences.ts` es este patrón exacto, declarado en `package.json:28`), y `tsx` está disponible en producción (devDependency `package.json:152`, y `deploy-production.sh:75` instala con `--prod=false`). Node en los hosts: `v20.9.0`. Entrada nueva: `"sync:admsec": "tsx scripts/sync-admsec.ts"`.

**Carga de entorno — es load-bearing y hay una trampa doble.** `as400Users.ts:3-4` lee `AS400_API_URL` y `USERS_API_KEY` **en scope de módulo**, y `src/lib/prisma.ts:7-14` instancia `PrismaClient` también en scope de módulo (y `permisos.ts:2` lo importa). Los `import` se hoistean por encima de cualquier `dotenv.config()`, así que un script que importe eso arriba lee `""` aunque el `.env` tenga la clave — con el síntoma `SIN_USERS_API_KEY` (`as400Users.ts:15-16`), que se diagnostica como "falta la clave" cuando la clave está. Bajo pm2 es invisible; **solo muerde al primero que corra el job a mano para diagnosticar algo**, o sea justo cuando hace falta que ande.

Y el remedio obvio no compila: **`package.json` no tiene `"type": "module"`**, `tsx` transpila a CJS y un `await import()` en top-level es un error de sintaxis (`esbuild`: *"Top-level await is currently not supported with the cjs output format"*). La forma que anda es la que ya usa `import-sgm-preferences.ts` (`new PrismaClient()` en `:128`, **adentro de una función**):

```ts
import * as dotenv from "dotenv";
// CERO imports estáticos de src/lib acá arriba.

async function main() {
  dotenv.config({ path: "/var/www/secapi/.env" });   // no-op si pm2 ya inyectó
  const { snapshotAdmsec } = await import("../src/lib/usuarios/sources/as400Users");
  const { planificar }     = await import("../src/lib/usuarios/sincronizacion/planificar");
  const { aplicar }        = await import("../src/lib/usuarios/sincronizacion/aplicar");
  // ...
}

main()
  .then(() => process.exit(0))   // D16: SIEMPRE 0
  .catch(async (e) => { await registrarFallo(e); process.exit(0); });
```

#### 5.8.2 El lock

Un **único** `PrismaClient` para toda la corrida, creado con `connection_limit=1`. Los advisory locks de sesión son propiedad de la conexión física que los tomó: con el pool por default el lock y el unlock pueden caer en conexiones distintas y el unlock sería un no-op con un WARNING silencioso. (Se descarta la alternativa de "envolver toda la corrida en un `$transaction`": contradice la transacción-por-usuario de §5.4.4 y chocaría con el timeout default de 5 s de las transacciones interactivas.)

```ts
const LOCK_CLASSID = 20260901;   // namespace fijo y grepeable para los jobs de secapi
const LOCK_OBJID   = 1;          // objid 1 = sync-admsec

const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("connection_limit", "1");
url.searchParams.set("pool_timeout", "10");
url.searchParams.set("application_name", `sync-admsec@${os.hostname()}`);
const db = new PrismaClient({ datasourceUrl: url.toString() });

// pg_try_advisory_lock, no pg_advisory_lock: vuelve en el acto. Un cron no debe
// hacer cola — si ya hay una corrida, esta corrida sobra.
// El ::int4 es necesario: Prisma manda los number de JS como int8 y sin el cast
// el planner elige la sobrecarga pg_try_advisory_lock(bigint).
const [{ tomado }] = await db.$queryRaw<{ tomado: boolean }[]>`
  SELECT pg_try_advisory_lock(${LOCK_CLASSID}::int4, ${LOCK_OBJID}::int4) AS tomado`;
```

**Orden obligatorio: primero el lock, después la fila de corrida.** Si el lock está tomado, se escribe igual una fila con `resultado='SALTADA_POR_LOCK'`, `host`, `pid` y `nodeEnv`, y se sale con 0. **Salir mudo repite exactamente el modo de falla contra el que está escrita toda la spec**: una fila `SALTADA` con host es lo único que después permite descubrir que hay una segunda instalación escribiendo la misma base. **Regla de escalamiento: ≥2 `SALTADA` en 7 días es una alerta explícita** ("hay otra instancia del job corriendo contra esta base"), no una fila más.

La liberación es cortesía; **la garantía real es el `$disconnect()`**: al cerrarse la sesión Postgres suelta todos sus advisory locks, así que un job que muere de OOM o por reboot no deja el lock trabado. Diagnóstico manual:

```sql
SELECT l.pid, a.application_name, a.client_addr, a.backend_start, a.state
  FROM pg_locks l JOIN pg_stat_activity a USING (pid)
 WHERE l.locktype='advisory' AND l.classid=20260901 AND l.objid=1;
```

#### 5.8.3 Modo: dos candados que tienen que coincidir, con default DRY_RUN

El requisito es asimétrico: prender dry-run por accidente es inocuo; prender **modo real** por accidente es el desastre. Entonces **REAL tiene que ser difícil de alcanzar y DRY_RUN tiene que ser el estado al que se cae ante cualquier ambigüedad** — el mismo *fail-closed* que `apiGuard` ya aplica a los permisos (`apiGuard.ts:812` lo declara, `:921-930` lo ejecuta).

```
modo = (env === "REAL" && filaDb === "REAL") ? "REAL" : "DRY_RUN"
```

1. **`SYNC_ADMSEC_MODO=REAL` en el bloque `env` de pm2** (candado de despliegue).
2. **`sincronizacion_estado['sync:modo'] = 'REAL'`**, escrita por un ROOT desde el panel con `establecidoPor` y `nota` obligatoria (candado de runtime).

Propiedades que salen de la conjunción: cualquier cosa rara (env sin setear, typo, fila ausente, base que no contesta al leerla) cae a DRY_RUN; el **kill switch es de una sola mano** (borrar la env apaga las escrituras sin panel y sin base — alguien parado en el server a las 3 AM puede frenar el job); y el modo no puede derivar sin que nadie lo note, porque `modo` y `establecidoPor` van en la **primera línea del reporte de todas las mañanas**. La corrida guarda el modo **resuelto**, no el pedido.

**Se descarta el guard de `NODE_ENV`**: `pm2.config.js` tiene un **solo** bloque `env` con `NODE_ENV: 'production'` hardcodeado (`:17`), y ese mismo archivo corre en node-dev. No discrimina nada y da una falsa sensación de red.

**El guard de host** (`os.hostname()` vs `SYNC_HOST_ESPERADO`) sí queda, pero con dos correcciones: (a) su valor **no puede ser un literal de relleno** — se setea con el hostname real medido en P1, y hasta entonces el job corre solo en dry-run; (b) **si no coincide, escribe la fila de corrida con `resultado='ABORTADA_PREFLIGHT'` y `motivo='HOST_INESPERADO'` antes de salir**. Ningún camino de salida es mudo.

#### 5.8.4 Cómo se garantiza que en dry-run no escribe

No con `if (dryRun)` repartidos — ese es justo el mecanismo que tiene un `if` que se te olvidó. Tres capas:

1. **Un solo punto de escritura.** `aplicar.ts` es la **única** función del subsistema que toca `prisma.usuario`. Todo el resto arma un plan (estructuras puras).
2. **Un test estructural, que es el idioma de este repo** (`apiGuard.ts:42-45`: *"La red de contención no es la disciplina: es el test"*, con dos tests que lo implementan). `scripts/test-sync-solo-aplicar-escribe.ts` recorre `src/lib/usuarios/sincronizacion/**` y **falla si aparece una escritura fuera de `aplicar.ts`**. Dos precisiones que un diseño erró y hay que respetar:
   - La regex matchea `\.usuario\.(update|create|upsert|delete|updateMany|createMany|deleteMany)` **sin importar el receptor**: el precedente del repo para escrituras transaccionales es el alias `tx.usuario.update` (`[id]/route.ts:218`, `:285`), o sea que el escritor más peligroso sería invisible para una regex anclada a `prisma.`.
   - **No se prohíbe `$queryRaw` en general**: D7 exige `pg_try_advisory_lock`, que en Prisma solo se alcanza así. Se exceptúan por nombre exacto las dos sentencias del lock, y se prohíbe `$executeRaw` fuera de `aplicar.ts`.
3. **Contador cruzado.** Una corrida en `DRY_RUN` tiene que terminar con `count(detalle where aplicada='S') === 0`. Si no, `resultado='FALLIDA'` con `motivo='DRY_RUN_ESCRIBIO'` y máxima urgencia. Es una aserción barata que convierte un bug silencioso en un grito.

#### 5.8.5 La entrada de pm2

Tercera app en `pm2.config.js`, después de `as400-api`:

```js
{
  name: 'secapi-sync-admsec',
  cwd: '/var/www/secapi',
  script: 'node_modules/.bin/tsx',
  args: 'scripts/sync-admsec.ts',        // SIN --apply durante las 2 semanas de D9
  interpreter: 'none',                   // tsx ya es el ejecutable

  // autorestart:false → el proceso corre, termina y queda 'stopped'. Sin esto,
  //   un job que sale con 0 entra en bucle infinito.
  // cron_restart → lo dispara el daemon de pm2 (lib/Worker.js:38 crea un Cron
  //   que llama God.restartProcessId; funciona sobre un proceso 'stopped').
  autorestart: false,
  cron_restart: '30 2 * * *',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '512M',

  env: {
    NODE_ENV: 'production',
    TZ: 'America/Montevideo',            // NO controla el cron; sí las fechas que escribe
    DATABASE_URL: '<...>',
    AS400_API_URL: 'http://localhost:5000',
    USERS_API_KEY: '<la misma que consume as400-api>',
    CUENTAS_SISTEMA: 'ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR,PRODUCCION,PEDWEB1,PEDWEB2,PEDWEB3,PEDWEB4',
    SYNC_ADMSEC_MODO: 'DRY_RUN',
    SYNC_HOST_ESPERADO: '<hostname REAL medido en P1>',
    SYNC_WEBHOOK_URL: '<endpoint de n8n>',
  },

  error_file: './logs/sync-admsec-error.log',
  out_file:   './logs/sync-admsec-out.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
}
```

**Cinco comportamientos de pm2 5.3.0 verificados leyendo el código instalado, que la spec dice en voz alta porque cada uno es una trampa:**

1. **`cron_restart` se evalúa en el daemon, no en la app.** Poner `TZ` en el bloque `env` **no cambia la hora del disparo**. Lo que manda es el TZ del daemon: verificado que ningún daemon tiene `TZ=` en su environ → heredan `/etc/localtime`, que es `America/Montevideo` en los dos hosts. El `TZ` de la app igual va, porque sí controla las fechas que el job escribe. Uruguay no aplica DST desde 2015: las 02:30 no se duplican ni se saltean nunca. El runner además **verifica su propio timezone al arrancar** y, si no coincide, escribe la fila con `motivo='TZ_INESPERADO'` antes de salir.
2. **`pm2 save` guarda también los procesos `stopped`** (solo excluye `pmx_module`): el job sobrevive al save aunque esté detenido, que es su estado normal.
3. **`pm2 resurrect` arranca TODO lo del dump sin mirar el status.** **Cada reboot dispara una corrida fuera de horario.** De ahí la ventana `02:00–03:30` con aborto (`FUERA_DE_VENTANA`, y **con fila escrita**): sin ella, un reboot a las 14:00 escribiría `estado` en pleno horario laboral.
4. **`pm2 stop` no desregistra el cron; solo `pm2 delete` lo hace.** Va en el runbook.
5. **`pm2 restart` NO relee `args` de `pm2.config.js`.** Prender `--apply` editando el archivo y reiniciando deja al operador mirando un proceso verde y filas nocturnas `OK`… en `DRY_RUN`, con cero escrituras. **El procedimiento es `pm2 delete secapi-sync-admsec && pm2 start pm2.config.js --only secapi-sync-admsec && pm2 save`**, y el titular del reporte diario lleva el **modo**, no el resultado.

**Y `deploy-production.sh:102` es `pm2 start pm2.config.js` SIN `--only`**: agregar la app al archivo significa que el próximo deploy la arranca a la hora del deploy. Mitigado por la ventana horaria, pero el script tiene que ganar el `--only` de las apps de servicio o la entrada del job se agrega recién en el paso final.

**Por qué no `/etc/cron.d`:** el `DATABASE_URL` existe **solo dentro del proceso**, inyectado por pm2 (`pm2.config.js:37`); en 7.4 no hay ningún `.env`. Un job de cron.d arranca con el environment mínimo y muere en el `new PrismaClient()`. Para que anduviera habría que **duplicar la clave de postgres y la api-key en un tercer lugar**. Contraejemplo honesto que hay que reconocer: en node-dev **sí** hay un job de aplicación en cron.d (`/etc/cron.d/goya-calles-refresco`) — pero es Python y no depende de la env de pm2. No invalida el argumento; lo delimita. Contra-argumento que también hay que reconocer: pm2 guarda el `env` en el dump y lo muestra en `pm2 env <id>`, o sea que el secreto queda legible para cualquiera que pueda `sudo -u node`. Eso ya pasa hoy con las otras dos apps; el job no empeora la situación, pero tampoco la arregla.

#### 5.8.6 Fallo, reintento y horario

| Qué pasa | Reintenta | Qué escribe | Exit |
|---|---|---|---|
| AS400 no contesta (`UNAVAILABLE`) | Sí, 3 intentos: 30 s / 2 min / 8 min | `FALLIDA`, `motivo=AS400_UNAVAILABLE` (el `reason` crudo va al log, no a la tabla: `sources/index.ts:18-30` explica que puede llevar la IP interna) | **0** |
| AS400 devuelve 401 o 500 | No — un 401 es la api-key mal | `FALLIDA`, `motivo=AS400_HTTP_<code>` | **0** |
| Falta `contrato` o `contrato < 2` | No | `FALLIDA`, `motivo=SERVIDOR_SIN_CONTRATO` | **0** |
| Cualquier preflight de §5.4.2 | No | `ABORTADA_PREFLIGHT` con el chequeo que falló | **0** |
| El plan supera el tope | No | `ABORTADA_POR_TOPE` **con el detalle completo** (`aplicada='N'`) | **0** |
| Postgres no contesta | 1 reintento a los 30 s | Nada en la base — no se puede. Solo la línea del log y el webhook | **0** |
| El job muere a la mitad | No | Queda `EN_CURSO` sin `fin`. **El lock se suelta solo.** La corrida siguiente la marca `INTERRUMPIDA` | — |
| Lock tomado | No | `SALTADA_POR_LOCK` con host y pid | **0** |
| Fuera de la ventana | No | `ABORTADA_PREFLIGHT`, `motivo=FUERA_DE_VENTANA` | **0** |

**Exit 0 siempre (D16).** El veredicto viaja por la fila, el webhook y la línea de log. Motivo: con `autorestart:false`, un exit ≠ 0 deja el proceso en `errored`, y **NO VERIFICADO** si `cron_restart` vuelve a dispararlo desde ahí — una sola noche mala podría apagar el job para siempre, sin que nadie se entere.

**No hay reintento de la corrida entera.** Un fallo espera a las 02:30 siguiente. Un job que escribe `estado` no debe auto-reintentar a ciegas: si falló porque el AS400 devolvió algo raro, reintentar en 5 minutos es la peor respuesta posible. Los reintentos que hay son **internos y solo de lectura**; techo total ~11 min → la corrida más larga posible cierra 02:41.

**Barrido de corridas colgadas**, primer paso, antes del lock: toda `EN_CURSO` de más de 30 min pasa a `INTERRUMPIDA` con `motivo='SIN_CIERRE'`.

**02:30 está limpio.** Inventario medido de vecinos en 7.4: 00:00 `auto-upgrade` (el RCE) y `pm2-logrotate` y `dpkg-db-backup`/`logrotate`; 03:10 domingos `e2scrub_all`; 06:54 `apt-daily-upgrade`; 08:14 y 08:00 lunes crontab de root; 21:25 `apt-daily`; 22:56 `etckeeper`. El vecino más cercano está 40 minutos después y el job termina en segundos. **NO VERIFICADO: si el AS400 tiene save nocturno o IPL cerca de las 02:30** — si lo hay, 02:30 se mueve; el job no debe competir con un save (P8).

#### 5.8.7 El reporte (D18)

**Hoy no existe ningún canal**: cero hits de nodemailer/SMTP/Telegram/webhook en todo el repo. Lo único parecido a una bandeja es `solicitudes_permiso` (`schema.prisma:251-258`), que es un workflow aprobable — un reporte de job no se aprueba.

Tres piezas:

1. **La fila en la base + la pantalla del panel** (§5.6.5): el registro durable, no depende de nada externo.
2. **Un POST a `SYNC_ADMSEC_WEBHOOK_URL`** con el JSON de la corrida, y que el otro lado haga el fan-out a mail/Telegram. Destino recomendado: el n8n de la casa. **NO VERIFICADO desde este repo** — n8n no aparece en ningún archivo de `security_suite`; sale del contexto operativo (hay un reporte diario por n8n en la VM 192.168.7.8). Confirmarlo antes de darlo por hecho. Por qué webhook y no `nodemailer` adentro de secapi: cero dependencias npm nuevas y, sobre todo, **cero credenciales SMTP en `pm2.config.js`**, que está en git y ya tiene el `DATABASE_URL` y la clave de `qsecofr` en texto plano.
3. **El heartbeat + el dead-man switch.** El reporte sale **todas las mañanas, incluidas las noches de 0 cambios**: D6 dice que 0 filas es fallo y no dato, y la contracara es que **el mail que llega ES la prueba de que el job corrió**. Y el detector de ausencia **tiene que vivir afuera de secapi**: el workflow de n8n alarma si pasan 26 h sin POST. Si el que avisa es el que se murió, el silencio es indistinguible de "todo bien" — y este es exactamente el control que ya falló en esta instalación (los procesos de producción no aparecen en la pm2 de root y nadie se enteró). El canal se vigila a sí mismo: si el POST falla se graba `reporteEnviado='N'` + `reporteError`, y la corrida siguiente escala en el asunto cuando encuentra N seguidas sin entregar.

**El asunto lleva el veredicto entero** (mucha gente no abre el cuerpo):

```
[secapi][DRY-RUN] 2026-09-15 02:30 · OK · 3 cambios (2 bajas, 1 alta) · USUDTUPD congelado hace 14 d
[secapi][REAL]    2026-09-16 02:30 · ABORTADA · delta 7 > tope 5 · NO se escribió nada
[secapi][REAL]    2026-09-17 02:30 · ABORTADA_PREFLIGHT · ratio habilitados 0,94 (esperado ~0,31)
```

**Cuerpo:**

```
MODO: DRY-RUN — el job NO escribe.
      Puesto por dmedaglia el 2026-09-01 (fila sync:modo)
RESULTADO: OK  ·  02:30:04 → 02:30:07 (2,9 s)  ·  corrida #23  ·  host secapi-prod

LECTURA DEL ORIGEN
  1.106 filas · 347 habilitados (31,4 %) · 1.102 logins únicos · padrón local 854
  alcance gobernado: 14 · evaluados 14/14 (100 %)

USUDTUPD (el campo que pidió el dueño)
  máximo 2026-09-01 10:45:15.000000 · valores distintos en el padrón: 1 · nulos: 0
  SIN MOVERSE HACE 14 DÍAS.  El campo sigue congelado en el valor del backfill.
  El job NO depende de él: la detección es por comparación del padrón completo.

TESTIGO (AUDITORIA.AUDITORIA, ventana 48 h)
  132 entradas totales · 1 relevante (USUHABILITADO/INS/DLT) · última 2026-09-15 07:41

CAMBIOS (3)
  DGUERRERO  DESACTIVAR  A → I   USUID 3922 · USUHABILITADO='N' · FDES 20260824
                                 AUDID 103311908 · AUDUSUCON GXGSISTEMA
  MPEREIRA   ACTIVAR     I → A   USUID 6612 · USUHABILITADO='S'
  RLOPEZ     ACTIVAR     I → A   USUID 7101 · USUHABILITADO='S'

OMITIDOS (3)
  JGOMEZ         ES_ROOT — el job nunca desactiva a un root (D8). Apps: 1, 3, 5
  CLARRAMENDI    ORIGEN_SIN_CONSENSO — USUID 609 dice 'N', USUID 839 dice 'S'
  ROSINA ARAUJO  AUSENTE_EN_ORIGEN (12 corridas) — se reporta, no se desactiva (D1)

PROTEGIDOS POR ROL ROOT: 2 (jgomez, dmedaglia)   ← si este número cambia, avisá

Detalle completo: https://secapi.glp.riogas.com.uy/dashboard/sincronizacion/corridas/23
```

Las tres cosas que hay que entender de un vistazo están en bloques fijos y siempre presentes: **cuántos** (con denominador), **cuáles** (uno por línea, con anterior → nuevo y el dato de origen que justificó la decisión), y **el estado de `USUDTUPD`** (bloque propio, con los números crudos, no solo el veredicto).

---

## 6. Trampas conocidas

### 6.1 El bug del conjunto parcial

**La trampa:** leer solo lo modificado y compararlo contra el padrón completo hace que **todo lo demás parezca ausente**. Con 1 fila incremental contra 854 locales, `locales.filter(l => !externos.some(match))` devuelve 853 fantasmas. Si el job actuara sobre eso, es una desactivación masiva del padrón entero, en una base que dev y prod comparten.

**Dónde aparece** (no en el código de hoy, sino en los tres lugares donde alguien lo va a agregar creyendo que mejora las cosas):

1. *"Agreguemos el estado AUSENTE a `compararUsuarios`."* Hoy esa función es **estructuralmente incapaz** de producirlo: hace `return externos.map(...)` (`comparar.ts:85`), o sea que solo emite filas por cada externo. Agregarle la rama la vuelve capaz.
2. En el job: `const aDesactivar = locales.filter(l => !externos.some(...))`. Una línea.
3. En el wizard, si alguien le enchufa un filtro incremental: no hay escritura, pero el `resumen` se calcularía sobre el delta y el operador leería "3 nuevos" como "el origen tiene 3 usuarios".

**Cómo se evita, por tipos y no por comentario:**

- **`AccionEstado` no se puede construir sin una `FilaOrigen` presente**: `origenDato` es obligatorio y no-nullable, y su única fuente es la fila que vino en esta corrida. Un local sin fila externa no tiene con qué llenarlo.
- **El `Plan` no tiene campo de ausentes.** La lista la calcula el reportador, donde no alcanza al escritor.
- **Si algún día se habilita el modo incremental, `ausentes` es incondicionalmente vacío en ese modo.** Un conjunto parcial no autoriza ninguna conclusión sobre lo que no vino.
- **Segunda mitad de la trampa, en el mismo archivo: alcance ≠ padrón de matcheo (D19).** Si el job, "para ser prolijo", comparara solo contra los usuarios del alcance, una colisión de email o de username contra un local fuera de alcance **no se detectaría**, ese externo caería en "crear", y el insert reventaría contra el `@unique` de email. Por eso la entrada del planificador tiene `localesTodos` **y** `alcance` separados, con los nombres puestos a propósito.

### 6.2 El modo de falla silencioso de `USUDTUPD`

**La trampa:** el campo se llama como lo que promete, pero es una columna común que nadie mantiene. Si nadie modificó los programas RPG/GeneXus, queda congelado en `2026-09-01 10:45:15` para siempre y un job incremental reportaría "0 cambios" todas las noches, en silencio, indistinguible de "no pasó nada". **Es exactamente el modo de falla de `USUFCHPERMISOS`, con un nombre que promete lo contrario.**

**Y el testigo no lo cierra solo.** La regla "0 cambios no se puede imprimir sin corroboración del testigo" suena bien y no alcanza: `AUDITORIA` **comparte el punto ciego**, como demostró el backfill de hoy (1.106 filas movidas, cero entradas de auditoría). Un `UPDATE` masivo por STRSQL, o una carga con los triggers apagados (tienen flags `ENABLED`/`OPERATIVE` justamente porque se apagan), produce `candidatos=0` **y** `testigo relevantes=0` → verde. Y en operación normal el testigo devuelve 0 relevantes casi todas las noches (77 cambios en 8 meses), así que ese sería el mail de casi todas las noches.

**Cómo se cierra:** el detector primario no lo usa. El snapshot completo compara 1.106 filas contra 854 y produce el plan correcto **se mueva o no** `USUDTUPD`. Encima quedan tres señales que sí atrapan la degradación de la *lectura*: `origen_usudtupd_distintos` (hoy 1, publicado todas las noches), el canario de días congelado (WARN el 2026-09-22, ERROR el 2026-10-16 aunque nadie cambie de estado a nadie), y **el ratio de habilitados del preflight PF4**, que es lo que atrapa el caso más traicionero: que `USUHABILITADO` deje de reflejar la realidad y lleguen las 1.106 filas mapeadas todas al mismo valor.

### 6.3 El re-backfill masivo

Si alguien vuelve a correr un `UPDATE ADMSEC.USUARIOS SET USUDTUPD = ...`, las 1.106 filas cambian de golpe. **Con el snapshot primario, el radio de explosión es cero escrituras**: `USUDTUPD` no participa de ninguna decisión, así que el plan sale con 0 acciones.

Lo que sí hay que hacer es que el evento sea **visible y distinguible**, porque tiene una firma inconfundible que el reporte publica en todas las corridas:

```
origen_usudtupd_distintos = 1  (o un puñado)  cubriendo el padrón entero
origen_usudtupd_max       = un valor nuevo, idéntico para todas las filas
testigo relevantes        = 0
acciones                  = 0
```

Un evento masivo **real** (una baja organizacional) mostraría **muchos** valores distintos de `USUDTUPD` *y* una pila equivalente de entradas `(USUHABILITADO)` en el testigo *y* acciones que revientan el tope. Por eso `origen_usudtupd_distintos`, `origen_usudtupd_max` y `testigo_relevantes` van en **todos** los reportes, no solo en el de aborto: son la diferencia entre "re-sellaron el campo" y "le pasó algo a 1.106 personas". Veredicto `usudtupdVeredicto='RESELLADO'`, se reporta, no aborta, y se actualiza `usudtupd_cambio_en` (el canario se reinicia).

### 6.4 La primera corrida

**No existe el problema del watermark sin sembrar** (con snapshot primario no hay watermark que sembrar), pero sí existe el del **backlog acumulado**: la primera comparación real de 347 habilitados contra 854 filas de PG va a devolver decenas de diferencias — todo lo que derivó desde que se consultó el origen por última vez. Con el tope en 5, aborta. Y abortaría todas las noches, siempre igual, lo bastante calladamente como para parecer "no había nada que hacer".

**El procedimiento, y no se saltea:**

1. **Reconciliación por snapshot, revisada por una persona.** Se corre el job en dry-run con `--tope 9999` y motivo, y se lista todo lo que difiere **dentro del alcance**. Se esperan decenas, no un puñado (hay derivas conocidas: `DGUERRERO` en `'N'` desde el 24/8).
2. **Ese backlog no es trabajo del cron.** Lo revisa una persona y lo aplica por el panel o por una corrida `tipo='SIEMBRA'` explícita, con `disparadaPor='manual:<username>'` y alguien mirando.
3. **Recién cuando Postgres y ADMSEC coinciden en `estado` para el conjunto de alcance**, el tope vuelve a su valor normal y el cron queda habilitado para escribir.

**La siembra que hay que rechazar explícitamente:** adoptar el estado actual de Postgres como correcto y arrancar "de acá en adelante". Se rechaza porque adopta en silencio como correcto algo que se sabe que no lo es. **La primera corrida es una reconciliación revisada, no una suposición.**

**Y la primera corrida REAL se dispara a mano**, con alguien mirando, no de madrugada: `POST /api/db/sincronizacion/ejecutar` (ROOT) o el CLI con `--forzar-fuera-de-ventana` y motivo. El alcance de esa primera escritura es un solo usuario: `DGUERRERO` (USUID 3922, `USUHABILITADO='N'`, `USUFCHULTDESACTIVACION='20260824'`), que es el caso auditable ya identificado.

### 6.5 Las otras seis, en corto

| Trampa | Dónde | Qué la evita |
|---|---|---|
| **`CONFLICTO` traga el diff de estado** | `comparar.ts:95-103` devuelve `diffs: []` aunque el estado difiera. Hoy duerme porque `mapeo.ts:100` fija `email: null`, pero el backfill de AD del login llena emails. Desde ese momento, un usuario cuyo email colisione **no se sincroniza nunca más y no cae en ningún balde de error** | D12: el job usa su propio planificador y **no llama a `compararUsuarios`** |
| **La fuente cambia de proveedor sin avisar** | `sources/index.ts:82,93` pasa a AD real en cuanto existan `LDAP_BIND_USER`/`LDAP_BIND_PASSWORD`, y el fallback es `if (r.ok && r.rows)` — **un array vacío es truthy**. Un AD que contesta OK con 40 entradas devolvería 40 filas de otro sistema, el job vería 300 ausentes, D1 no haría nada, y el mail diría "OK, 0 cambios" | D12: el job no llama a `obtenerFuente`. Y `ausentesEnOrigen > 5 % del alcance` **aborta** |
| **El panel pisa lo que escribió el job** | `UsuarioForm.tsx:178` manda `estado` en cada guardado, desde una página que pudo cargarse antes de la corrida. Un root que abre la ficha a las 02:00 y guarda a las 09:00 revierte en silencio la decisión de las 02:30 | El gate de UI de §5.5.6 (las **dos** puertas: PUT `:135` y DELETE `:284`) y el compare-and-swap del job |
| **`prisma db push` se lleva el blindaje** | No hay `prisma/migrations/`, y `deploy-dev.sh:161` se traga el fallo del push con un `||` | `pnpm db:blindaje` idempotente + **PF7: el job se niega a correr sin el trigger y el constraint** |
| **`pm2 restart` no relee `args`** | Prender `--apply` editando el archivo y reiniciando deja el job en dry-run con el proceso verde | `pm2 delete` + `pm2 start --only` + `pm2 save`, y el titular del reporte lleva el **modo** |
| **Top-level `await` en el script** | `package.json` sin `"type": "module"` → `tsx` transpila a CJS → error de sintaxis de esbuild | `async function main()` con los `await import()` adentro |

---

## 7. Prerequisitos de despliegue

Ordenados. La columna "dueño" marca lo que **no depende de nosotros**.

| # | Qué | Dueño | Verificación de que quedó hecho |
|---|---|---|---|
| **P0** | **Acceso SSH a 192.168.7.13**, que es la producción real de secapi. Hoy: `Permission denied (publickey,password)` | **Infra** | `ssh secapi-prod hostname` responde |
| **P1** | **Inventario de 7.13**: hostname, rama y HEAD, si existe `src/lib/usuarios/`, si existe `as400-api/src/routes/users.js`, a qué base llega, a qué AS400 llega, qué hay en `.env` (nombres, no valores), si ya hay jobs, si `/api/db/query` está expuesto, y el firewall | Nosotros, tras P0 | Salida completa de esos 8 chequeos, guardada en el registro de infraestructura |
| **P2** | **Decidir qué es 192.168.7.4.** Hoy corre una copia zombi de secapi (rama `main`, HEAD `f1f78ec` del 2026-06-30) que **no llega a la Postgres**. No puede quedar ambigua: si alguien le arregla la conectividad sin saber, aparece un tercer escritor | **Infra + dueño** | `pm2 list` de 7.4 sin `securitySuite`, o una nota en el registro |
| **P3** | **Segundo root para la aplicación 6 (Granel).** Hoy `dmedaglia` es el único, y el trigger de §5.5.1 empieza a dar 409 en su baja | **Dueño** (decide quién) | `pnpm bootstrap:root -- --usuario <x> --aplicacion 6`, después `SELECT * FROM sec_aplicaciones_sin_root()` → 0 filas y **2 roots en app 6** |
| **P4** | **`SELECT lower(username), count(*) FROM usuarios GROUP BY 1 HAVING count(*)>1` devuelve 0 filas.** Si devuelve, se resuelve a mano | Nosotros | 0 filas |
| **P5** | **Blindaje aplicado**: `usuarios_estado_valido` (con `VALIDATE`), `sec_aplicaciones_sin_root()`, los dos triggers, `usuarios_username_lower_uniq`, y la validación de `estado` en los tres handlers (`[id]/route.ts:135`, `usuarios/route.ts:187`, el job) | Nosotros | `pnpm db:blindaje` idempotente corre dos veces sin error; `sec_aplicaciones_sin_root()` → 0 filas; el DELETE de un no-root da 200 y el de un root único da **409** con `codigo:"SistemaSinRootError"` |
| **P6** | **`respuestaSiDejaSinRoot` aprende el marcador `SEC_SIN_ROOT`** y `bootstrap-root.ts` deja de mentir sobre las aplicaciones (`:118`, `:126-129`) | Nosotros | El 409 del punto anterior sale con mensaje accionable, no 500; `pnpm bootstrap:root -- --aplicacion 6` imprime los roots **de Granel** |
| **P7** | **Código nuevo desplegado** en el host que salga de P2, con un `deploy-secapi-prod.sh` derivado: rama o tag explícito (no `dev`), sin `git reset --hard origin/dev`, `db push` revisado contra un diff previo, `db:blindaje` después, y sin el `chown -R` hasta confirmar el dueño de los archivos | Nosotros | `GET /api/db/usuarios/importar` → **405**, no 400 |
| **P8** | **`users.js` + `/admsec/sync` desplegados** en el as400-api de ese host. Hoy `as400-api/src/routes/` de prod no tiene `users.js` | Nosotros | `POST /api/users/admsec/sync` con la key → 200 con `contrato: 2` |
| **P9** | **`USERS_API_KEY` en el entorno del as400-api** de ese host (en el bloque `env` de `pm2.config.js`, junto a `AS400_PASSWORD`, **o** en un `.env` con `chmod 600` — uno de los dos, no los dos) | Nosotros | `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:5000/api/users/admsec/list -d '{}' -H 'Content-Type: application/json'` → **401**, no 500 ni 404 |
| **P10** | **Las cuatro tablas creadas** (`sincronizacion_corridas`, `sincronizacion_detalle`, `sincronizacion_estado`, `sincronizacion_alcance`) con sus CHECK | Nosotros | `SELECT count(*) FROM sincronizacion_corridas` no da error; los CHECK aparecen en `pg_constraint` |
| **P11** | **Seed del alcance revisado y aprobado por una persona** | Nosotros + **quien apruebe** | `SELECT count(*) FROM sincronizacion_alcance WHERE gobernado` > 0 y todas con `aprobado_por IS NOT NULL` (lo exige el CHECK) |
| **P12** | **Canal de reporte y dead-man switch** funcionando fuera de secapi (n8n recomendado; **NO VERIFICADO** desde este repo) | Nosotros + **quien administre n8n** | Un POST de prueba llega; y con 26 h sin POST, llega la alarma de ausencia |
| **P13** | **Ventana de mantenimiento del AS400 a las 02:30**: ¿hay save nocturno o IPL? | **Infra / quien administre el AS400** | Confirmación escrita. **NO VERIFICADO** |
| **P14** | **Cron de RCE root removido** de 7.4, 7.13 y 2.22 (`/etc/cron.d/auto-upgrade`), y permisos de `cron-apt`/`e2scrub_all` corregidos (hoy `666`) | **Infra** | `ls /etc/cron.d/` sin `auto-upgrade` en los tres hosts |
| **P15** | **Entrada de pm2 dada de alta** con `SYNC_HOST_ESPERADO` con el hostname real de P1, `SYNC_ADMSEC_MODO=DRY_RUN`, y `pm2 save` | Nosotros | `pm2 describe secapi-sync-admsec \| grep -i cron` muestra el `cron_restart` |

**P14 no es de esta spec, pero es prerrequisito.** No tiene sentido endurecer quién puede escribir `estado` en un host donde, todos los días a las 00:00, root ejecuta lo que sirva un dominio externo por HTTP plano — en máquinas donde vive `AS400_PASSWORD` de `qsecofr` y el `DATABASE_URL`. Ítem relacionado y del mismo lote: **no hay backups en 7.4** (`cron.daily` no se ejecuta, así que `tklbam-backup` nunca corre).

---

## 8. Criterios de aceptación

Cada uno es verificable con el comando o la consulta que lo acompaña.

| # | Criterio | Cómo se comprueba |
|---|---|---|
| **CA1** | El wizard de importación no cambió: 29 tests en verde y `comparar.ts` sin tocar | `pnpm test:usuarios-comparacion` → `29 ok, 0 fallidos`; `git diff --exit-code src/lib/usuarios/comparar.ts scripts/test-usuarios-comparacion.ts` |
| **CA2** | El type-check y la suite entera pasan | `pnpm build`; `pnpm test` |
| **CA3** | El endpoint devuelve el padrón completo con `USUID`, `USUDTUPD` y el testigo, en un round-trip, y declara `contrato: 2` | `POST /api/users/admsec/sync` con la key → 200; `padron.total === 1106`, `padron.habilitados === 347`, `rows[0].ID` es un número, `testigo` presente |
| **CA4** | El job **no puede** escribir fuera de `aplicar.ts` | `pnpm tsx scripts/test-sync-solo-aplicar-escribe.ts` en verde, y falla al agregarle a mano un `tx.usuario.update` en `planificar.ts` |
| **CA5** | En `DRY_RUN` no se escribe una sola fila de `usuarios` | Corrida en dry-run; después `SELECT count(*) FROM sincronizacion_detalle WHERE corrida_id=<id> AND aplicada='S'` → **0**, y `SELECT max(estado_cambiado_en) FROM usuarios` sin cambios |
| **CA6** | `filas === 0` es FALLO, nunca dato | Apagar el as400-api y correr el job → fila con `resultado='FALLIDA'`, `motivo='AS400_UNAVAILABLE'`, y el reporte con esa alerta. **Nunca** `OK · 0 cambios` |
| **CA7** | `alcance_gobernado === 0` es FALLO (D23) | Poner todas las filas de alcance en `gobernado=false` en una base de prueba y correr → `ABORTADA_PREFLIGHT`, `motivo='ALCANCE_VACIO'` |
| **CA8** | El ratio de habilitados atrapa una lectura degradada | Correr contra un stub que devuelva las 1.106 filas con `HAB='S'` → `ABORTADA_PREFLIGHT`, `motivo='RATIO_HABILITADOS'` |
| **CA9** | El tope aborta sin escribir nada y deja el plan completo registrado | Corrida con delta > tope → `resultado='ABORTADA_POR_TOPE'`, `count(detalle where aplicada='S') = 0`, `count(detalle) = delta` |
| **CA10** | El job nunca desactiva a un usuario con rol Root de ninguna aplicación, y **no aborta por eso** | Marcar en un stub que `jgomez` viene con `HAB='N'` → detalle con `accion='OMITIDO'`, `motivo='ES_ROOT'`, `aplicada='N'`, `estado` de `jgomez` sin cambios, y **el resto del plan aplicado** |
| **CA11** | La invariante de root es de base y sobrevive al Prisma directo | `psql -c "UPDATE usuarios SET estado='I' WHERE id=<único root de app 6>"` → error `SEC_SIN_ROOT`, fila sin cambiar |
| **CA12** | La invariante **no** se dispara sola ni bloquea el panel | `SELECT * FROM sec_aplicaciones_sin_root()` → 0 filas; guardar la ficha de un usuario cualquiera y desactivar a un no-root → 200 |
| **CA13** | El panel devuelve 409 con `codigo` distinguible cuando el usuario está gobernado, en el PUT **y** en el DELETE, y **no** en un guardado que no toca `estado` | Tres `curl`: PUT con `estado` distinto → 409 `ESTADO_GOBERNADO_POR_ORIGEN`; DELETE → 409; PUT cambiando solo el teléfono → 200 |
| **CA14** | `estado` inválido se rechaza en los tres bordes | `PUT` con `estado:'X'` → 400 `ESTADO_INVALIDO`; `POST /api/db/usuarios` con `estado:'X'` → 400, no 500; `psql -c "UPDATE usuarios SET estado='X' WHERE id=1"` → violación de `usuarios_estado_valido` |
| **CA15** | Cada cambio queda con su evidencia de origen | `SELECT username, valor_anterior, valor_nuevo, origen_habilitado, origen_usuid, origen_usudtupd, aud_id, aud_usucon FROM sincronizacion_detalle WHERE aplicada='S'` → todas las columnas de origen pobladas |
| **CA16** | El estado de `USUDTUPD` se publica todas las noches, se mueva o no | `SELECT inicio, origen_usudtupd_max, origen_usudtupd_distintos, dias_sin_mover_usudtupd, usudtupd_veredicto FROM sincronizacion_corridas ORDER BY id DESC LIMIT 7` → 7 filas con datos, y el mail con el bloque `USUDTUPD` |
| **CA17** | El canario dispara solo | Con `usudtupd_cambio_en` seteado 22 días atrás → el reporte sale con WARN en el asunto |
| **CA18** | El reporte sale **todas** las noches, incluidas las de 0 cambios, y su ausencia alarma | 7 noches → 7 mensajes; cortar el webhook una noche → `reporte_enviado='N'` + `reporte_error`, y la alarma de ausencia del dead-man a las 26 h |
| **CA19** | Dos instancias simultáneas no se pisan y la segunda deja rastro | Lanzar el job dos veces en paralelo → una `OK` y una `SALTADA_POR_LOCK` con `host` y `pid` |
| **CA20** | Una corrida interrumpida no traba el lock ni queda ambigua | `kill -9` a mitad de corrida; verificar que `pg_locks` no tiene el advisory; la corrida siguiente marca la anterior `INTERRUMPIDA` |
| **CA21** | Un reboot no produce una escritura fuera de horario | Reiniciar el host a una hora hábil → fila con `ABORTADA_PREFLIGHT`, `motivo='FUERA_DE_VENTANA'`, cero escrituras |
| **CA22** | El job se niega a correr sin el blindaje | Borrar el trigger en una base de prueba y correr → `ABORTADA_PREFLIGHT`, `motivo='SIN_BLINDAJE'` |
| **CA23** | El duplicado de origen nunca se resuelve por sorteo | Stub con `CLARRAMENDI` en `'N'` (609) y `'S'` (839) → `OMITIDO`, `motivo='ORIGEN_SIN_CONSENSO'`, `estado` sin cambiar |
| **CA24** | La ausencia nunca desactiva (D1) | Stub sin `ROSINA ARAUJO` → detalle `AUSENTE_EN_ORIGEN` con `aplicada='N'`, `estado` sin cambiar, y `ausentes_en_origen` contado aparte |
| **CA25** | Un vaciamiento del origen aborta en vez de reportar OK | Stub que devuelve solo 20 de los gobernados → `ausentes_en_origen` > 5% → `ABORTADA_PREFLIGHT` |
| **CA26** | De un lockout se sale con la herramienta, no con SQL | Desactivar a mano al único root de una app de prueba (con el trigger apagado), y recuperarla con `pnpm bootstrap:root -- --usuario X --activar --aplicacion N` + login real con `curl` |
| **CA27** | El pasaje a REAL exige los dos candados | Con `SYNC_ADMSEC_MODO=REAL` y la fila en `DRY_RUN` → la corrida queda en `DRY_RUN` y el reporte dice por qué; y al revés |
| **CA28** | Ninguna salida del job es muda | Forzar cada fila de la tabla de §5.8.6 → en todos los casos hay fila de corrida (salvo "Postgres no contesta") **y** línea parseable en `logs/sync-admsec-out.log` **y** exit 0 |

---

## 9. Plan de trabajo por fases

Cada fase es entregable y verificable por separado. **El orden no es negociable**: si se invierte, el job es un script con la clave de superusuario de la base y sin cinturón.

### Fase 0 — Validación empírica de `USUDTUPD` (solo lectura, sin código de producción)

**Es la primera porque decide si el modo incremental existe alguna vez**, y porque su resultado va en el reporte desde el día uno.

1. Sonda de 7 días, una muestra cada 15 minutos, script de solo lectura, corrible desde dev:
   ```sql
   SELECT COUNT(*) AS TOT, COUNT(USUDTUPD) AS NO_NULOS, COUNT(DISTINCT USUDTUPD) AS DISTINTOS,
          VARCHAR_FORMAT(MAX(USUDTUPD),   'YYYY-MM-DD HH24:MI:SS.FF6') AS MAXV,
          VARCHAR_FORMAT(CURRENT TIMESTAMP,'YYYY-MM-DD HH24:MI:SS.FF6') AS AHORA
     FROM ADMSEC.USUARIOS
   ```
   `DISTINTOS > 1` es la señal. En cuanto ocurra, identificar las filas y cruzarlas contra `AUDITORIA` por `AUDPK='USUID=<n>'`.
2. **Acelerador honesto, y no es una escritura nuestra:** pedirle al administrador de ADMSEC que haga **una** baja y reactivación de una cuenta descartable por la pantalla VB6/GeneXus normal, a una hora conocida, y que diga el login. Es un cambio hecho por el dueño del sistema con su propia herramienta.

**Veredictos:**

| | Qué se observa | Consecuencia |
|---|---|---|
| **V1** | Se mueve ante cualquier escritura (`DISTINTOS` trepa a decenas en un día) | El modo incremental es viable. El snapshot sigue siendo el detector primario y el incremental queda como optimización opcional, con snapshot semanal de contraste |
| **V2** | Se mueve solo en la transacción de mantenimiento. **Se da por confirmado únicamente cuando se observe una entrada de auditoría con `(USUHABILITADO)` y el `USUDTUPD` de ese `USUID` sea ≥ ese `AUDFCHHORA`** | Ídem V1 |
| **V3** | Nunca se mueve: 7 días con `DISTINTOS=1` habiendo ≥300 entradas de auditoría en el mismo período (el piso medido es ~64/día) | `USUDTUPD` es decorativa. **El modo incremental no se implementa nunca**, y el reporte lo dice todas las noches con la fecha. Hay que informárselo al dueño con la evidencia, porque es su campo |

**Regla de escalamiento, reformulada respecto del diseño original:** el job **no** queda bloqueado por este veredicto. **El job escribe por snapshot desde el día uno; lo único que la Fase 0 habilita o deshabilita es el modo incremental.** La formulación contraria ("no se autoriza a escribir hasta que la sonda dé V1 o V2") bloquearía la feature indefinidamente contra la evidencia disponible, que hoy apunta a V3.

**Entregable:** el veredicto escrito con sus mediciones, y la fila `admsec.usuarios:usudtupd_cambio_en` sembrada.

### Fase 1 — Contrato de la fuente

`users.js`: dejar de destruir `USUID` (`:93`), el endpoint `/admsec/sync`, el comentario de `:73`. Tipos opcionales en `FilaAdmsec` y `ExternalUser`. `snapshotAdmsec()` en `as400Users.ts` + la clave de dedupe completa (`:36-49`). `REASONS_CONOCIDOS` con los códigos nuevos. Tests del builder en Node plano, sin AS400.
**Verificable con:** CA3, CA1, CA2. Desplegado en node-dev.

### Fase 2 — Blindaje de base

P3 (segundo root de Granel) **primero**. Después: el CHECK con `NOT VALID` + `VALIDATE`, `sec_aplicaciones_sin_root()`, los dos triggers, el índice único, `respuestaSiDejaSinRoot` con el marcador, `bootstrap-root.ts --activar` y el arreglo de su diagnóstico, y la validación de `estado` en los tres bordes. Todo en `scripts/sql/blindaje-usuarios.sql` + `pnpm db:blindaje`.
**Verificable con:** CA11, CA12, CA14, CA26, y una prueba manual del panel (DELETE de un no-root, DELETE del root único, guardado de ficha normal).
**Esta fase se sostiene sola y mejora el panel aunque el job no se construya nunca.**

### Fase 3 — Modelo de datos y alcance

Las cuatro tablas + los CHECK + las dos columnas en `Usuario`. El seed del alcance en dry-run, la revisión humana, el `--apply`. La pantalla del panel con sus políticas y el seed de funcionalidad.
**Verificable con:** CA15 (estructura), P10, P11.

### Fase 4 — El job en dry-run (dos semanas, D9)

El runner completo con lock, preflight, planificador, `aplicar.ts` en modo dry, reporte y dead-man. Entrada de pm2 **sin `--apply`**, `SYNC_ADMSEC_MODO=DRY_RUN`.
**Verificable con:** CA4, CA5, CA6, CA7, CA8, CA9, CA16, CA18, CA19, CA20, CA21, CA22, CA23, CA24, CA25, CA28.
**Salida de la fase:** catorce reportes consecutivos, revisados, con el backlog acumulado estable y entendido.

### Fase 5 — Reconciliación y primera escritura

1. El gate de UI (§5.5.6), desplegado **antes** de la primera escritura, o el panel y el job se pelean.
2. La reconciliación revisada de §6.4, aplicada a mano o como corrida `SIEMBRA`.
3. Los dos candados a REAL (§5.8.3), con `nota` obligatoria.
4. **La primera corrida real, a mano, con alguien mirando, acotada a `DGUERRERO`.**
5. Recién después: `pm2 delete` + `pm2 start --only` con `--apply`, y `pm2 save`.
**Verificable con:** CA10, CA13, CA27, y el detalle de la corrida con una sola fila `aplicada='S'`.

### Fase 6 — Opcionales, cada uno con su propia decisión

- **Alta automática (D4/D14).** Requiere: extraer `crearUsuario` con los dos campos nuevos de `Detalle`, forzar `desdeSistema='GSIST'`, registrar la fila de alcance **en la misma transacción** que el alta (si no, el usuario nuevo queda fuera del alcance para siempre y su estado no se vuelve a sincronizar), `alta_aprobada=true` por fila, y **una decisión explícita del dueño sobre el gate de Despacho**, porque pre-crear la fila lo elimina (§2.4).
- **Modo incremental**, solo si la Fase 0 dio V1 o V2, con snapshot semanal de contraste.
- **Espejo grupos ADMSEC → roles**, que es trabajo aparte y arranca planteándole al dueño que hoy el grupo 1 de ADMSEC otorga el rol Root de trackmovil por login.

---

## 10. Riesgos aceptados

**RA-1 — Dev y prod comparten Postgres, así que no existe ambiente de prueba.** `pm2.config.js:37` pone el mismo `DATABASE_URL` en todo lo que se despliegue desde este repo, y los dos escritores reales sobre esa base son node-dev (192.168.2.22) y secapi-prod (192.168.7.13). **Toda corrida del job, incluso en dry-run, lee el padrón de producción, y toda corrida en REAL lo escribe.** Se acepta a cambio de cinco capas, y **ninguna es negociable**: dry-run como default con escritura opt-in; el guard de host; el alcance acotado (`--solo`); los topes aplicados también en dry-run; y la trazabilidad por fila con `host`, `pid` y `commit`. Se revisa cuando exista una base de desarrollo separada. Nota adicional: `deploy-dev.sh:158-162` corre `prisma db push` contra esa misma base, así que **un deploy "de dev" puede mutar el schema que usa producción**.

**RA-2 — `USUDTUPD` puede no moverse nunca (NO VERIFICADO).** Es el escenario con más evidencia hoy. Se acepta porque el job no depende de ella; el costo es que el pedido literal del dueño (sincronizar por fecha de modificación) queda cumplido como observabilidad y no como mecanismo, y eso hay que decírselo con los números, no dejarlo implícito. Si la Fase 0 devuelve V3, la conversación que sigue es con quien mantiene los programas RPG/GeneXus.

**RA-3 — Puede existir una segunda instalación de secapi además de 7.13 (NO VERIFICADO).** La llave SSH fue rechazada en su momento y no se pudo descartar. El advisory lock cubre la integridad (una salta) y la fila `SALTADA_POR_LOCK` con `host` la hace visible, pero **el job nunca se instala en más de un host: el lock es la red de seguridad, no el plan.**

**RA-4 — `POST /api/db/query` del as400-api sigue expuesto.** SQL arbitrario como `qsecofr`, sin autenticación (`server.js:14`), desplegado en producción. **Queda fuera del alcance de esta spec y el job no lo usa**, pero hay que asignarle dueño: la recomendación, en orden, es (1) borrar el montaje de `server.js:14` y las tres líneas de `:32-34` — los tres endpoints son de debug según su propio comentario (`db.js:5`) y `/query` no tiene consumidor de producción; (2) si se conserva `/tablas` y `/columnas`, ponerles api-key y **eliminar `/query` igual**; (3) `app.listen(PORT, '127.0.0.1')` en `server.js:60`, porque `AS400_API_URL` es `http://localhost:5000`. El firewall de 7.4 lo tapa, pero depender de una sola capa para una API que corre como `qsecofr` es de más — y ya hubo un SSRF real en `/docs` desde ese mismo host.

**RA-5 — El trigger es derrotable por quien tenga la clave de la base.** `DATABASE_URL` conecta como `postgres`, que es superusuario y puede `SET session_replication_role = replica`. Esta capa frena accidentes y código que se olvidó de preguntar; no frena a alguien con la clave. Un rol no-superusuario para la app es seguimiento que vale.

**RA-6 — Quién es root lo puede cambiar GeneXus.** `applyAdmsecGroupRoles.ts:82-89` otorga el rol Root de trackmovil a cualquiera del grupo 1 de ADMSEC, en el login, sin que ningún admin intervenga. Como el job protege a los roots, **la pertenencia a un grupo administrado fuera de secapi decide a quién el job no puede desactivar**. Se acepta por ahora: el conjunto protegido se publica en el reporte de todas las noches con su tamaño, y un cambio en ese número es un evento destacado. La solución de fondo es otro trabajo.

**RA-7 — `desde_sistema` sigue ensuciándose.** No se normaliza (D13) porque hacerlo le sacaría el fallback de clave contra ADMSEC al único root de Granel. Las 9 filas sucias van a ser más, porque `UsuarioForm.tsx:63`, `:183`, `:560-562` y `usuarios/route.ts:197` siguen escribiendo. Se acepta porque **el job nunca lee esa columna**, y cerrar las canillas queda como tarea aparte con sus dos citas.

**RA-8 — El detector de ausencia depende de un sistema externo (n8n) que este repo no conoce (NO VERIFICADO).** Si n8n no está disponible, la alternativa mínima es una entrada de cron en otra máquina que consulte `SELECT max(inicio) FROM sincronizacion_corridas` y alarme si pasan 26 h. Lo que **no** es aceptable es que el detector de ausencia viva dentro del job.

**RA-9 — Cuatro comportamientos de plataforma sin medir**, todos con la defensa que los vuelve irrelevantes: (a) si `prisma db push` tira el CHECK y los triggers → PF7 y `pnpm db:blindaje`; (b) cómo expone Prisma un SQLSTATE de usuario por el camino del ORM → se matchea el marcador de texto **y** el ERRCODE; (c) si `cron_restart` vuelve a disparar sobre un proceso `errored` → D16, el job siempre sale con 0; (d) si este Db2 for i acepta un parameter marker en `FETCH FIRST` → se interpola un entero clampeado del lado del servidor.

**RA-10 — Los servidores tienen un RCE root diario y no tienen backups.** `/etc/cron.d/auto-upgrade` (P14) y `cron.daily` que no se ejecuta. No es de esta spec, pero **es prerrequisito**: no tiene sentido endurecer quién escribe `estado` en un host donde cualquiera que controle un dominio externo es root a las 00:00.

---

### Anexo — Correcciones de hecho respecto de los insumos

Para que no se re-litiguen. Todas verificadas contra el árbol en `9205bc0` o re-medidas contra los sistemas.

| Afirmación previa | Correcto |
|---|---|
| "el propio backfill quedó auditado" | **Falso.** La entrada de las 10:45:15.374896 es `AUDID=103228074`, `AUDPK='USUID=3'`, un guardado de permisos. El backfill dejó **cero** filas de auditoría |
| `AUDAPP` identifica el programa | **No.** Las bajas salen con `AUDAPP='ULOGIN'`. La columna que discrimina es `AUDUSUCON` |
| "25 tests" en `test-usuarios-comparacion.ts` | **29** (`29 ok, 0 fallidos`) |
| `cuentasSistema.ts:5` cubre 4 nombres | **5**: `ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR` |
| el middleware de `users.js` está en `:11` | **`:9`** |
| `soloHabilitados` default: `:73` SGM, `:118` ADMSEC | **`:18` SGM, `:73` ADMSEC**; `:118` es un `res.json` de `/ldap/list` |
| `usuarios/[id]/route.ts:256` borra la fila | **No hay hard delete de `usuario` en el repo.** El DELETE es soft (`:283-290`) |
| `permisos.ts:795` prueba que `resolveUsuario` exige `'A'` | `:795` es `resolveAplicacionId` sobre `aplicacion.estado`. La prueba es `:726`, sola |
| ensanchar `ClientePrismaRoles` rompe la compilación de los tests | **No**: `test-root-por-rol.ts:409` usa `as never`. Rompe en **runtime** con `TypeError` |
| `BotonRoot` ya sabe estar gris con motivo | **No**: `solo-root.tsx:77-82`, la rama `puede` descarta el `motivo`. Es una modificación de componente |
| `bootstrap-root.ts --aplicacion N` lista los roots de esa app | **No**: `:118` llama sin argumentos y `:126-129` imprime siempre los de la app 1 |
| `NODE_ENV !== 'production'` distingue dev de prod | **No**: `pm2.config.js:17` lo hardcodea y hay un solo bloque `env` |
| `import-sgm-preferences.ts:22` instancia `PrismaClient` | **`:128`**, y **adentro de una función** |
| `sources/index.ts:112` pasa `true` | Pasa el valor del que llama; los dos call sites reales ya lo pasan explícito |
| son 7 los sitios que escriben `usuario` | **10** (faltaban `importar/route.ts:88`, `usuarios/route.ts:180`, `upsertExternalUser.ts:56`) |
| el fail-closed está en `apiGuard.ts:895-900` | Declarado en `:812`, ejecutado en `:921-930`. La frase sobre el test está en `:42-45` |
| citas menores | `mapeo.ts:100` (email null); `importar/route.ts:105-106` (nombre), `:72-82` (colisiones), `:107` (estado); `cuentasSistema.ts:20`; `comparar.ts:78`, `:89-103`, `:119`, `:131`; `upsertExternalUser.ts:69`, `:122-136`; `resolveCredentials.ts:440`, `:710`; `applyAdmsecGroupRoles.ts:82-89`; `permisos.ts:258-269`, `:305`, `:321-349`, `:392-406`; `auth-admsec.js:59-63`; `as400.js:47-49`; `Sidebar.tsx:60-62`; `usuarios/[id]/route.ts:169` (fechaBaja) |
