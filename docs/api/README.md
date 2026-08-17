# Catálogo de APIs de SecuritySuite

Fuente del portal `/docs` (`/dashboard/docs`), accesible **solo para root**.
Diseño completo en
[`docs/superpowers/specs/2026-08-17-portal-docs-apis-design.md`](../superpowers/specs/2026-08-17-portal-docs-apis-design.md).

```
docs/api/
├── openapi.json      generado por `pnpm docs:api` — NO se edita a mano
├── anotaciones.yaml  escrito a mano: descripciones, consumidores, ejemplos, notas
└── README.md         este archivo
```

`GET /api/docs/spec` devuelve los dos mergeados. **Las anotaciones siempre ganan
sobre lo inferido:** el generador dice lo que el código hace, la anotación dice
el porqué y quién lo llama.

Del lado de la app:

```
src/lib/docs/
├── root-guard.ts    gate solo-root, fail-closed (ver "Gate de acceso")
├── spec.ts          merge de openapi.json + anotaciones.yaml
├── catalogo.ts      el documento mergeado → la estructura que pinta el visor
├── ambiente.ts      host → DEV / PROD
├── try-request.ts   validación y ejecución del "Try it"
└── try-handler.ts   el manejador de POST /api/docs/try (guard + contexto)

src/components/docs/
├── visor-apis.tsx          buscador, filtros, navegación por módulo, lista
├── panel-autenticacion.tsx "Estado de la autenticación"
├── detalle-endpoint.tsx    parámetros, cuerpo, respuestas, errores, ejemplos
├── probador.tsx            el formulario del "Try it" y su confirmación
├── ejemplos.ts             curl / fetch / VB6
├── bloque-codigo.tsx       bloque de código con botón Copiar
├── texto-rico.tsx          `código` y **negrita** inline, sin markdown renderer
├── etiqueta-metodo.tsx     los badges de método y de autenticación
└── usar-ambiente.ts        origen y ambiente reales, leídos del navegador
```

---

## Regenerar

```bash
pnpm docs:api            # reescribe docs/api/openapi.json
pnpm docs:api --check    # no escribe; sale con código 1 si el JSON quedó viejo
```

El generador (`scripts/generar-openapi.ts`) es un **parser estático**: lee
`src/app/api/**/route.ts` como texto. No importa ni ejecuta nada de la app, así
que no necesita base de datos, ni el backend GeneXus, ni el server levantado.

La salida es **determinista** — no hay timestamps ni orden dependiente del
filesystem — y por eso `openapi.json` se versiona en el repo. Si el diff sale
vacío después de tocar código, es que ese cambio no afectaba el contrato.

Regeneralo cada vez que agregues, muevas o borres un `route.ts`, y commiteá el
JSON junto con el cambio.

## Qué infiere el generador

| Campo | De dónde sale |
|---|---|
| `path` | La estructura de carpetas. `src/app/api/db/usuarios/[id]/route.ts` → `/api/db/usuarios/{id}` |
| Métodos | Los `export async function GET\|POST\|PUT\|PATCH\|DELETE\|HEAD\|OPTIONS` del archivo |
| `summary` / `description` | El bloque de comentario inmediatamente anterior al handler; si no tiene, el comentario de cabecera del archivo |
| `parameters` (path) | Los segmentos `[param]` de la ruta |
| `parameters` (query) | Los `searchParams.get("...")` que aparecen en el cuerpo del handler |
| `x-auth` | Lectura estática: `x-api-key`, `extractToken` / `resolveUsuario` / `requireRoot`, `Authorization`, cookie `token`, `jwt.verify` |
| `tags` | El módulo: primer segmento después de `/api` o `/api/db` |

Dos precisiones sobre `x-auth`:

- **`modo: "ninguna"` es un dato real, no un hueco.** Hoy la mayoría de los
  `/api/db/*` de esta app no valida nada — es lo que la spec releva en §3 ("gate
  de APIs: casi ninguno"). Publicar ese inventario es justamente la razón por la
  que el portal es solo-root. Arreglarlo es otro trabajo, no este.
- **`verificaFirma`** distingue verificar el JWT de solo decodificarlo. El único
  endpoint de esta app que hace `jwt.verify` es `GET /api/db/menu`; todo el resto
  decodifica el payload y resuelve el usuario contra Postgres. El otro lugar que
  verifica es el gate de `/docs` (ver más abajo), que no es un endpoint: por eso
  `GET /api/docs/spec` y `POST /api/docs/try` salen con `verificaFirma: false`
  aunque su guard sí verifique. Los dos están anotados a mano con
  `auth: { verificaFirma: true }` justamente para corregir eso.
- `detectadoEn: "archivo"` significa que el token no se lee en el cuerpo del
  handler sino en algún helper del módulo: el dato es correcto pero menos preciso
  que `detectadoEn: "handler"`. Si te importa la precisión, anotalo.

El cuerpo de cada handler se delimita hasta el `export` del handler siguiente
(no hay balanceo de llaves). Un helper declarado *entre* dos handlers cuenta como
parte del anterior: alcanza de sobra para detectar `searchParams` y no se rompe
nunca con una llave dentro de un string.

## Anotar un endpoint nuevo

1. Agregá el handler y corré `pnpm docs:api`.
2. Abrí `docs/api/anotaciones.yaml` y agregá una entrada con la clave exacta
   `"MÉTODO /ruta"` tal como quedó en `openapi.json` (parámetros entre llaves:
   `/api/db/usuarios/{id}`).

```yaml
endpoints:
  "POST /api/db/mi-endpoint":
    summary: Una línea, lo que hace
    description: |
      El porqué, las decisiones raras, el contexto que el código no dice.
      Del formato inline solo se interpretan `código` y **negrita**.
    consumidores:
      - "Quién lo llama: pantalla, app, sistema externo."
    notas:
      - "Advertencias: deudas, comportamientos que muerden."
    parameters:
      - name: estado
        in: query
        required: false
        description: "Se mergea con lo que detectó el parser, campo a campo."
    requestBody:
      requerido: true
      descripcion: "Qué se manda."
      campos:
        - nombre: username
          tipo: string
          requerido: true
          descripcion: "..."
      ejemplo: |
        { "username": "jperez" }
    responses:
      "200": { description: "..." }
    errores:
      - status: 409
        code: YA_EXISTE
        cuando: "Ya hay un usuario con ese username."
    ejemplos:
      - lenguaje: curl
        titulo: Caso típico
        codigo: |
          curl -X POST {{ORIGEN}}/api/db/mi-endpoint \
            -H "Authorization: Bearer $TOKEN" -d '{}'
    auth:
      modo: jwt
      detalle: "Solo si la detección estática se queda corta."
```

Todos los campos son opcionales: anotá lo que haga falta y nada más. Si la clave
no matchea ningún endpoint (renombraste la ruta, o hay un typo), la anotación
aparece como **huérfana** en `x-anotaciones.huerfanas`, la página lo avisa arriba
de todo y `pnpm test:docs-anotaciones` falla.

Tres cosas que conviene saber al escribir una anotación:

- **El host va como `{{ORIGEN}}`.** El visor lo reemplaza por el origen real del
  ambiente en el que está parado el navegador. Un host escrito a mano se copia
  igual y falla en el otro ambiente —o, peor, funciona contra producción sin que
  nadie lo haya querido—. Hay un test que falla si aparece un `http://` que no
  sea el marcador.
- **`consumidores` con "VB6" activa el ejemplo VB6.** El visor genera curl y
  fetch siempre; el de VB6 (`MSXML2.ServerXMLHTTP`, sincrónico, comillas
  duplicadas) aparece solo si algún consumidor lo menciona.
- **`requestBody` y `errores` son la única fuente.** El parser no infiere cuerpos
  —esta app no tiene DTOs ni zod— ni sabe qué errores devuelve de verdad un
  handler. Sin lista de `errores`, el visor cae a las respuestas `>= 400`.

`GET /api/docs/spec` agrega en la raíz del documento:

```jsonc
"x-anotaciones": {
  "total": 70,
  "anotados": 19,
  "sinAnotar": ["GET /api/db/accesos", "..."],
  "huerfanas": []
}
```

## Test antienvejecimiento

```bash
pnpm test:docs-anotaciones
```

`scripts/test-docs-anotaciones.ts` **falla si un endpoint nuevo entra al
repositorio sin entrada en `anotaciones.yaml`**. Los que hoy no están anotados
—hoy 51, el CRUD del RBAC que solo consume el propio panel— están enumerados uno
por uno en la constante `SIN_ANOTAR_ACEPTADOS` de ese archivo. Por eso el test
arranca en verde: solo se queja de lo que se agregue a partir de ahora.

La lista es una deuda declarada, no una alfombra, así que el test también falla
al revés:

| Falla | Qué hacer |
|---|---|
| Endpoint nuevo sin anotar | Anotalo. Si de verdad no lo merece, sumalo a `SIN_ANOTAR_ACEPTADOS` **explicando por qué**. |
| Una excepción ya no existe (ruta renombrada o borrada) | Sacala de la lista. |
| Una excepción **ya está anotada** | Sacala de la lista: solo puede achicarse. |
| Una anotación no matchea ningún endpoint | Typo o renombre en la clave. |
| La lista tiene duplicados o está desordenada | Ordenala alfabéticamente (el diff se lee mejor). |

Anotar es lo que hace que la lista se achique; el test es lo que evita que
vuelva a crecer sin que nadie lo decida.

## Qué se colapsó y qué quedó afuera

Son dos cosas distintas y el documento las publica por separado.

**Colapsado** — está en `paths`, pero como una entrada única en vez de un
handler por método (`x-colapsados` en `openapi.json`, lista `COLAPSADOS` en el
generador):

| Qué | Por qué |
|---|---|
| `src/app/api/[...proxy]/route.ts` → `/api/{proxy}` | Reenvía a GeneXus/Tomcat (`BACKEND_BASE_URL`). Los endpoints del otro lado son de GeneXus: documentar cada uno sería inventar un contrato ajeno que además envejece sin que nos enteremos. La entrada dice que el proxy existe y a dónde apunta. |

**Excluido** — no aparece en el documento, en ninguna forma (`x-excluidos` en
`openapi.json`, lista `EXCLUIDOS` en el generador):

| Qué | Por qué |
|---|---|
| `src/app/api/test-proxy/route.ts` | Endpoint de diagnóstico del proxy. No es parte del contrato público. |
| `as400-api/` (Express :5000) | Servicio interno con su propio README; solo lo consume `POST /api/db/login` para SGM y LDAP. Fuera de alcance por spec §2. |
| Schemas de request/response | El parser no infiere la forma de los cuerpos: no hay DTOs ni zod en esta app (la validación es manual). Lo que se sabe se escribe en `anotaciones.yaml`. |

Las dos listas viven arriba de todo en `scripts/generar-openapi.ts` y se publican
con su motivo en el propio `openapi.json` — para que quien lea el catálogo sepa
qué **no** está mirando y en qué sentido.

## Gate de acceso

`src/lib/docs/root-guard.ts` — `requireRoot(request)` y `requireRootPorToken(token)`.

### Requisito: `JWT_SECRET` seteada con un secreto real

**Sin esto, `/docs` no abre.** El guard responde `503 SECRETO_NO_CONFIGURADO`
—y deja el motivo en el log del proceso— cuando `JWT_SECRET` no está seteada, o
cuando su valor es el que quedó como *default en el código* (el
`process.env.JWT_SECRET || "..."` de `src/lib/auth/responses.ts` y de
`src/app/api/db/menu/route.ts`).

El porqué:

1. **El resto de la app no verifica el JWT.** `decodeJwt` (`src/lib/permisos.ts`)
   hace base64 del payload y ni mira `exp`. Cualquiera que arme
   `Bearer <header>.<base64 de {"username":"dmedaglia"}>.<lo que sea>` pasa por
   root en los endpoints que resuelven el usuario así. Un portal que publica qué
   endpoints están sin autenticación no se puede apoyar en eso, así que el guard
   de `/docs` hace `jwt.verify` (firma **y** vencimiento) antes de tocar la base.
2. **Verificar contra un secreto conocido no prueba nada.** Si el secreto es el
   default del código, cualquiera que pueda leer el repositorio firma un token
   válido para el usuario que quiera y la verificación queda de adorno. Por eso
   el guard es *fail-closed ante mala configuración*: prefiere no abrir a abrir
   con una verificación decorativa.

Qué hay que hacer, entonces:

- Setear `JWT_SECRET` en el ambiente de secapi (`.env.local` en desarrollo, el
  bloque `env` de `pm2.config.js` o el `.env` del server en producción) con un
  valor aleatorio largo. Hoy no está seteada en ningún lado: los tokens de
  producción se están firmando con el default.
- **Tiene que ser el mismo valor con el que secapi firma**, porque secapi es
  quien emite los JWT de las tres aplicaciones (`POST /api/db/login`) y el guard
  verifica con `process.env.JWT_SECRET` del propio proceso. Si `/docs` de GOYA o
  de TrackMovil también verifica la firma, esas apps necesitan el mismo valor.
- Ojo al cambiarla en un ambiente que ya está andando: **invalida los tokens
  emitidos con el secreto anterior**. `GET /api/db/menu` (el otro `jwt.verify`
  de la app) deja de gatear por usuario y los `/docs` dejan de aceptar tokens
  viejos hasta que la gente vuelva a loguearse. Conviene hacerlo en una ventana
  donde el re-login no moleste.

El chequeo compara el **SHA-256** del valor configurado contra el digest del
default: así el secreto de compromiso no vuelve a quedar escrito en claro en
ningún archivo nuevo. `pnpm test` lee el literal del propio código y verifica que
el digest le siga correspondiendo, así que si alguien cambia el default el test
falla en vez de que el chequeo quede mudo.

### Quién entra

Es root a los efectos de `/docs` quien cumpla una de estas dos:

- `usuarios.es_root = 'S'` (bypass global del motor de permisos), o
- tiene un rol **vigente y activo** al que se le otorgó la funcionalidad `docs`
  de la aplicación 1, con la funcionalidad **activa, vigente y `solo_root='N'`**
  (`rol_funcionalidades` → `funcionalidades`).

Es la semántica de `POST /api/db/permisos` con
`{ AplicacionId: 1, ObjetoKey: "docs", AccionKey: "view" }`, resuelta contra
Postgres sin salto de red: en SecuritySuite el motor de permisos *es* esta app.
Con dos diferencias a conciencia, porque `docs` se sembró para que no hagan
falta: no se miran los `accesos` directos por usuario ni `es_publico`. Si algún
día `docs` se concede por acceso directo, hay que sumarlo al guard.

El resultado se cachea **5 minutos** si es positivo y **30 segundos** si es
negativo (así un alta de rol se ve enseguida), con el **SHA-256 del token** como
clave: el JWT no queda en memoria en claro. La firma y el vencimiento se
verifican en **cada** request, antes del cache — si no, un token vencido seguiría
entrando hasta cinco minutos después de haber vencido.

Los 5xx no se cachean. Ante cualquier excepción el guard responde **503 y
deniega**: fail-closed. Un portal que lista qué endpoints están sin autenticación
no se abre porque la base no contestó.

Códigos de denegación: `SIN_TOKEN`, `TOKEN_INVALIDO`, `TOKEN_VENCIDO` (401);
`USUARIO_NO_ENCONTRADO`, `NO_ROOT` (403); `SECRETO_NO_CONFIGURADO`, `ERROR_GUARD`
(503).

Sumar a alguien es **darle el rol Root de la aplicación**, sin tocar código ni
marcar `es_root`. Ver `scripts/seed-docs-funcionalidad.ts`.

```bash
pnpm test                    # los cuatro, punto de entrada estándar
pnpm test:docs-guard         # 24 casos — el gate solo-root
pnpm test:docs-try           # 33 casos — el ejecutor del "Try it"
pnpm test:docs-catalogo      # 25 casos — catálogo, ambiente y ejemplos
pnpm test:docs-anotaciones   #  6 casos — antienvejecimiento del catálogo
```

Ninguno toca la base ni la red: las dependencias se inyectan.

## Ejecutar una llamada — `POST /api/docs/try`

El "Try it" del portal. Ejecuta, **del lado del servidor** y con la sesión del
root que está mirando la pantalla, una llamada contra una API de esta misma
aplicación, y devuelve `{ status, statusText, headers, body, duracionMs,
truncado }`. Pasa por el mismo `requireRoot` que `GET /api/docs/spec`.

El cuerpo es `{ payload }`, donde `payload` es el **base64 de un JSON**
`{ metodo, path, query?, headers?, body?, confirmacion? }`.

**Codificarlo no es ofuscación: es transporte.** El WAF de nginx de TrackMovil
inspecciona el cuerpo del request entrante y devuelve 403 ante sintaxis de shell
—justo lo que tiene un ejemplo de `curl` pegado en el formulario—. El contrato es
idéntico en las tres aplicaciones.

Las reglas, todas en `src/lib/docs/try-request.ts`:

| Regla | Detalle |
|---|---|
| Solo el propio host | El origen lo pone el servidor; la ruta no puede cambiarlo. |
| Solo bajo `/api/` | Cualquier otro prefijo → 400 `RUTA_FUERA_DE_API`. |
| **Nunca un proxy abierto** | URL absoluta, `//host`, backslash → 400 `RUTA_ABSOLUTA`. `..`, `%2e`, `%2f`, `%5c` → 400 `RUTA_CON_TRAVERSAL`. |
| No se llama a sí mismo | `/api/docs/try` como destino → 400 `RECURSION_NO_PERMITIDA`. |
| Escrituras confirmadas | `POST`/`PUT`/`PATCH`/`DELETE` exigen `confirmacion` **igual al path exacto**; si no, 428 `CONFIRMACION_REQUERIDA`. El diálogo de la UI es la cortesía; el 428 es la regla. |
| La sesión la pone el servidor | `authorization` y `cookie` salen del root logueado. Los que mande el cliente se descartan (junto con `host`, `content-length`, `x-forwarded-*`, `origin`…) y se informan en el header `x-docs-try-headers-descartados`. |
| Límites | Timeout 30 s (504 `TIMEOUT`), cuerpo truncado a 1 MB (`truncado: true`). |

El `status` que viene adentro de la respuesta es el del endpoint probado: un 500
de la API probada es un resultado, no un error de este endpoint.

`DOCS_TRY_ORIGEN` (opcional) fija el origen contra el que se ejecuta, para el
caso en que el header `Host` que llega no sea de fiar. Sin ella, se usa el origen
del propio request.

### El ambiente que muestra la UI

Se deriva del host: si contiene `dev` es **DEV**, si no se trata como **PROD** y
el diálogo de confirmación sale en rojo. `localhost` cae en PROD a propósito: el
error caro es mostrar DEV cuando en realidad es producción; mostrar PROD de más
solo agrega una confirmación que igual se iba a escribir.

## Deploy

`openapi.json` y `anotaciones.yaml` se leen del filesystem en runtime, relativos
a `process.cwd()`. PM2 arranca `next start` con `cwd: /var/www/secapi`, así que
alcanza con que el directorio `docs/` viaje con el código. Si falta,
`GET /api/docs/spec` responde **503 `SPEC_NO_GENERADO`** y la página explica cómo
generarlo, en vez de romper.
