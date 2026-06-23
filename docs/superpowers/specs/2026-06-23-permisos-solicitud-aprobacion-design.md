# Diseño: Flujo de solicitud y aprobación de permisos (Postgres)

- **Fecha:** 2026-06-23
- **Proyecto:** security_suite (`secapi` / `secapi-dev`)
- **Estado:** Aprobado para planificación

## 1. Contexto y problema

La validación de permisos **ya está migrada a Postgres**: `apiValidarPermiso()`
(frontend, `src/services/api.ts`) hace `POST /api/db/permisos`, que evalúa contra
Prisma la cadena `Objeto → ObjetoAccion → FuncionalidadObjetoAccion → Funcionalidad
→ Acceso (directo) / RolFuncionalidad (vía rol)`. El endpoint GeneXus original
(`https://sgm.glp.riogas.com.uy/servicios/SecuritySuite/Permisos`) sigue referenciado
en el middleware `src/proxy.ts` vía `PERMISOS_API_URL`, pero `/dashboard` está en
`PUBLIC_PREFIXES`, por lo que el guard de ruta está **bypasseado** hoy.

Falta el ciclo de vida de **autoservicio de permisos**: cuando a un usuario se le
niega el acceso a una pantalla/feature, debe poder **solicitarlo**; el sistema
**auto-crea el objeto** si no existe; un administrador **asocia el objeto a una
funcionalidad** y **aprueba o rechaza**; al aprobar se le **concede el acceso
directo** al usuario. Todo gestionado desde un **panel de aprobación**.

## 2. Decisiones de diseño (acordadas)

1. **Disparador de la solicitud:** explícito. El check DENIED redirige a
   `/no-autorizado`, donde el usuario hace clic en "Solicitar acceso".
2. **Gating de aprobadores:** funcionalidad asignable (no `esRoot` rígido). Root
   siempre puede; además quien tenga la funcionalidad designada.
3. **Qué concede la aprobación:** `Acceso` directo (efecto grant) sobre la
   funcionalidad, igual que el modal "Asignar Funcionalidades".
4. **Alcance del check:** además del flujo de solicitudes, se cablea el middleware
   a `/api/db/permisos` retirando la dependencia de GeneXus (con flag de rollout).
5. **Panel:** al aprobar, el admin puede **elegir o crear** la funcionalidad en el
   momento (no es un paso separado obligatorio).
6. **Notificaciones:** fuera de alcance v1 (Telegram/email quedan para fase posterior).

## 3. Modelo de datos

### Nueva tabla `solicitudes_permiso`

```prisma
model SolicitudPermiso {
  id                   Int       @id @default(autoincrement())
  usuarioId            Int       @map("usuario_id")
  aplicacionId         Int       @map("aplicacion_id")
  objetoId             Int       @map("objeto_id")
  objetoAccionId       Int?      @map("objeto_accion_id")
  accionKey            String    @map("accion_key") @db.VarChar(60)   // "view", "execute"...
  estado               String    @default("PENDIENTE") @db.VarChar(20) // PENDIENTE | APROBADA | RECHAZADA | CANCELADA
  motivoSolicitud      String?   @map("motivo_solicitud")
  rutaSolicitada       String?   @map("ruta_solicitada") @db.VarChar(255)
  accionCodigo         String?   @map("accion_codigo") @db.VarChar(20) // hash XXXX-XXXX
  // Resolución / auditoría
  funcionalidadId      Int?      @map("funcionalidad_id")
  resueltaPor          Int?      @map("resuelta_por")
  fechaResolucion      DateTime? @map("fecha_resolucion") @db.Timestamp(6)
  comentarioResolucion String?   @map("comentario_resolucion")
  fechaCreacion        DateTime  @default(now()) @map("fecha_creacion") @db.Timestamp(6)

  usuario       Usuario        @relation(fields: [usuarioId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  aplicacion    Aplicacion     @relation(fields: [aplicacionId], references: [id], onUpdate: NoAction)
  objeto        Objeto         @relation(fields: [objetoId], references: [id], onUpdate: NoAction)
  funcionalidad Funcionalidad? @relation(fields: [funcionalidadId], references: [id], onUpdate: NoAction)

  @@index([estado], map: "idx_solicitudes_permiso_estado")
  @@index([usuarioId], map: "idx_solicitudes_permiso_usuario")
  @@index([objetoId], map: "idx_solicitudes_permiso_objeto")
  @@map("solicitudes_permiso")
}
```

Relaciones inversas a agregar: `Usuario.solicitudes`, `Aplicacion.solicitudes`,
`Objeto.solicitudes`, `Funcionalidad.solicitudes`.

Se aplica con `pnpm prisma:push` (mismo flujo que usa el proyecto; no hay carpeta
de migraciones versionadas).

### Reglas

- **Dedupe:** no se persiste estado extra. Antes de crear, se busca una solicitud
  `PENDIENTE` para `(usuarioId, objetoId, accionKey)`; si existe, se reutiliza.
