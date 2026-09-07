# CLAUDE.md

Ficha del repo para una consola de Claude Code que va a tocar este código sin
haberlo visto antes. Es un repo de **producción**: lo que rompas acá deja sin
login a cuatro aplicaciones.

## Qué es

**secapi** (carpeta histórica `security_suite`, app pm2 `securitySuite`) es el
**RBAC y la autenticación centralizada de RíoGas**: quién es cada usuario, qué
roles tiene y qué puede ver en cada aplicación. No es solo un panel — es el
servicio del que cuelgan las demás:

- `POST /api/db/login` es el login de **secapi, Goya, TrackMovil y el edge de
  Granel** (y el único endpoint público de toda la app: no hay registro ni
  recuperación de clave).
- `POST /api/db/permisos` es el gate de **cada pantalla** de Goya y TrackMovil.
- Cuatro endpoints los llama el edge de Granel server-to-server con una api-key
  (`x-api-key`), sin usuario detrás.

Si algo de eso devuelve algo distinto de lo que devolvía, se cae el login de
otra app — y en el caso de Granel se cae **en silencio** (su `existeEnSecapi`
trata cualquier respuesta != 200 como "no existe" y se va por el camino
equivocado).

### Stack

Next.js 16 (App Router) + TypeScript 5.9 estricto + React 18, **pnpm 10**,
Prisma 6 sobre PostgreSQL, Radix UI + Tailwind v4 + Framer Motion, axios con
interceptores propios. Repo `github.com/Riogas/security_suite`, se trabaja en
la rama **`dev`** y se mergea a `main` para producción.

### Los dos caminos de API

1. **`/api/[...proxy]`** — catch-all que reenvía al backend **GeneXus/Tomcat**
   (`BACKEND_BASE_URL`, hoy `https://sgm.glp.riogas.com.uy/servicios/SecuritySuite`).
   Por ahí van el login del panel, el menú y operaciones legacy de permisos.
2. **`/api/db/*`** — endpoints propios contra **Postgres vía Prisma**, sin pasar
   por GeneXus. Módulos: `usuarios`, `roles`, `aplicaciones`, `funcionalidades`,
   `acciones`, `objetos`, `accesos`, `permisos`, `menu`, `solicitudes`, `login`.
   Son ~64 operaciones y **todas** pasan por el guard (ver abajo).

### Autorización: dónde vive de verdad

- `src/lib/auth/verificarJwt.ts` — **la única puerta**. Verifica firma HS256,
  vencimiento y que `JWT_SECRET` sea un secreto real. Todo lo que decide "quién
  sos" importa de acá.
- `src/lib/auth/apiGuard.ts` — el guard de `/api/db/*`. Tiene la tabla
  `POLITICAS`: una fila por (patrón, métodos) con su **nivel** — `PUBLICA`,
  `SERVICIO`, `AUTENTICADA`, `ADMIN`, `ROOT` — y el motivo escrito. Lo que no
  está declarado se **deniega** (`SIN_POLITICA`). Cada handler arranca con
  `const guard = await requireApiAuth(req); if (!guard.ok) return guard.respuesta;`
- `src/lib/permisos.ts` — resolución de usuario, motor de permisos y **root por
  ROL**: ser root es tener asignado el rol llamado `Root`, vigente y activo. La
  columna `usuarios.es_root` **sigue en el schema pero ya no autoriza nada**;
  `UsuarioAuth` ni la expone, para que colgar una decisión de ella no compile.
  El rol Root de *SecuritySuite* (aplicación 1) es el superusuario del
  ecosistema; el de cada otra aplicación vale solo para la suya. En producción
  el Root de secapi son **dos personas**.
- `src/proxy.ts` — el ex-`middleware.ts` (Next 16 renombró la convención).
  Guardia de **pantallas**, no de API: calcula un código `XXXX-XXXX` por ruta y
  consulta `/api/db/permisos`. Ojo con lo que dice "Trampas conocidas".
- `src/components/ui/solo-root.tsx` + `src/hooks/usePuedeAdministrar.ts` — el
  gate **visual**: los botones que el servidor va a rechazar se muestran
  deshabilitados con el motivo, no escondidos.

### Estructura

