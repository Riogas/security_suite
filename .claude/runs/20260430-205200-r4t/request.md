# Pedido original (vía /feature en Telegram, 2026-04-30 ~20:52 UY)

> /feature revisa todos los paneles modales pantallas que tenga security suite y ve que todo esté llamando y cargando información de la base de postgre por las dudas

## Interpretación del pedido

El usuario quiere una **auditoría completa de los reads** en la UI: cada panel/modal/pantalla del dashboard debe estar **consumiendo data desde PostgreSQL** (vía `/api/db/*`), NO desde el proxy GeneXus.

Esto es complementario al run anterior (`20260430-201700-s9k`) que verificó dual-write en escrituras. Este verifica los reads.

## Contexto del repo

(igual que el run previo, ver `20260430-201700-s9k/request.md` para detalle completo)

- **Path:** `C:/Users/jgomez/Documents/Projects/security_suite`
- **Stack:** Next.js 16 + Prisma + PostgreSQL + GeneXus proxy
- **Endpoints DB Prisma:** `src/app/api/db/{usuarios,roles,aplicaciones,funcionalidades,accesos,login}`
- **Endpoints proxy GeneXus:** `src/app/api/[...proxy]/route.ts`
- **Páginas:** `src/app/dashboard/{usuarios,roles,aplicaciones,...}`
- **Components dashboard:** `src/components/dashboard/**`
- **Service layer:** `src/services/api.ts` (~1800 LOC)

## Acceptance criteria inferidos

1. **Listar TODOS los paneles, modales y pantallas** del dashboard (estructura `src/app/dashboard/**` + `src/components/dashboard/**`).
2. **Para cada uno**, identificar QUÉ data carga (qué endpoint llama).
3. **Marcar dónde lee de GeneXus vs dónde lee de Prisma:**
   - Reads vía proxy GeneXus → archivos `services/api.ts` que llaman al proxy
   - Reads vía Prisma → archivos que llaman a `/api/db/*`
4. **Para cada read que va a GeneXus**, evaluar:
   - ¿Existe el endpoint equivalente en `/api/db/*`?
   - ¿La data está disponible en las tablas de Prisma?
   - ¿Por qué se está leyendo de GeneXus en lugar de Prisma?
5. **Plan de migración del read** donde aplique:
   - Si hay endpoint Prisma equivalente → migrar la llamada en services/api.ts
   - Si NO existe endpoint Prisma → crear el endpoint en `/api/db/<modelo>`
   - Si la data NO está en Prisma todavía → marcarlo como gap (out of scope, requiere migración de datos)
6. **NO romper** ninguna funcionalidad. Cada migración tiene que mantener la misma forma del response (campos, tipos, estructura) — la UI no debería notar el cambio.
7. **Auth y middleware de permisos siguen idénticos** (esos consultan GeneXus por diseño).
8. **Tests:** correr la suite existente. Si no hay tests para los reads migrados, agregar mínimos (que verifiquen que el endpoint /api/db/X devuelve la forma esperada).

## Edge cases a cubrir

- **Páginas con loading parcial:** algunas pantallas hacen 3-4 calls en paralelo. Si una migra a Prisma y otras quedan en GeneXus, el orden/timing puede cambiar. Revisar.
- **Datos derivados:** si una pantalla calcula algo a partir de campos que existen en GeneXus pero no en Prisma todavía (ej: un campo computado server-side), eso es un gap real.
- **Joins:** GeneXus probablemente devuelve responses con joins ya hechos (ej: usuario con sus roles). Prisma puede requerir `include` explícito. Cuidar que la forma del response sea la misma.
- **Paginación, filtros, ordering:** algunas vistas tienen filtros server-side. Hay que replicar la lógica en los queries de Prisma.
- **Performance:** Prisma local debería ser MÁS rápido que el proxy GeneXus en la mayoría de casos. Si algún query Prisma es N+1 vs un endpoint GeneXus optimizado, marcarlo.

## Out of scope

- NO migrar la auth (login va contra GeneXus por diseño).
- NO migrar el middleware de permisos (`src/proxy.ts`) — ese consulta `NEXT_PUBLIC_PERMISOS_API_URL` que va a GeneXus.
- NO crear tablas Prisma nuevas si la data no existe — eso es out of scope (requiere DBA + migración).
- NO cambiar la UI ni componentes visuales — solo el origen de datos.
- NO tocar el dual-write del run anterior — esto es solo reads.

## Open questions (para que el analyst marque si hay ambigüedad)

- ¿La intención es **migrar todos los reads** a Prisma de una sola vez, o **identificar gaps + migrar los que ya tienen endpoint** y dejar los demás para fases futuras? **Default razonable:** migrar los que ya tienen endpoint Prisma equivalente; reportar los gaps sin tocarlos.
- ¿Cuándo un read VA A GeneXus y se migra a Prisma, qué pasa si Prisma devuelve diferente? **Default razonable:** prefiri Prisma, loggear discrepancia. Si la UI rompe, revertir.

## Notas para el orquestador

- **Bucket esperado:** large-feature (auditoría exhaustiva de muchas pantallas + posibles cambios en services/api.ts + posibles endpoints nuevos en /api/db/).
- **Permisos:** ya están listos — `bypassPermissions` global ahora, settings.local.json del repo merge-ado en run anterior. Cero prompts.
- **Pre-flight ux-validator:** `pnpm build` (incluye prisma generate) antes de Playwright. La UI tiene que verse igual después de la migración.
- **El usuario está en Telegram (chat_id: 5467882117).** Updates mid-pipeline esperados.
- **Run relacionado:** `20260430-201700-s9k` (dual-write writes, branch `dev`). Este run debería trabajar sobre la misma branch — si hay cambios pendientes de mergear a `main`, considerarlos parte del baseline.
- **Estilo de output:** el usuario aprecia hallazgos accionables ordenados por importancia. Si encontrás 5 pantallas con reads via GeneXus y 3 ya tienen endpoint Prisma listo → migrá esas 3, listá las 2 restantes como gaps en el resumen final.