- **"Requiere vincular funcionalidad":** estado **derivado**, no persistido. Una
  solicitud `PENDIENTE` cuyo objeto+acción aún no tiene fila en
  `FuncionalidadObjetoAccion` se muestra en el panel como *"requiere vínculo"* y no
  es aprobable hasta elegir/crear la funcionalidad. Fuente de verdad única = la
  tabla de vínculo.

## 4. Endpoints (Postgres/Prisma, bajo `/api/db/solicitudes`)

Autenticación: JWT en `Authorization: Bearer <token>` (o cookie `token`), igual que
`/api/db/permisos`.

### `POST /api/db/solicitudes` — crear solicitud (+ auto-crear objeto)

**Contrato PascalCase**, idéntico al de `/api/db/permisos` / GeneXus (la otra app ya
envía estos campos al check de permisos; así reutiliza el mismo payload). Acepta
`AplicacionId` (número) y, por tolerancia, `aplicacion` (nombre).

Body:
```json
{
  "AplicacionId": 3,
  "ObjetoKey": "clientes",
  "ObjetoTipo": "PAGE",
  "AccionKey": "view",
  "AccionCodigo": "3GOA-IBCT",
  "ObjetoPath": "/clientes",
  "Motivo": "Necesito ver la ficha de clientes para soporte"
}
```
Lógica:
1. Resolver usuario del JWT (activo). 401 si no hay token / usuario.
2. Resolver aplicación: `AplicacionId` (número) o `aplicacion` (nombre); default
   `NEXT_PUBLIC_APLICACION_ID`/`APLICACION_ID`.
3. **Resolver o auto-crear el `Objeto`** por `(aplicacionId, ObjetoKey, ObjetoTipo)`:
   si no existe → crear con `tipo` (default `PAGE`), `label = ObjetoKey`,
   `path = ObjetoPath`, `estado = "A"`, `esPublico = "N"`, `orden = 0`.
4. Buscar `ObjetoAccion` por `AccionKey`/`AccionCodigo` (opcional → `objetoAccionId` puede quedar null).
5. **Dedupe:** si hay `PENDIENTE` para `(usuario, objeto, AccionKey)` → devolverla (`reused: true`).
6. Crear `SolicitudPermiso` `PENDIENTE`.

Respuesta: `{ success: true, solicitud: {...}, objetoCreado: boolean, reused: boolean }`.

### `GET /api/db/solicitudes?estado=&search=&page=&pageSize=` — listar (panel, gated)

Devuelve solicitudes con `usuario`, `objeto`, `accion`, y
`funcionalidadesCandidatas` (las ya vinculadas al objeto+acción) + `requiereVinculo: boolean`.

### `GET /api/db/solicitudes/mias` — solicitudes del usuario actual

Para que el solicitante vea el estado de lo que pidió.

### `POST /api/db/solicitudes/[id]/aprobar` — aprobar (gated)

Body:
```json
{ "funcionalidadId": 12, "fechaDesde": null, "fechaHasta": null, "comentario": "OK soporte" }
```
**Transacción:**
1. Validar solicitud `PENDIENTE` y `funcionalidadId` activa.
2. Asegurar vínculo `FuncionalidadObjetoAccion` para `(funcionalidad, objeto, objetoAccion)` (crear si falta).
3. **Upsert `Acceso`** `(usuarioId, funcionalidadId)` con `efecto = "grant"`, `fechaDesde`, `fechaHasta`.
4. Marcar solicitud `APROBADA` con `resueltaPor`, `fechaResolucion`, `funcionalidadId`, `comentarioResolucion`.

Respuesta: `{ success: true, solicitud, accesoCreado: true }`.

### `POST /api/db/solicitudes/[id]/rechazar` — rechazar (gated)

Body `{ "comentario": "..." }` → `RECHAZADA`, sin crear acceso.

### Gating (defensa en profundidad)

Helper `assertPuedeAprobar(usuario)`: `esRoot === "S"` **o** el usuario tiene acceso
(directo o vía rol) a la funcionalidad designada como aprobadora — identificada por
objeto `key = "solicitudes"` + acción `key = "approve"`. Se valida en `GET` (panel),
`aprobar` y `rechazar`. Si falla → 403.

## 5. Frontend

- **`/no-autorizado`** (`src/app/no-autorizado/`): bloque "Solicitar acceso" con
  textarea de motivo opcional. Toma `code`/`ruta`/`nombre` (ya disponibles por query
  desde el redirect del middleware) → `POST /api/db/solicitudes`. Si ya hay pendiente,
  muestra "Ya solicitaste acceso (pendiente)". (Componente cliente nuevo junto a los
  existentes `CopyClipboard`/`CurrentDateTime`.)
- **`/dashboard/solicitudes`** (panel nuevo): `DataTable` con filtro por estado y
  `BadgeEstado` (Pendiente / Requiere vínculo / Aprobada / Rechazada). Fila → `ModalShell`
  de revisión: datos del usuario + recurso pedido + selector de funcionalidad
  (elegir existente **o** crear+vincular en el momento) + fechas opcionales → botones
  **Aprobar** / **Rechazar** con comentario. Reusa `DataTable`, `ModalShell`,
  `BadgeEstado` (cuidando el patrón de `Select` con sentinel, nunca `value=""`, y el
  `max-h` en vh para listas scrollables dentro de modales).