```
src/
├── app/
│   ├── api/[...proxy]/    proxy a GeneXus
│   ├── api/db/            endpoints Prisma (uno por módulo, `[id]/route.ts` para el detalle)
│   ├── api/docs/          spec y "Try it" del portal /docs (solo root)
│   ├── dashboard/         pantallas protegidas
│   └── login/ · no-autorizado/
├── components/{ui,dashboard,docs}/
├── hooks/                 useAuth, useUser, useEsRoot, usePuedeAdministrar, useApiCall…
├── lib/
│   ├── auth/              apiGuard, verificarJwt, responses, upsertExternalUser, clients/as400Client
│   ├── docs/              root-guard, spec, catalogo, try-*
│   ├── usuarios/          comparar, importar, syncAdmsec, sources/
│   └── permisos.ts · prisma.ts · axios.ts · routeCode.ts
├── services/api.ts        wrappers de llamadas del panel (~2.400 líneas)
└── proxy.ts               guard de pantallas
scripts/                   los 13 tests + generador de OpenAPI + seeds + sync-admsec
prisma/schema.prisma       17 modelos, camelCase con @map a snake_case
as400-api/                 Express aparte (auth AS400/DB2 + LDAP), puerto 5000
docs/api/                  openapi.json (generado) + anotaciones.yaml (a mano)
docs/superpowers/specs/    los diseños largos de cada cambio grande
```

## Cómo se levanta

Node 22, **pnpm 10** (`corepack enable`; el `packageManager` del package.json lo
fija). npm y yarn no.

```bash
pnpm install
pnpm dev              # servidor de desarrollo en el puerto 4005
pnpm build            # prisma generate && next build
pnpm start            # producción local, 4005
pnpm prisma:generate  # regenerar el cliente después de tocar el schema
pnpm prisma:studio
```

`pnpm build` **siempre** corre `prisma generate` primero; si el cliente está
viejo el build falla con errores de tipos que no tienen nada que ver.

### Variables de ambiente

No hay `.env` versionado (`.gitignore` bloquea `.env*`). Plantilla comentada en
`.env.production.example`. Las que importan:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres `securitysuite` en `192.168.2.117:5432` |
| `JWT_SECRET` | **obligatoria**. ≥32 chars y distinta del default que quedó en el código. Sin ella todo `/api/db` responde 503 y el login corta en la puerta |
| `SECAPI_SERVICE_KEY` | api-key **entrante** (Granel → secapi), header `x-api-key`, ≥32 chars, admite lista separada por comas para rotar |
| `USERS_API_KEY` | api-key **saliente** (secapi → as400-api). No confundir con la anterior |
| `NEXT_PUBLIC_APLICACION_ID` / `APLICACION_ID` | `1` = SecuritySuite |
| `BACKEND_BASE_URL`, `PERMISOS_API_URL` | el Tomcat de GeneXus |
| `AS400_API_URL` | `http://localhost:5000`, el Express de `as400-api/` |
| `PERMISOS_ENFORCE` | `1` prende el bloqueo por permisos en `/dashboard`. Distinto de `1` = no bloquea nada |
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | el backend GeneXus tiene cert autofirmado |

### Dónde corre

| Ambiente | Host | Puerto | Cómo |
|---|---|---|---|
| dev | node-dev `192.168.2.22` → `secapi-dev.glp.riogas.com.uy` | 3001 | pm2 + `deploy-dev.sh` desde la rama `dev` |
| producción | `192.168.7.13` → `secapi.glp.riogas.com.uy` | 3001 | pm2, desde `main` |
| local | tu máquina | 4005 | `pnpm dev` |

pm2 levanta **tres** procesos desde `pm2.config.js`: `securitySuite` (el Next),
`as400-api` (Express, 5000) y `sync-admsec` (job horario, `cron_restart: '0 * * * *'`,
`autorestart: false`).

**En matrix (`~/proyectos/secapi`) no hay ningún `.env`.** Esa copia sirve para
leer, escribir código y correr las pruebas — que no necesitan base ni red. No
intentes levantar el servidor ni pegarle a Postgres desde ahí.

## Cómo se prueba

**El comando es `pnpm test`.** Tarda **~48 segundos** en matrix, encadena 13
suites y suma **305 aserciones**. No necesita base de datos, ni el backend
GeneXus, ni el servidor levantado: los tests construyen el guard con
`crearGuardApi()` y un `resolveUsuario` falso, y los JWT los firman de verdad
con `jsonwebtoken`.

```bash
pnpm test                 # la cadena completa — esto es lo que tiene que quedar verde
pnpm test:api-guard       # o una sola suite mientras iterás
```

