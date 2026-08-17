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
- **`verificaFirma`** distingue verificar el JWT de solo decodificarlo. En esta
  app el único lugar que hace `jwt.verify` es `GET /api/db/menu`; todo el resto
  decodifica el payload y resuelve el usuario contra Postgres.
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
      Markdown. El porqué, las decisiones raras, el contexto que el código no dice.
    consumidores:
      - "Quién lo llama: pantalla, app, sistema externo."
    notas:
      - "Advertencias: deudas, comportamientos que muerden."
    ejemplos:
      - lenguaje: curl
        titulo: Caso típico
        codigo: |
          curl -X POST http://localhost:4005/api/db/mi-endpoint \
            -H "Authorization: Bearer $TOKEN" -d '{}'
    auth:
      modo: jwt
      detalle: "Solo si la detección estática se queda corta."
    responses:
      "200": { description: "..." }
```

Todos los campos son opcionales: anotá lo que haga falta y nada más. Si la clave
no matchea ningún endpoint (renombraste la ruta, o hay un typo), la anotación
aparece como **huérfana** en `x-anotaciones.huerfanas` y la página lo avisa
arriba de todo.

`GET /api/docs/spec` agrega en la raíz del documento:

```jsonc
"x-anotaciones": {
  "total": 69,
  "anotados": 3,
  "sinAnotar": ["GET /api/db/accesos", "..."],
  "huerfanas": []
}
```

Ese objeto es la materia prima del test antienvejecimiento de la fase 7 (falla si
aparece un endpoint sin anotar).

## Qué quedó afuera, y por qué

| Qué | Por qué |
|---|---|
| `src/app/api/[...proxy]/route.ts` | Reenvía a GeneXus/Tomcat (`BACKEND_BASE_URL`). Los endpoints del otro lado son de GeneXus: documentar cada uno sería inventar un contrato ajeno que además envejece sin que nos enteremos. Va **una sola entrada**, `/api/{proxy}`, que dice que el proxy existe y a dónde apunta. |
| `src/app/api/test-proxy/route.ts` | Endpoint de diagnóstico del proxy. No es parte del contrato público. |
| `as400-api/` (Express :5000) | Servicio interno con su propio README; solo lo consume `POST /api/db/login` para SGM y LDAP. Fuera de alcance por spec §2. |
| Schemas de request/response | El parser no infiere la forma de los cuerpos: no hay DTOs ni zod en esta app (la validación es manual). Lo que se sabe se escribe en `anotaciones.yaml`. |

La lista de exclusiones vive en `EXCLUIDOS`, arriba de todo en
`scripts/generar-openapi.ts`, y se publica en el propio `openapi.json` bajo
`x-excluidos` con el motivo — para que quien lea el catálogo sepa qué **no** está
mirando.

## Gate de acceso

`src/lib/docs/root-guard.ts` — `requireRoot(request)` y `requireRootPorToken(token)`.

Es root a los efectos de `/docs` quien cumpla una de estas dos:

- `usuarios.es_root = 'S'` (bypass global del motor de permisos), o
- tiene un rol **vigente y activo** al que se le otorgó la funcionalidad `docs`
  de la aplicación 1 (`rol_funcionalidades` → `funcionalidades`).

Es la misma semántica que `POST /api/db/permisos` con
`{ AplicacionId: 1, ObjetoKey: "docs", AccionKey: "view" }`, resuelta contra
Postgres sin salto de red: en SecuritySuite el motor de permisos *es* esta app.

El resultado se cachea por token **5 minutos** si es positivo y **30 segundos**
si es negativo (así un alta de rol se ve enseguida). Los errores no se cachean.
Ante cualquier excepción el guard responde **503 y deniega**: fail-closed. Un
portal que lista qué endpoints están sin autenticación no se abre porque la base
no contestó.

Sumar a alguien es **darle el rol Root de la aplicación**, sin tocar código ni
marcar `es_root`. Ver `scripts/seed-docs-funcionalidad.ts`.

```bash
pnpm test:docs-guard   # 13 casos, sin base ni red (dependencias inyectadas)
```

## Deploy

`openapi.json` y `anotaciones.yaml` se leen del filesystem en runtime, relativos
a `process.cwd()`. PM2 arranca `next start` con `cwd: /var/www/secapi`, así que
alcanza con que el directorio `docs/` viaje con el código. Si falta,
`GET /api/docs/spec` responde **503 `SPEC_NO_GENERADO`** y la página explica cómo
generarlo, en vez de romper.