- **Sidebar/menú:** agregar `solicitudes` al `FUNCIONALIDAD_ROUTE_MAP` en
  `src/app/api/db/menu/route.ts` (icono `inbox`), visible solo con la funcionalidad
  aprobadora.
- **`src/services/api.ts`:** wrappers `apiCrearSolicitud`, `apiListarSolicitudes`,
  `apiMisSolicitudes`, `apiAprobarSolicitud`, `apiRechazarSolicitud`.

## 6. Middleware + corrección de `efecto`

- **`src/proxy.ts`:** `PERMISOS_API_URL` apunta al endpoint interno
  (`${request.nextUrl.origin}/api/db/permisos`), retirando GeneXus. **Rollout con flag**
  `PERMISOS_ENFORCE` (default off): mientras off, mantiene el comportamiento actual
  (no rompe `/dashboard`); cuando esté seedeado se prende y empieza a redirigir a
  `/no-autorizado` en DENIED. Root siempre pasa. El body que arma el middleware ya
  coincide con lo que espera `/api/db/permisos` (`AplicacionId`, `ObjetoKey`,
  `ObjetoTipo`, `AccionKey`, `AccionCodigo`, `ObjetoPath`); ajustar el parseo de la
  respuesta a `{ permitido: "GRANTED" }`.
- **Drop-in del check:** `/api/db/permisos` hoy lee `aplicacion` (nombre), pero la
  otra app y el middleware envían `AplicacionId` (número). Para ser reemplazo directo
  del contrato GeneXus, el endpoint debe aceptar **`AplicacionId` (número)** además de
  `aplicacion` (nombre). Esto se ajusta en fase 1 junto al fix de `efecto`.
- **Bug de `efecto` (corregir de paso):** el check (`/api/db/permisos` y
  `menu/route.ts`) lee `efecto: "ALLOW"`, pero el modal "Asignar Funcionalidades" y
  `usuarios/[id]/accesos` guardan `"grant"/"deny"`. Hoy un grant directo **no lo
  honra el check**. Se normaliza el lado lectura para aceptar `{ ALLOW, grant }`
  (allow) y `{ DENY, deny }` (deny); el flujo nuevo escribe `"grant"`.

## 7. Implementación por fases

1. **Datos + API:** modelo Prisma + `prisma:push`; endpoints de solicitud, listado,
   aprobar, rechazar, mias; helper de gating; fix de `efecto`.
2. **Frontend:** `/no-autorizado` (solicitar) + panel `/dashboard/solicitudes` +
   entrada de sidebar + wrappers en `api.ts`.
3. **Enforcement:** cablear `proxy.ts` con flag `PERMISOS_ENFORCE` + seed de la
   funcionalidad/objeto aprobador (`solicitudes` / acción `approve`).

## 8. Contrato para la otra app (curls)

> La **creación del objeto cuando no existe es automática** dentro de
> `POST /api/db/solicitudes` (paso 3). La otra app **no** necesita crear el objeto
> aparte: con llamar a solicitudes alcanza. Se incluye igualmente el curl directo de
> objeto por completitud.

### Crear solicitud (auto-crea el objeto si falta) — el que usa la otra app

```bash
curl -i -X POST 'https://secapi-dev.glp.riogas.com.uy/api/db/solicitudes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TU_TOKEN_JWT' \
  -d '{
    "AplicacionId": 3,
    "ObjetoKey": "clientes",
    "ObjetoTipo": "PAGE",
    "AccionKey": "view",
    "AccionCodigo": "3GOA-IBCT",
    "ObjetoPath": "/clientes",
    "Motivo": "Necesito acceso a la pantalla de clientes"
  }'
```

### (Opcional) Crear el objeto directamente — endpoint ya existente

```bash
curl -i -X POST 'https://secapi-dev.glp.riogas.com.uy/api/db/objetos' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TU_TOKEN_JWT' \
  -d '{
    "aplicacionId": 3,
    "tipo": "PAGE",
    "key": "clientes",
    "label": "Clientes",
    "path": "/clientes",
    "esPublico": "N",
    "estado": "A"
  }'
```

### Verificar permiso (ya existe; reemplaza al GeneXus original)

```bash
curl -i -X POST 'https://secapi-dev.glp.riogas.com.uy/api/db/permisos' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TU_TOKEN_JWT' \
  -d '{
    "aplicacion": "RiogasTracking",
    "ObjetoKey": "clientes",
    "ObjetoTipo": "PAGE",
    "AccionKey": "view",
    "AccionCodigo": "3GOA-IBCT"
  }'
# Respuesta: { "permitido": "GRANTED" | "DENIED", "razon": "...", ... }
```

> Nota: las URLs públicas son `https://secapi-dev.glp.riogas.com.uy` (dev) /
> `https://sgm.glp.riogas.com.uy` según el deploy. Confirmar el host de la app de
> seguridad antes de entregar el contrato final.
