# Sync horario de usuarios: Gestión de Sistemas → secapi

Fecha: 2026-09-01 · Repo: `security_suite` · Rama: `dev` · Estado: **propuesta, sin implementar**
Mediciones de respaldo: `2026-09-01-sync-usuarios-admsec-RELEVAMIENTO.md`.

---

## 1. Qué hace

Un job que corre **cada una hora**:

- **Regla A.** Si un usuario de `ADMSEC.USUARIOS` no existe en la Postgres de secapi, lo importa.
- **Regla B.** Si existe, y su `USUDTUPD` es más nueva que la marca de la última corrida, y el estado difiere, le actualiza el estado.

Y nada más. No toca roles, ni `esRoot`, ni `fechaBaja`, ni el AS400, ni SGM. No desactiva por ausencia en el origen.

Dos decisiones del dueño sobre la Regla A: **se importa toda la tabla**, incluidos los deshabilitados, que nacen con `estado='I'`; y **las cuentas de sistema se saltean** dejando constancia.

---

## 2. Los cinco datos que condicionan el diseño

Medidos el 2026-09-01. Todo lo demás de esta spec sale de acá.

1. **La tabla es chica: 1.106 filas, y leerla entera tarda 0,12 s.** Por eso el job lee todo cada hora y filtra en memoria: no hay nada que optimizar ni consultas incrementales que construir.
2. **Hoy faltan 1.092 usuarios en Postgres y hay 0 con el estado divergente.** La primera corrida son ~1.073 altas (descontando cuentas de sistema); la Regla B, hoy, no haría nada.
3. **`USUDTUPD` llega como texto, no como fecha.** node-jt400 lee todo con `getString()` y devuelve JSON, y JSON no tiene tipo fecha (`as400-api/node_modules/node-jt400/dist/lib/baseConnection.js:33-35`). Compararla contra un `Date` de Prisma da `false` **siempre**, sin error: la Regla B no se dispararía nunca. Por eso los dos valores salen del mismo reloj del AS400 y se comparan como texto (3.2).
4. **Los dos únicos roots están en ADMSEC.** `jgomez` (Root en apps 1, 3, 5) y `dmedaglia` (apps 1, 3, 5 y **único root de Granel**), los dos con `USUAUTAD='A'` y habilitados. Si allá los deshabilitan, el job los desactiva acá dentro de la hora, y de eso no se sale con `scripts/bootstrap-root.ts` —que se niega a operar sobre un usuario inactivo (`:153`)— sino con SQL a mano contra producción.
5. **Dev y prod apuntan a la misma Postgres** (`.env:5` y `pm2.config.js:37`). Cualquier corrida en dev escribe en el padrón de producción.

Un sexto dato, que no condiciona el diseño pero sí el calendario: **`USUDTUPD` no la mantiene la base.** Es una columna común (`IS_UPDATABLE=Y`, sin `GENERATED`, sin trigger propio) y hoy las 1.106 filas tienen el mismo valor del backfill. Solo se va a mover si los programas que escriben `ADMSEC.USUARIOS` la escriben, y eso **no está verificado**. La Regla A no lo necesita; la Regla B sí. Ver 6.

---

## 3. El job

### 3.1 El ciclo

```
1. INSERT de la corrida EN_CURSO.
   Si choca con el índice único → ya hay una corriendo: salir 0.
2. reloj  = VARCHAR_FORMAT(CURRENT TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF6')  del AS400
3. marca  = reloj_origen de la última corrida con resultado 'OK'   (null la primera vez)
4. filas  = SELECT ... FROM ADMSEC.USUARIOS         → si vienen 0, FALLIDA y salir
5. padrón = usuarios de Postgres (id, username, estado, fechaBaja, roles)
6. Por cada fila del origen, aplicar 3.3. En lotes de 10.
7. UPDATE de la corrida a 'OK', guardando `reloj` como reloj_origen.
```

La marca solo avanza si se llega al paso 7. Si el job falla, la corrida siguiente vuelve a ver la misma ventana.

### 3.2 Las consultas