El repo **no tiene runner de tests**: cada suite es un script `tsx` con sus
propias aserciones, imprime `N ok, 0 fallidos` y sale con código != 0 si algo
falla. Las 13, y qué cuida cada una:

| Suite | Cuida |
|---|---|
| `test:api-guard` (56) | las decisiones del guard + recorre `src/app/api/db/**/route.ts` y falla si aparece un handler sin `requireApiAuth` o una ruta sin política |
| `test:motor-secapi` (26) | el motor de permisos aplicado a la propia secapi (nivel ADMIN) y que el sujeto del token resuelva a UNA persona, no a la fila que Postgres devuelva primero |
| `test:root-por-rol` (32) | root = rol Root; vigencia por fechas; que `es_root` no vuelva a autorizar |
| `test:ui-gates-root` (6) | que toda pantalla que escribe contra un endpoint ROOT/ADMIN use el gate, con el `alcance` correcto |
| `test:docs-guard` (27) | el gate solo-root del portal `/docs`, incluido el digest del secreto de compromiso |
| `test:docs-try` (49) | el "Try it": que no sea un proxy abierto |
| `test:docs-catalogo` (25) | el merge de `openapi.json` + `anotaciones.yaml` |
| `test:docs-anotaciones` (6) | que un endpoint nuevo no entre al repo sin entrada en `anotaciones.yaml` (los 51 viejos son una deuda declarada en `SIN_ANOTAR_ACEPTADOS`) |
| `test:docs-drift` | `generar-openapi.ts --check`: falla si `docs/api/openapi.json` quedó viejo |
| `test:usuarios-comparacion` (29) | el clasificador de comparación externo↔Postgres y el mapeo de filas del AS400 |
| `test:upsert-external` (7) | el re-vínculo por email en el login externo (vector de escalada) |
| `test:importar-crear-usuario` (11) | el alta de usuario externo |
| `test:sync-admsec` (31) | el plan del job horario ADMSEC → secapi |

### Puertas adicionales

- **Compilación:** `./node_modules/.bin/tsc --noEmit` — pasa limpio, tarda ~63 s.
  Corrélo si tocaste tipos; `pnpm test` **no** typechequea la app entera.
- **`pnpm lint` está roto** y no se arregla desde acá (ver Trampas).

### Si tu cambio toca la API o la UI

- Agregaste/moviste/borraste un `src/app/api/**/route.ts` → corré `pnpm docs:api`
  y **commiteá `docs/api/openapi.json`** junto con el cambio, o `test:docs-drift`
  te tira la cadena abajo.
- Agregaste una ruta bajo `/api/db` → declarala en `POLITICAS`
  (`src/lib/auth/apiGuard.ts`) con su nivel y su `motivo`, y llamá a
  `requireApiAuth` en cada handler. Sin eso el test falla; sin el test, la ruta
  nacería abierta.
- Agregaste un botón que escribe contra un endpoint ROOT o ADMIN → envolvelo en
  `<BotonRoot alcance="…">` con el mismo alcance que la política.

### Si escribís un test nuevo

Copiá el formato de `scripts/test-api-guard.ts` (mini-framework de aserciones
propio, sin dependencias), guardalo como `scripts/test-<tema>.ts`, agregá el
script `test:<tema>` al `package.json` y **encadenalo en el script `test`**. Si
no lo encadenás, no lo corre nadie.

## Convenciones

- **Todo en español rioplatense**: comentarios, mensajes de error de cara al
  usuario, nombres de tests y commits.
- **Commits**: conventional commits en minúscula describiendo el *efecto*, no la
  mecánica. `fix(auth): la baja y el barrido de SGM salen del otorgamiento`,
  `feat(sync): el job pasa a escribir`. Scopes en uso: `auth`, `seguridad`,
  `usuarios`, `sync`, `ui`, `docs`, `deps`, `pm2`.
- **Los comentarios explican POR QUÉ, con el dato medido.** Es el estándar real
  del repo: los bloques de `apiGuard.ts`, `permisos.ts` y `verificarJwt.ts`
  cuentan qué se rompía antes, cuánto medía el problema en producción y qué
  alternativa se descartó. Si vas a tomar una decisión no obvia, escribila así.
  No borres esos bloques para "limpiar".
- **Imports** con el alias `@/*` → `src/*`. Nunca rutas relativas largas.
- **Nombres de archivo**: `src/components/ui/` en kebab-case (`data-table.tsx`,
  `solo-root.tsx`); `src/components/dashboard/<modulo>/` en PascalCase
  (`MenuBuilder.tsx`); hooks `useAlgo.ts`; helpers de dominio en
  `src/lib/<dominio>/`.
