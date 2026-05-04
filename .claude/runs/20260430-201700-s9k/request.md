# Pedido original (vía /feature en Telegram, 2026-04-30 ~20:15 UY)

> /feature analiza todo security suite y todo lo que sea crud en el administrador, que siga apuntando a la api de GeneXus , que use las apis para postgre y llene las tablas correspondientes.... (Revisa antes si me tienes que pedir permiso en casa agente o tu l el orquestador porque no quiero tener que aceptar más quiero que sea automático)

## Interpretación del pedido

El usuario pide analizar **toda** la security suite con foco en los CRUDs del administrador (dashboard) y hacer que **dual-writeen**: cada operación CRUD que hoy va a la API de GeneXus debe TAMBIÉN escribir a las tablas correspondientes de PostgreSQL vía las APIs `/api/db/*`.

### Estado actual del repo (de CLAUDE.md)

Security Suite es una RBAC management UI en Next.js 16 para RíoGas. Tiene **dos backends en paralelo**:

1. **`/api/[...proxy]`** — Proxy dinámico que reenvía a GeneXus/Tomcat (`BACKEND_BASE_URL`). Usado para auth, menu, y operaciones legacy de permisos.
2. **`/api/db/*`** — Endpoints directos a PostgreSQL (Prisma). Modules: `usuarios`, `roles`, `aplicaciones`, `funcionalidades`, `accesos`, `login`.

Los CRUDs del dashboard (`src/app/dashboard/usuarios`, `roles`, `aplicaciones`, etc.) actualmente apuntan al proxy GeneXus.

### Modelos Prisma involucrados (del CLAUDE.md)

`Aplicacion`, `Usuario`, `Rol`, `Funcionalidad`, `Accion`, `FuncionalidadAccion`, `Acceso`, `RolFuncionalidad`, `UsuarioRol`, `UsuarioPreferencia`. Estado `'A' | 'I'`. Asignaciones de roles tienen `fecha_desde`/`fecha_hasta`.

## Acceptance criteria inferidos

1. **Cada operación CRUD del dashboard que hoy hace POST/PUT/PATCH/DELETE al proxy GeneXus debe ALSO** llamar al endpoint `/api/db/<modelo>` correspondiente para reflejar el cambio en PostgreSQL.
2. **GENEXUS sigue siendo el source of truth para reads.** Los reads (GET) siguen apuntando al proxy GeneXus tal como están hoy. NO cambiar la lectura.
3. **Los writes a postgres NO deben bloquear** el flujo principal. Si la escritura a postgres falla pero la de GeneXus pasó, el operador ve éxito en la UI y se loggea el error de postgres para reconciliación posterior.
4. **Tablas afectadas:** `Usuario`, `Rol`, `Aplicacion`, `Funcionalidad`, `Accion`, `Acceso`, `RolFuncionalidad`, `UsuarioRol`, `UsuarioPreferencia`. Los joins (`FuncionalidadAccion`, etc.) también si los CRUDs los tocan.
5. **Logging:** cada dual-write loggea en consola (formato estructurado JSON) si hay divergencia entre el éxito de GeneXus y el de postgres.
6. **Tipos:** los DTOs que hoy se mandan al proxy GeneXus pueden necesitar transformación al schema de Prisma. Si los nombres de campos difieren (ej: GeneXus `usr_id` vs Prisma `Usuario.id`), agregar un mapper.
7. **No romper** ninguna ruta existente. La auth (login), el proxy de menu, y la verificación de permisos siguen idénticas.

## Edge cases a cubrir

- **GeneXus succeed, postgres fail:** loggear, mostrar warning silencioso, NO bloquear UI.
- **GeneXus fail, postgres skip:** comportamiento actual — error UI, no escribimos a postgres tampoco.
- **Concurrencia:** dos operadores editando el mismo registro. Hoy lo resuelve GeneXus; postgres puede divergir momentáneamente — aceptable.
- **Datos legacy:** hay registros en GeneXus que NO existen en postgres todavía. El primer UPDATE/DELETE puede fallar el postgres por record-not-found — usar `upsert` en Prisma para mitigar.
- **Soft-delete:** algunas entidades usan `estado: 'A' | 'I'` en lugar de DELETE físico. Respetar la convención del repo.

## Out of scope

- NO migrar el read path a postgres (eso sería otro /feature)
- NO implementar reverse-sync (postgres → GeneXus). El flujo es one-way: UI escribe a GeneXus + postgres, lee de GeneXus.
- NO cambiar el schema de Prisma (asumimos que ya refleja las tablas que necesitamos — si falta algo, marcarlo en open questions).
- NO agregar tests E2E al GeneXus backend (testear contra mocks del proxy).
- NO cambiar la auth ni el middleware de permisos.

## Open questions (para que el analyst marque si hace falta)

- ¿Las tablas Prisma actuales coinciden 1:1 con los DTOs del proxy GeneXus? (Si difieren, hay que mapear.)
- ¿El equipo quiere alertas por divergencia (ej: monitor que comparé counts diarios) o solo logs? (Asumimos logs en v1.)
- ¿Hay endpoints en `/api/db/*` para TODOS los modelos del CRUD, o falta crearlos para algunos? (Probablemente falta — el alcance crece si hay que crear los endpoints también.)

## Notas para el orquestador

- **Bucket esperado:** large-feature (toca múltiples módulos del dashboard, muchos archivos `services/api.ts`, posibles cambios en `app/api/db/*`).
- **Permisos:** `~/.claude/settings.local.json` del repo ya tiene los allows del pipeline (auto-merged antes del run). NO debería pedir prompts. Si igual aparece un prompt, es un bug del playbook que hay que reportar.
- **El usuario quiere este run AUTOMÁTICO** — sin paradas para preguntas conceptuales del analyst si pueden inferirse del contexto del repo. Solo escalación al humano si hay ambigüedad real (ej: una tabla Prisma no existe).
- **Stack:** Next.js 16 + Prisma + PostgreSQL + GeneXus proxy. pnpm. La UI usa Radix + Tailwind + Framer Motion.
- **Pre-flight ux:** asegurate de correr `pnpm build` (que incluye `prisma generate`) antes de Playwright si toca UI.
- El usuario está siguiendo la conversación por **Telegram (chat_id: 5467882117)**. Mandá updates mid-pipeline.

## Contexto del repo

- **Path:** `C:/Users/jgomez/Documents/Projects/security_suite`
- **Stack:** Next.js 16, TypeScript 5.9, Prisma, PostgreSQL (`192.168.2.117:5432/securitysuite`), GeneXus proxy via `BACKEND_BASE_URL`
- **Manager:** pnpm
- **Servicios:** `src/services/api.ts` (~1800 LOC) — todas las llamadas API
- **Páginas:** `src/app/dashboard/{usuarios,roles,aplicaciones,...}`
- **Endpoints DB:** `src/app/api/db/{usuarios,roles,aplicaciones,funcionalidades,accesos,login}`
- **Endpoints proxy:** `src/app/api/[...proxy]/route.ts`