```sql
-- El origen. VARCHAR_FORMAT da ancho fijo: sin él, ".0" y ".000000" comparan
-- mal como texto. Los dos valores que se comparan salen de este mismo reloj.
SELECT USUID,
       TRIM(USULOGIN)                                        AS LOGIN,
       USUHABILITADO,
       USUAUTAD,
       VARCHAR_FORMAT(USUDTUPD, 'YYYY-MM-DD HH24:MI:SS.FF6') AS DTUPD
  FROM ADMSEC.USUARIOS;

-- El reloj de la corrida, mismo formato:
SELECT VARCHAR_FORMAT(CURRENT TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF6') AS RELOJ
  FROM SYSIBM.SYSDUMMY1;

-- La marca:
SELECT reloj_origen FROM sync_admsec_corridas
 WHERE resultado = 'OK' ORDER BY inicio DESC LIMIT 1;
```

### 3.3 La regla, entera

```ts
const esperado = fila.USUHABILITADO === "S" ? "A" : "I";
const local = padron.get(normalizar(fila.LOGIN));      // UPPER(TRIM()), comparar.ts:19

// ── Regla A ────────────────────────────────────────────────────────────────
if (!local) {
  if (esCuentaDeSistema(fila.LOGIN)) return omitir("CUENTA_SISTEMA");
  return crearUsuario(                                  // la función que ya existe
    { username: fila.LOGIN, habilitado: esperado === "A",
      origen: fila.USUAUTAD === "A" ? "LDAP" : "GSIST", email: null, nombre: null },
    { creadoPor: "sync-admsec", conRoles: false, conPreferencias: false, dryRun });
}

// ── Regla B ────────────────────────────────────────────────────────────────
// Los dos son string con el mismo formato. NUNCA new Date(): ver 2.3.
const avanzo = marca !== null && fila.DTUPD !== null && fila.DTUPD >= marca;
if (!avanzo || esperado === local.estado) return;

if (esperado === "I" && local.esRoot)    return omitir("ES_ROOT", avisar);
if (esperado === "A" && local.fechaBaja) return omitir("BAJA_LOCAL", avisar);

return actualizarEstado(local.id, esperado);            // y nada más que estado
```

Tres renglones que no son obvios:

- **`>=` y no `>`.** La marca es el arranque de la corrida anterior; con `>` se pierde la fila estampada en ese microsegundo. Reprocesar no hace daño porque igual solo escribe si el estado difiere.
- **`USUDTUPD` nula → no se toca.** La columna es nullable y la regla pide una marca más nueva; una fila sin marca no la tiene.
- **Primera corrida (`marca === null`) → la Regla B no se dispara.** Hoy las 1.106 filas comparten la marca del backfill: cualquier otro criterio las metería a todas de golpe. Se siembra la marca y listo, y como hoy hay 0 divergencias no se pierde nada.

### 3.4 Los dos `omitir` que valen la pena

**`ES_ROOT`** existe por el dato 2.4: si el job desactiva a los dos roots, nadie administra secapi y la recuperación es SQL a mano en producción. El criterio de "es root" **se toma de `aplicacionesRootDeUsuario` (`src/lib/permisos.ts:272`), no se reimplementa** — el código acepta `'root'`, `'ROOT'` y `' Root '` como el mismo rol (`src/lib/auth/apiGuard.ts:290` lo documenta), y comparar `= 'Root'` a secas construye justo el lockout que se quiere evitar.

**`BAJA_LOCAL`** existe porque `DELETE /api/db/usuarios/:id` hace soft-delete: pone `estado='I'` y `fechaBaja`, **y no borra los roles** (`src/app/api/db/usuarios/[id]/route.ts:283-292`). Una persona que se fue en junio y que en Gestión de Sistemas sigue habilitada volvería a estar activa con todos sus roles la primera vez que algo mueva su `USUDTUPD`. `fechaBaja` es la marca de "esta baja la decidió secapi".

### 3.5 Las cuentas de sistema

Lista propia del job, en `scripts/sync-admsec/cuentas.ts`. **No se extiende `src/lib/usuarios/cuentasSistema.ts`**: ese módulo lo consume el wizard del panel vía `comparar.ts:119` para decidir qué viene tildado, y tocarlo cambia el wizard.