- **Tipos de API**: los campos opcionales son `null`, no `undefined`.
- **Prisma**: modelo en camelCase con `@map` a la columna snake_case y `@@map` a
  la tabla. Estado activo/inactivo = `estado: 'A' | 'I'`. Las asignaciones de rol
  llevan rango `fecha_desde` / `fecha_hasta` (las dos en null = vigente siempre).
- **Permisos en la UI**: nadie consulta `useEsRoot` directo — se pregunta
  `usePuedeAdministrar(alcance)`, y el `alcance` tiene que coincidir con el nivel
  del endpoint en `POLITICAS`. `test:ui-gates-root` lo verifica estáticamente.
- **Tailwind v4 con `@theme inline`**: un color nuevo necesita **doble entrada** —
  en `@theme inline` (`--color-X: var(--X)`) y en `:root`/`dark` (`--X: valor`).
  `fontSize` no.
- Los archivos del repo tienen **CRLF**. Un reemplazo por script tiene que usar
  `\r\n` explícito.
- Los diseños largos viven en `docs/superpowers/specs/` con fecha en el nombre.
  Si vas a cambiar algo grande, el diseño de la vez pasada suele estar ahí.

## Trampas conocidas

1. **Dev y producción comparten la MISMA Postgres de producción.** No existe
   base de pruebas. Cualquier script que escriba, corrido desde donde sea, toca
   el padrón real. Por eso `sync-admsec` arranca **en seco** por defecto y sólo
   escribe con `--escribir` o `SYNC_ADMSEC_ESCRIBE=si`.
2. **`deploy-dev.sh` corre `prisma db push`** contra esa misma base: un deploy
   "de dev" puede mutar el schema que usa producción.
3. **`pnpm lint` está roto.** Next 16 sacó `next lint` del CLI y el script quedó
   apuntando a nada (`Invalid project directory provided, no such directory:
   .../lint`). La verificación de compilación es `tsc --noEmit`. `npx eslint`
   directo también falla, por referencias circulares en la config. No lo
   "arregles" de paso: no es tu tarea y toca la config de todo el repo.
4. **`src/proxy.ts` falla ABIERTO a propósito**: su `catch` devuelve
   `NextResponse.next()`, y todo su guard está detrás de `PERMISOS_ENFORCE`, que
   en varios ambientes está apagado. Corre en runtime Edge (sin `jsonwebtoken`,
   sin Prisma). **No cuelgues autenticación de API de ahí** — para eso está
   `requireApiAuth`.
5. **Una ruta nueva bajo `/api/db` nace abierta** si nadie llama al guard. La red
   de contención no es la disciplina: es `scripts/test-api-guard.ts`. Y una ruta
   sin política declarada devuelve 403 `SIN_POLITICA` — está roto, que es el
   error correcto.
6. **El JWT tiene dos emisores que derivan claves distintas del mismo secreto**:
   GeneXus hace `Hex.decode(secreto)` antes de firmar; secapi lo usa como UTF-8.
   Los guards prueban las dos derivaciones. Si escribís un tercer verificador con
   una sola, dejás afuera a la mitad de los usuarios según por dónde entraron.
   **Nunca vuelvas a poner un `atob`/`decodeJwt` para autenticar**: así se llegó a
   tener 54 endpoints abiertos.
7. **Cambiar `JWT_SECRET` desloguea a todo el mundo de golpe** (los tokens duran
   7 días). No se hace en el mismo deploy que otro cambio de auth.
8. **`NEXT_PUBLIC_*` lo inlinea Next en el build.** En la app desplegada el valor
   queda horneado en el bundle: cambiar la variable del ambiente no lo mueve.
9. **`PG_ROL_ROOT_ID` con default 52 es el rol Root de TrackMovil**, no el de
   secapi. Aparece en `applyScenarioFilter.ts` y `applyAdmsecGroupRoles.ts`. El
   rol Root se identifica siempre por **nombre + aplicación**, nunca por id.
10. **La producción real (`192.168.7.13`) tiene código viejo y rechaza SSH.** Ahí
    `GET /api/db/usuarios` todavía contesta 200 con el padrón y sin autenticación.
    No asumas que lo que arreglaste en `dev` ya está desplegado.