```ts
const NOMBRES = new Set([
  "AUDITORIA","DAEMONS","DIRECTORIO","DISTRIWEB","FPROLOAUD","GPSONLINE",
  "GRANELWEBONLINE","IGTEST","INCIDENTES","INVITADO","PRODUCCION",
  "PUESTODEMO","PUESTOPRUEBA","ROOT","TALLER","ADMINISTRADOR",
]);
const PREFIJOS = ["PEDWEB"];   // PEDWEBADMIN, PEDWEBPISTA, PEDWEBTOMAPED, PEDWEBTPEDCALLE
```

Son las 19 identificadas entre los 22 habilitados de `USUAUTAD='G'`, más `ADMINISTRADOR`, que ya está en la lista del wizard. Aplica también a los 505 deshabilitados, donde es razonable que haya más: **la corrida en seco es el relevamiento**, se mira la lista de omitidos y se ajusta antes de escribir.

---

## 4. Lo que hay que crear

Una tabla y un índice. Nada más.

```prisma
model SyncAdmsecCorrida {
  id           Int       @id @default(autoincrement())
  inicio       DateTime  @default(now()) @db.Timestamp(6)
  fin          DateTime? @db.Timestamp(6)
  /// EN_CURSO | OK | FALLIDA
  resultado    String    @default("EN_CURSO") @db.VarChar(12)
  /// El reloj del AS400 al arrancar, COMO TEXTO (2.3). Nullable porque una
  /// corrida que falla antes de leerlo igual tiene que poder registrarse.
  relojOrigen  String?   @map("reloj_origen") @db.VarChar(32)
  altas        Int       @default(0)
  cambios      Int       @default(0)
  omitidos     Int       @default(0)
  /// Los ES_ROOT, los BAJA_LOCAL y cualquier error: texto plano, para leer.
  nota         String?

  @@map("sync_admsec_corridas")
}
```

```sql
-- Impide dos corridas simultáneas. Con dev y prod contra la misma base (2.5),
-- alcanza con esto: el segundo proceso choca con el índice y sale.
CREATE UNIQUE INDEX ux_sync_admsec_una_en_curso
  ON sync_admsec_corridas ((1)) WHERE resultado = 'EN_CURSO';
```

Una corrida `EN_CURSO` de más de dos horas es una huérfana: se la marca `FALLIDA` y se sigue. Sin eso, un job que muere deja la sincronización trabada.

A 24 corridas por día son ~8.800 filas al año. No necesita purga.

---

## 5. Cómo corre

```js
// pm2.config.js — el intervalo se cambia acá y en ningún otro lado
{
  name: "sync-admsec",
  script: "node_modules/.bin/tsx",
  args: "scripts/sync-admsec.ts",
  cwd: "/var/www/secapi",
  cron_restart: "0 * * * *",
  autorestart: false,                 // es un job; sin esto pm2 lo relanza en loop
  env: { ...envDeSecapi, SYNC_ADMSEC_ESCRIBE: "no", TZ: "America/Montevideo" },
}
```

Va por pm2 y no por `/etc/cron.d` porque **en producción no hay `.env`**: pm2 es lo único que inyecta `DATABASE_URL`.

`SYNC_ADMSEC_ESCRIBE` arranca en `"no"` por el dato 2.5. Se pone en `"si"` cuando la corrida en seco se revisó.

Si el AS400 o Postgres no contestan, el job sale con error, deja la corrida en `FALLIDA` y no reintenta: la hora siguiente ve la misma ventana porque la marca no se movió.

El registro de lo que hizo es la fila en `sync_admsec_corridas` más el log de pm2.

---

## 6. Lo que hay que saber antes de encenderlo

**`USUDTUPD` puede no estar viva.** Es una columna común: si nadie modificó los programas del AS400 que escriben la tabla, nunca se mueve, y la Regla B no se dispara jamás — sin errores, sin señales, con corridas en verde. Hay que confirmarlo con quien creó la columna, o resolverlo con un trigger `BEFORE UPDATE` en la propia tabla, que la haría inmune a qué programa escriba.

**No bloquea encender el job**: la Regla A anda igual, y hoy la Regla A es todo el valor (1.092 altas contra 0 cambios de estado).

Y la vigilancia sale gratis, porque el job ya lee el padrón entero: **contar cuántas filas tienen el estado divergente sin que `USUDTUPD` haya avanzado.** Hoy ese número es 0. Si algún día no lo es, alguien cambió un estado allá sin que la columna se moviera, y va a la `nota` de la corrida. El job igual no las toca: la regla que pediste es la que manda.

**Lo que falta en producción para poder desplegar**, verificado en vivo sobre 192.168.7.4: el código está viejo —faltan `src/lib/usuarios/` y la ruta de importar en secapi, y **`src/routes/users.js` en as400-api**, que es de donde el job leería—, y `USERS_API_KEY` no está en el entorno de ninguno de los dos procesos.

---

## 7. Trabajo

1. **Fuente.** Agregar `USUDTUPD` al `SELECT` de `as400-api/src/routes/users.js` y hacer que el dato atraviese `FilaAdmsec` y `ExternalUser` (`src/lib/usuarios/sources/mapeo.ts:29-38` y `:87-105`). Hoy `users.js:92` además descarta el `USUID`.
2. **Reusar `crearUsuario`.** Está en `src/app/api/db/usuarios/importar/route.ts:32-147`, no depende de la sesión, y ya hace todo lo que necesita el alta: minúsculas, `password:""`, `estado: habilitado ? "A" : "I"` (`:107`), y los tres chequeos de colisión. Le falta `export`. **No tiene tests** —ninguna de las 11 suites la importa—, así que se le escriben antes de moverla, no después. El wizard tiene que seguir andando igual.
3. **La tabla y el índice** de la sección 4.
4. **El job**: el ciclo de 3.1 y la regla de 3.3.
5. **Correr en seco a mano.** De ahí salen la lista real de cuentas de sistema y las colisiones que `crearUsuario` reporta sin crear.
6. **La siembra**: las ~1.073 altas, a mano y en horario de trabajo. Si muere a mitad de camino se vuelve a correr — las ya hechas salen omitidas por el chequeo de existencia.
7. **Encenderlo**: `SYNC_ADMSEC_ESCRIBE=si` y la entrada de pm2.

Los puntos 1 y 2 no dependen de nada. El 6 y el 7 necesitan el deploy y la `USERS_API_KEY` de la sección 6.

## 8. Que hay que poder verificar

1. Con el padrón sincronizado, una corrida no escribe ninguna fila en `usuarios`.
2. Un usuario que falta se crea con el `estado` correcto, `password=""`, `creadoPor='sync-admsec'` y cero roles.
3. **La comparación de `USUDTUPD` contra la marca funciona** y no involucra ningún `Date`. Es el test que atrapa el bug de 2.3, y el único imprescindible.
4. Con `USUDTUPD` avanzada y el estado distinto, se actualiza **solo** `estado`: `fechaBaja` y el resto quedan intactos.
5. Con el estado distinto pero `USUDTUPD` sin avanzar, no se toca nada.
6. Un usuario con rol Root que el origen manda desactivar no se desactiva. El test usa un rol llamado `'ROOT'` en mayúsculas, para probar que la comparación es tolerante.
7. Un usuario con `fechaBaja` que el origen manda activar no se reactiva.
8. Con `SYNC_ADMSEC_ESCRIBE` distinto de `"si"`, ninguna invocación escribe en `usuarios`.
9. Dos ejecuciones simultáneas: la segunda sale sin escribir.
10. Un origen que devuelve 0 filas deja la corrida en `FALLIDA` y no escribe.

---

## 9. Fuera de alcance

No entra: escribir en el AS400; SGM; usuarios locales; roles, `esRoot` y el espejo de grupos de ADMSEC; desactivar por ausencia en el origen; escribir `fechaBaja`.

Tres cosas que aparecieron en el relevamiento, son reales y **no** son de esta spec:

- `PUT /api/db/usuarios/:id` escribe `body.estado` sin validar (`:135-139`): un valor que no sea `'A'`/`'I'` deja un usuario que loguea pero come 401 en todo `/api/db`.
- `verificarQueQuedaRoot` solo mira la aplicación 1 (`src/lib/permisos.ts:321-327`), así que **`dmedaglia`, único root de Granel, hoy no está protegido por nada** salvo el `ES_ROOT` de este job.
- `POST /api/db/query` del as400-api ejecuta SQL arbitrario con `qsecofr` **sin autenticación** y está desplegado en producción (`as400-api/server.js:14` lo monta sin el middleware de api-key).