11. **`accesos.efecto` es inconsistente por historia**: el modal nuevo escribe
    `"grant"`/`"deny"`, pero hay datos legacy con `"ALLOW"`. Se normaliza del lado
    lectura con `EFECTOS_ALLOW` / `EFECTOS_DENY` (`src/lib/permisos.ts`). Escribí
    siempre `grant`/`deny`.
12. **El `env` de pm2 le gana a dotenv.** Una variable declarada en
    `pm2.config.js`, aunque sea vacía, silencia la del `.env`. Eso hizo fallar la
    primera corrida del job con `SIN_USERS_API_KEY`.
13. **`docs/api/openapi.json` se genera, no se edita**: `pnpm docs:api`. Es
    determinista y está versionado; si el diff sale vacío, tu cambio no afectaba
    el contrato.
14. **Orden en el alta de usuario externo**: `assignDespachoOnNewUser()` va
    **antes** de `applyAdmsecGroupRoles()`. Su precondición es `rolesCount = 0`;
    si el otro corre primero, Despacho no se asigna nunca en altas.
15. **ADMSEC no tiene ni nombre ni email ni escenario.** El escenario sale de
    `GXICAGEO.USUMOBILE JOIN AGENCIA JOIN ESCENARIO` vía `lookupAs400Agencia()`
    (`src/lib/auth/clients/as400Client.ts`).
16. **Las políticas ADMIN declaran `accion: "view"` a propósito**, no por pereza:
    en la base sembrada existe una sola `objeto_accion` (`view`) por pantalla. Si
    dejás que el método HTTP mande, cada escritura ADMIN pasa a ser algo que nadie
    puede tener otorgado ni pidiéndolo.
17. **El `README.md` de la raíz está viejo** (habla de Docker y del puerto 3000).
    La verdad operativa está en este archivo, en `pm2.config.js` y en
    `deploy-dev.sh`.
18. **`src/services/api.ts` todavía tiene un `apiLogin` mockeado** con un usuario
    de mentira. No es el login real (ése es `/api/db/login`); no lo tomes como
    referencia.

## Qué no se toca

**Nunca, sin pedido explícito del dueño:**

- **`pm2.config.js`** — está versionado y contiene credenciales reales
  (`DATABASE_URL`, password del AS400, clave de encriptación). No le agregues
  secretos nuevos, no cambies `DATABASE_URL` ni `SYNC_ADMSEC_ESCRIBE`.
- **`.env`, `.env.local`, `.env.production`** — gitignoreados, no existen en
  matrix, y no se crean ni se commitean. La plantilla es `.env.production.example`.
- **`prisma/schema.prisma`** — cambiarlo termina en un `prisma db push` que corre
  contra la base **de producción**.
- **`database/*.sql`**, los scripts de deploy (`deploy*.sh`, `quick-deploy.sh`,
  `setup*.sh`, `fix-*.sh`, `build-and-run.sh`), `Dockerfile*`, `docker-compose*`.
- **`src/proxy.ts`** — es una anti-regla registrada del repo. Su comportamiento
  raro (fail-open, flag de rollout) es deliberado.

**Comandos que NO se corren desde una tarea:** `pnpm prisma:push`,
`pnpm sync:admsec` con `--escribir`, `pnpm bootstrap:root`, cualquier `pnpm seed:*`,
`pnpm import:sgm-prefs`, y todos los `deploy*.sh`. Todos escriben en producción.

**Decisiones de seguridad que no se revierten de paso:**

- No bajar de nivel una ruta en `POLITICAS` (p. ej. de `ROOT` a `AUTENTICADA`).
  Todo lo que puede alterar *quién tiene qué* —asignar roles, ABM de roles,
  accesos directos, funcionalidades, objetos, aplicaciones, el builder de menú—
  está en `ROOT` justamente porque el privilegio ahora vive en una tabla de datos.
  Si una de esas vuelve a `AUTENTICADA`, cualquiera de los 854 usuarios se hace
  root con un PUT.
- No volver a usar `usuarios.es_root` para autorizar, ni reintroducir un
  decodificador de JWT sin verificación de firma.
- No sacar el `alcance` obligatorio de `BotonRoot` ni ponerle un default.

**Higiene del commit:** trabajás en `dev`, nunca en `main`. Commiteá **sólo** los
archivos de tu tarea — nada de `.claude/runs/`, `graphify-out/`, `.next/`,
`tsconfig.tsbuildinfo` ni lockfiles que no cambiaste a propósito. Si `git status`
muestra algo que no tocaste vos, pará y avisá antes de commitear.
