# Orígenes externos de usuarios e importación comparada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el filtro de usuarios de secapi —donde hoy `Locales (DB)` y `Todos (DB)` ejecutan la misma consulta— por tres orígenes externos reales (SGM, LDAP, ADMSEC/GSIST), y la importación masiva de texto libre por una pantalla que compara lo que hay contra lo que falta antes de escribir nada.

**Architecture:** Una capa de fuentes con interfaz común (`ExternalUserSource`) aísla de dónde salen los usuarios externos; el `as400-api` gana tres endpoints de enumeración read-only detrás de api-key; secapi cruza esa lista contra su Postgres con una función pura y sirve el resultado clasificado y paginado; el import solo crea, nunca actualiza.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5.9, Prisma sobre PostgreSQL, Radix UI + Tailwind, pnpm. En `as400-api`: Express + node-jt400 sobre DB2/AS400. Tests: scripts `tsx` con aserciones propias (el repo no tiene runner).

**Spec:** `docs/superpowers/specs/2026-08-17-usuarios-origenes-externos-design.md`

## Global Constraints

- **Rama de trabajo: `dev`.** Nunca commitear a `main`.
- 🔴 **No tocar NADA de `as400-api/` hasta que el trabajo de `/api/ficha` esté commiteado y pusheado** (spec §10.2). Las tareas 1 y 2 no lo tocan; la tarea 3 es el gate. Verificar con `git status as400-api/` limpio antes de empezar la tarea 3.
- **Package manager: `pnpm`**, nunca npm ni yarn.
- **Sin dependencias nuevas.** Los tests son scripts `tsx` con aserciones propias, siguiendo `scripts/test-docs-root-guard.ts`.
- **Íconos: `lucide-react`.** Cero emoji como íconos en la UI (preferencia explícita del usuario).
- **Comentarios y textos de UI en español**, como todo el repo.
- `desdeSistema` acepta `'SGM' | 'LDAP' | 'GSIST' | 'LOCAL'`. Es `VarChar(10)`, **no** `Char(1)`.
- El match de usernames es **case-insensitive con trim**; al crear se escribe **en minúsculas**.
- Los usuarios importados se crean con `password: ""`.
- El import **solo crea**. Si el username ya existe → `omitido`. Nunca hace update.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/usuarios/tipos.ts` | Tipos compartidos: `OrigenExterno`, `ExternalUser`, `EstadoComparacion`, `ExternalUserComparado`, `UsuarioLocalMinimo`, `ResumenComparacion` |
| `src/lib/usuarios/comparar.ts` | Función pura de cruce externo↔local. El corazón, y lo que cubren los tests |
| `src/lib/usuarios/cuentasSistema.ts` | Heurística de cuenta de sistema |
| `src/lib/usuarios/sources/mapeo.ts` | Filas crudas del AS400 → `ExternalUser` (puro) |
| `src/lib/usuarios/sources/as400Users.ts` | Cliente HTTP de los `/api/users/*` del `as400-api` |
| `src/lib/usuarios/sources/index.ts` | Las tres `ExternalUserSource` y el switch ADMSEC↔AD |
| `src/app/api/db/usuarios/externos/route.ts` | `GET` — lista comparada y paginada |
| `src/app/api/db/usuarios/importar/route.ts` | `POST` — alta masiva, con `dryRun` |
| `src/app/dashboard/usuarios/importar/page.tsx` | Pantalla del wizard |
| `src/components/dashboard/usuarios/importar/PasoOrigen.tsx` | Paso 1: cards de origen, filtros, switches |
| `src/components/dashboard/usuarios/importar/PasoComparacion.tsx` | Paso 2: grilla comparativa y selección |
| `src/components/dashboard/usuarios/importar/ResultadoImport.tsx` | Panel de resultado (rescatado de `SyncUsuariosModal`) |
| `src/components/dashboard/usuarios/importar/badges.tsx` | Badges de estado de comparación y de origen |
| `scripts/test-usuarios-comparacion.ts` | Tests del clasificador y del mapeo |
| `as400-api/src/routes/users.js` | Los tres endpoints de enumeración |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `package.json` | Script `test:usuarios-comparacion` |
| `src/services/api.ts` | Wrappers nuevos; se comentan `apiSyncUsuarios` y `apiImportarUsuario` |
| `src/components/dashboard/usuarios/Usuarios.tsx` | Combo nuevo, columna Origen, botón Importar por fila |
| `src/app/dashboard/usuarios/page.tsx` | Sacar `SyncUsuariosModal`, botón a la pantalla nueva |
| `src/lib/auth/resolveCredentials.ts` | Backfill de nombre/email en la rama LDAP |
| `as400-api/server.js` | Montar `/api/users` |
| `as400-api/src/middleware/apiKey.js` | Parametrizar el nombre de la env var |
| `as400-api/.env` + `.env.local` de secapi | `USERS_API_KEY`, `AS400_API_URL` |

**Se borran:**

| Archivo | Motivo |
|---|---|
| `src/app/api/db/usuarios/sync/route.ts` | Reemplazado; con él se va el bug de `desdeSistema` |
| `src/components/dashboard/usuarios/SyncUsuariosModal.tsx` | Reemplazado por la pantalla |

---

## Task 1: Tipos y clasificador de comparación

El corazón del feature y lo único con lógica de verdad. Se hace primero, con TDD completo, y sin tocar red ni base.

**Files:**
- Create: `src/lib/usuarios/tipos.ts`
- Create: `src/lib/usuarios/cuentasSistema.ts`
- Create: `src/lib/usuarios/comparar.ts`
- Test: `scripts/test-usuarios-comparacion.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type OrigenExterno = "SGM" | "LDAP" | "GSIST"`
  - `type EstadoComparacion = "NUEVO" | "MIGRADO" | "DIFIERE" | "CONFLICTO"`
  - `interface ExternalUser`, `interface UsuarioLocalMinimo`, `interface ExternalUserComparado`, `interface ResumenComparacion`
  - `normalizarUsername(s: string): string`
  - `esCuentaSistema(username: string): boolean`
  - `compararUsuarios(externos: ExternalUser[], locales: UsuarioLocalMinimo[]): ExternalUserComparado[]`
  - `resumir(comparados: ExternalUserComparado[]): ResumenComparacion`

- [ ] **Step 1: Crear los tipos**

Crear `src/lib/usuarios/tipos.ts`:

```ts
// Tipos compartidos del cruce entre los orígenes externos (AS400 / AD) y la
// tabla `usuarios` de PostgreSQL.

export type OrigenExterno = "SGM" | "LDAP" | "GSIST";

export type EstadoComparacion = "NUEVO" | "MIGRADO" | "DIFIERE" | "CONFLICTO";

/** Un usuario tal como lo devuelve una fuente externa, ya normalizado. */
export interface ExternalUser {
  origen: OrigenExterno;
  /** Username tal cual viene del origen (puede estar en MAYÚSCULAS). */
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
    /** GRPIDs de ADMSEC.GRPUSU. */
    grupos?: number[];
    /** ROLIDs de GXICAGEO.USUMOBILEROLES. */
    rolesSgm?: number[];
    usuAutAd?: "A" | "G";
  };
}

/** Lo mínimo que hace falta traer de PG para comparar. */
export interface UsuarioLocalMinimo {
  id: number;
  username: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  estado: string;
  desdeSistema: string | null;
}

export interface DiferenciaCampo {
  campo: "nombre" | "email" | "estado";
  local: string | null;
  externo: string | null;
}

export interface ExternalUserComparado extends ExternalUser {
  estadoComparacion: EstadoComparacion;
  /** Id del usuario local que matcheó, si hubo match por username. */
  usuarioLocalId: number | null;
  /** Solo cuando estadoComparacion === "DIFIERE". */
  diffs: DiferenciaCampo[];
  /** Solo cuando estadoComparacion === "CONFLICTO": quién tiene ese email. */
  conflictoCon: string | null;
  /** Si viene tildado por defecto en la grilla del paso 2. */
  preseleccionado: boolean;
}

export interface ResumenComparacion {
  nuevos: number;
  migrados: number;
  difieren: number;
  conflictos: number;
  /**
   * Cuántos vienen tildados por defecto. NO es igual a `nuevos`: las cuentas
   * de sistema son NUEVO pero arrancan destildadas. Sin este contador, el
   * botón de la UI diría "Importar 429" y se importarían 425.
   */
  preseleccionados: number;
}
```

- [ ] **Step 2: Crear la heurística de cuentas de sistema**

Crear `src/lib/usuarios/cuentasSistema.ts`:

```ts
// Heurística para no importar por accidente cuentas de servicio.
// ADMSEC tiene ROOT, DAEMONS, INCIDENTES, PUESTOPRUEBA y similares mezclados
// con las personas. Se marcan y vienen destildadas, pero se pueden importar.

const DEFAULT_CUENTAS_SISTEMA = "ROOT,DAEMONS,INCIDENTES,PUESTOPRUEBA,ADMINISTRADOR";

function listaConfigurada(): Set<string> {
  const raw = process.env.CUENTAS_SISTEMA || DEFAULT_CUENTAS_SISTEMA;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function esCuentaSistema(username: string): boolean {
  const u = (username || "").trim().toUpperCase();
  if (!u) return false;
  return listaConfigurada().has(u);
}
```

- [ ] **Step 3: Escribir el test que falla**

Crear `scripts/test-usuarios-comparacion.ts`. Sigue el formato de `scripts/test-docs-root-guard.ts`: mini framework de aserciones, sin red ni base.

```ts
/**
 * scripts/test-usuarios-comparacion.ts
 *
 * Tests del clasificador de comparación externo↔PG (src/lib/usuarios/comparar.ts)
 * y del mapeo de filas del AS400 (src/lib/usuarios/sources/mapeo.ts).
 *
 * El repo no tiene runner de tests, así que esto es un script `tsx` con sus
 * propias aserciones — el mismo formato que scripts/test-docs-root-guard.ts.
 * Se corre con:
 *
 *   pnpm test:usuarios-comparacion
 *
 * NO toca la base ni la red: todo son funciones puras con fixtures.
 */

import { compararUsuarios, normalizarUsername, resumir } from "../src/lib/usuarios/comparar";
import { esCuentaSistema } from "../src/lib/usuarios/cuentasSistema";
import type { ExternalUser, UsuarioLocalMinimo } from "../src/lib/usuarios/tipos";

// ─── Mini framework de aserciones ───────────────────────────────────────────

let pasaron = 0;
const fallaron: string[] = [];

function test(nombre: string, fn: () => void): void {
  try {
    fn();
    pasaron++;
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallaron.push(nombre);
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${(error as Error).message}`);
  }
}

function esperarIgual(actual: unknown, esperado: unknown, que: string): void {
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(actual)}`);
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function externo(over: Partial<ExternalUser> = {}): ExternalUser {
  return {
    origen: "LDAP",
    username: "jperez",
    nombre: "Juan Perez",
    email: "jperez@riogas.com.uy",
    habilitado: true,
    esCuentaSistema: false,
    extras: {},
    ...over,
  };
}

function local(over: Partial<UsuarioLocalMinimo> = {}): UsuarioLocalMinimo {
  return {
    id: 1,
    username: "jperez",
    nombre: "Juan",
    apellido: "Perez",
    email: "jperez@riogas.com.uy",
    estado: "A",
    desdeSistema: "LDAP",
    ...over,
  };
}

const uno = (externos: ExternalUser[], locales: UsuarioLocalMinimo[]) =>
  compararUsuarios(externos, locales)[0];

// ─── Tests ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("\nComparación de usuarios externos vs PG\n");

  test("username idéntico → MIGRADO", () => {
    const r = uno([externo()], [local()]);
    esperarIgual(r.estadoComparacion, "MIGRADO", "estado");
    esperarIgual(r.usuarioLocalId, 1, "usuarioLocalId");
  });

  test("username que solo difiere en mayúsculas → MIGRADO, no NUEVO", () => {
    // El caso real: los 14 de ADMSEC ya migrados están SACUNA en AS400 y
    // sacuna en PG. Con match exacto el import crearía 14 duplicados.
    const r = uno([externo({ username: "SACUNA" })], [local({ username: "sacuna" })]);
    esperarIgual(r.estadoComparacion, "MIGRADO", "estado");
  });

  test("username con espacios al borde → normaliza y matchea", () => {
    const r = uno([externo({ username: "  jperez  " })], [local()]);
    esperarIgual(r.estadoComparacion, "MIGRADO", "estado");
  });

  test("username ausente en PG → NUEVO", () => {
    const r = uno([externo({ username: "nuevo" })], [local()]);
    esperarIgual(r.estadoComparacion, "NUEVO", "estado");
    esperarIgual(r.usuarioLocalId, null, "usuarioLocalId");
    esperarIgual(r.preseleccionado, true, "preseleccionado");
  });

  test("nombre distinto → DIFIERE con el diff del campo nombre", () => {
    const r = uno([externo({ nombre: "Juan Carlos Perez" })], [local()]);
    esperarIgual(r.estadoComparacion, "DIFIERE", "estado");
    esperarIgual(r.diffs.length, 1, "cantidad de diffs");
    esperarIgual(r.diffs[0].campo, "nombre", "campo del diff");
    esperarIgual(r.diffs[0].local, "Juan Perez", "valor local");
    esperarIgual(r.diffs[0].externo, "Juan Carlos Perez", "valor externo");
  });

  test("email distinto → DIFIERE", () => {
    const r = uno([externo({ email: "otro@riogas.com.uy" })], [local()]);
    esperarIgual(r.estadoComparacion, "DIFIERE", "estado");
    esperarIgual(r.diffs[0].campo, "email", "campo del diff");
  });

  test("estado distinto → DIFIERE", () => {
    const r = uno([externo({ habilitado: false })], [local({ estado: "A" })]);
    esperarIgual(r.estadoComparacion, "DIFIERE", "estado");
    esperarIgual(r.diffs[0].campo, "estado", "campo del diff");
  });

  test("externo sin nombre contra local con nombre → MIGRADO, no DIFIERE", () => {
    // ADMSEC no tiene nombre: no hay con qué comparar, no es una diferencia.
    const r = uno([externo({ nombre: null })], [local()]);
    esperarIgual(r.estadoComparacion, "MIGRADO", "estado");
  });

  test("externo sin email contra local con email → MIGRADO", () => {
    const r = uno([externo({ email: null })], [local()]);
    esperarIgual(r.estadoComparacion, "MIGRADO", "estado");
  });

  test("email que pertenece a OTRO username local → CONFLICTO", () => {
    const r = uno(
      [externo({ username: "nuevo", email: "jperez@riogas.com.uy" })],
      [local()],
    );
    esperarIgual(r.estadoComparacion, "CONFLICTO", "estado");
    esperarIgual(r.conflictoCon, "jperez", "conflictoCon");
    esperarIgual(r.preseleccionado, false, "no se puede preseleccionar");
  });

  test("CONFLICTO gana sobre DIFIERE", () => {
    // Mismo username (con nombre distinto → sería DIFIERE) pero su email lo
    // tiene otro usuario local. Gana CONFLICTO porque el insert reventaría.
    const r = uno(
      [externo({ username: "jperez", nombre: "Otro Nombre", email: "ana@riogas.com.uy" })],
      [local(), local({ id: 2, username: "ana", email: "ana@riogas.com.uy" })],
    );
    esperarIgual(r.estadoComparacion, "CONFLICTO", "estado");
  });

  test("externo sin email nunca es CONFLICTO", () => {
    const r = uno([externo({ username: "nuevo", email: null })], [local()]);
    esperarIgual(r.estadoComparacion, "NUEVO", "estado");
  });

  test("cuenta de sistema nueva → NUEVO pero destildada", () => {
    const r = uno([externo({ username: "ROOT", esCuentaSistema: true })], [local()]);
    esperarIgual(r.estadoComparacion, "NUEVO", "estado");
    esperarIgual(r.preseleccionado, false, "preseleccionado");
  });

  test("esCuentaSistema reconoce la lista por defecto", () => {
    esperarIgual(esCuentaSistema("ROOT"), true, "ROOT");
    esperarIgual(esCuentaSistema("daemons"), true, "daemons en minúscula");
    esperarIgual(esCuentaSistema("jperez"), false, "una persona");
  });

  test("normalizarUsername recorta y sube a mayúsculas", () => {
    esperarIgual(normalizarUsername("  SaCuNa "), "SACUNA", "normalizado");
  });

  test("el resumen cuenta cada categoría", () => {
    const comparados = compararUsuarios(
      [
        externo({ username: "nuevo1", email: null }),
        externo({ username: "nuevo2", email: null }),
        externo({ username: "jperez" }),
        externo({ username: "ana", nombre: "Ana Distinta", email: null }),
        externo({ username: "chocan", email: "jperez@riogas.com.uy" }),
      ],
      [local(), local({ id: 2, username: "ana", nombre: "Ana", apellido: "Lopez", email: null })],
    );
    const r = resumir(comparados);
    esperarIgual(r.nuevos, 2, "nuevos");
    esperarIgual(r.migrados, 1, "migrados");
    esperarIgual(r.difieren, 1, "difieren");
    esperarIgual(r.conflictos, 1, "conflictos");
    esperarIgual(r.preseleccionados, 2, "preseleccionados");
  });

  test("preseleccionados NO es igual a nuevos cuando hay cuentas de sistema", () => {
    // Si estos dos números se confunden, el botón de la UI promete importar
    // más usuarios de los que realmente se van a importar.
    const r = resumir(
      compararUsuarios(
        [
          externo({ username: "persona", email: null }),
          externo({ username: "ROOT", email: null, esCuentaSistema: true }),
        ],
        [],
      ),
    );
    esperarIgual(r.nuevos, 2, "nuevos");
    esperarIgual(r.preseleccionados, 1, "preseleccionados");
  });

  console.log(
    `\n${pasaron} ok, ${fallaron.length} fallidos${fallaron.length ? `: ${fallaron.join(", ")}` : ""}\n`,
  );
  if (fallaron.length > 0) process.exit(1);
}

main();
```

- [ ] **Step 4: Agregar el script a package.json**

En `package.json`, dentro de `"scripts"`, después de `"test:docs-guard"`:

```json
    "test:usuarios-comparacion": "tsx scripts/test-usuarios-comparacion.ts",
```

- [ ] **Step 5: Correr el test para verificar que falla**

Run: `pnpm test:usuarios-comparacion`
Expected: FAIL — no resuelve el módulo `../src/lib/usuarios/comparar`.

- [ ] **Step 6: Implementar el clasificador**

Crear `src/lib/usuarios/comparar.ts`:

```ts
import type {
  DiferenciaCampo,
  ExternalUser,
  ExternalUserComparado,
  ResumenComparacion,
  UsuarioLocalMinimo,
} from "./tipos";

/**
 * Clave de match entre un usuario externo y uno local.
 *
 * Va en MAYÚSCULAS y sin espacios a propósito: el @unique de `username` en
 * PostgreSQL es case-sensitive, pero el AS400 guarda los logins en mayúsculas
 * (SACUNA) y la PG en minúsculas (sacuna). Con match exacto, los 14 usuarios
 * de ADMSEC que YA están migrados se clasificarían como NUEVO y el import
 * crearía 14 duplicados. El login ya busca case-insensitive
 * (resolveCredentials.ts:641), así que esto es consistente con él.
 */
export function normalizarUsername(s: string): string {
  return (s || "").trim().toUpperCase();
}

function normalizarEmail(s: string | null | undefined): string | null {
  const v = (s || "").trim().toLowerCase();
  return v || null;
}

/** El nombre local se arma con nombre + apellido; el externo viene entero. */
function nombreCompletoLocal(u: UsuarioLocalMinimo): string | null {
  const v = [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
  return v || null;
}

function calcularDiffs(ext: ExternalUser, loc: UsuarioLocalMinimo): DiferenciaCampo[] {
  const diffs: DiferenciaCampo[] = [];

  // Un externo sin dato NO es una diferencia: ADMSEC no tiene nombre ni email,
  // y marcar DIFIERE por eso ensuciaría los 326 de LDAP con ruido inútil.
  const extNombre = (ext.nombre || "").trim() || null;
  if (extNombre !== null) {
    const locNombre = nombreCompletoLocal(loc);
    if (extNombre !== locNombre) {
      diffs.push({ campo: "nombre", local: locNombre, externo: extNombre });
    }
  }

  const extEmail = normalizarEmail(ext.email);
  if (extEmail !== null) {
    const locEmail = normalizarEmail(loc.email);
    if (extEmail !== locEmail) {
      diffs.push({ campo: "email", local: locEmail, externo: extEmail });
    }
  }

  const extEstado = ext.habilitado ? "A" : "I";
  const locEstado = (loc.estado || "").trim().toUpperCase() === "A" ? "A" : "I";
  if (extEstado !== locEstado) {
    diffs.push({ campo: "estado", local: locEstado, externo: extEstado });
  }

  return diffs;
}

/**
 * Cruza la lista de una fuente externa contra las filas de `usuarios` en PG.
 *
 * Devuelve TODAS las filas externas clasificadas — no filtra. El filtrado, el
 * orden y la paginación los hace el endpoint, sobre este resultado.
 */
export function compararUsuarios(
  externos: ExternalUser[],
  locales: UsuarioLocalMinimo[],
): ExternalUserComparado[] {
  const porUsername = new Map<string, UsuarioLocalMinimo>();
  const porEmail = new Map<string, UsuarioLocalMinimo>();

  for (const u of locales) {
    porUsername.set(normalizarUsername(u.username), u);
    const mail = normalizarEmail(u.email);
    // El primero gana: si hubiera dos locales con el mismo mail, la PG ya
    // estaría violando su propio @unique.
    if (mail && !porEmail.has(mail)) porEmail.set(mail, u);
  }

  return externos.map((ext) => {
    const clave = normalizarUsername(ext.username);
    const local = porUsername.get(clave) ?? null;

    // CONFLICTO primero: si el email del externo lo tiene OTRO username local,
    // el insert violaría el @unique de email. Gana sobre cualquier otro estado
    // porque es lo único que hace fallar la escritura.
    const mail = normalizarEmail(ext.email);
    const duenoDelMail = mail ? porEmail.get(mail) ?? null : null;
    if (duenoDelMail && normalizarUsername(duenoDelMail.username) !== clave) {
      return {
        ...ext,
        estadoComparacion: "CONFLICTO" as const,
        usuarioLocalId: local?.id ?? null,
        diffs: [],
        conflictoCon: duenoDelMail.username,
        preseleccionado: false,
      };
    }

    if (!local) {
      return {
        ...ext,
        estadoComparacion: "NUEVO" as const,
        usuarioLocalId: null,
        diffs: [],
        conflictoCon: null,
        // Las cuentas de sistema se ven pero no vienen tildadas.
        preseleccionado: !ext.esCuentaSistema,
      };
    }

    const diffs = calcularDiffs(ext, local);
    return {
      ...ext,
      estadoComparacion: diffs.length > 0 ? ("DIFIERE" as const) : ("MIGRADO" as const),
      usuarioLocalId: local.id,
      diffs,
      conflictoCon: null,
      // Nunca: el import solo crea (D4).
      preseleccionado: false,
    };
  });
}

export function resumir(comparados: ExternalUserComparado[]): ResumenComparacion {
  const r: ResumenComparacion = {
    nuevos: 0,
    migrados: 0,
    difieren: 0,
    conflictos: 0,
    preseleccionados: 0,
  };
  for (const c of comparados) {
    if (c.estadoComparacion === "NUEVO") r.nuevos++;
    else if (c.estadoComparacion === "MIGRADO") r.migrados++;
    else if (c.estadoComparacion === "DIFIERE") r.difieren++;
    else r.conflictos++;
    if (c.preseleccionado) r.preseleccionados++;
  }
  return r;
}
```

- [ ] **Step 7: Correr el test para verificar que pasa**

Run: `pnpm test:usuarios-comparacion`
Expected: PASS — `17 ok, 0 fallidos`.

- [ ] **Step 8: Verificar que compila**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores nuevos en `src/lib/usuarios/`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/usuarios/ scripts/test-usuarios-comparacion.ts package.json
git commit -m "feat(usuarios): clasificador de comparacion externo vs PG

Funcion pura que cruza la lista de un origen externo contra la tabla
usuarios y clasifica cada fila en NUEVO / MIGRADO / DIFIERE / CONFLICTO.

El match es case-insensitive a proposito: el AS400 guarda los logins en
mayusculas y la PG en minusculas, y los 14 usuarios de ADMSEC que ya
estan migrados difieren TODOS en capitalizacion. Con match exacto el
import crearia 14 duplicados.

17 tests en scripts/test-usuarios-comparacion.ts (pnpm test:usuarios-comparacion)."
```

---

## Task 2: Mapeo de filas del AS400 a `ExternalUser`

Funciones puras que traducen lo que devuelve el AS400 a nuestro tipo. Se testean sin red, y dejan la tarea 3 (el cliente HTTP) reducida a plomería.

**Files:**
- Create: `src/lib/usuarios/sources/mapeo.ts`
- Modify: `scripts/test-usuarios-comparacion.ts`

**Interfaces:**
- Consumes: `ExternalUser`, `esCuentaSistema` (Task 1).
- Produces:
  - `interface FilaSgm`, `interface FilaAdmsec`, `interface FilaLdapAd`
  - `mapearFilaSgm(row: FilaSgm): ExternalUser`
  - `mapearFilaAdmsec(row: FilaAdmsec): ExternalUser`
  - `mapearFilaLdapAd(row: FilaLdapAd): ExternalUser`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `scripts/test-usuarios-comparacion.ts`. Primero, el import arriba del todo, junto a los otros:

```ts
import { mapearFilaAdmsec, mapearFilaSgm } from "../src/lib/usuarios/sources/mapeo";
```

Y antes de la línea del `console.log` final del `main()`, este bloque:

```ts
  console.log("\nMapeo de filas del AS400\n");

  test("USUMOBILE mapea nombre, email y habilitado", () => {
    const u = mapearFilaSgm({
      L: "19605429",
      N: "JUAN PEREZ",
      E: "jperez@riogas.com.uy",
      HAB: "S",
      ESCID: 1000,
      ESCNOM: "MONTEVIDEO",
      EFLID: 7,
      EFLNOM: "FLETERA SUR",
      ROLES: [6],
    });
    esperarIgual(u.origen, "SGM", "origen");
    esperarIgual(u.username, "19605429", "username");
    esperarIgual(u.nombre, "JUAN PEREZ", "nombre");
    esperarIgual(u.email, "jperez@riogas.com.uy", "email");
    esperarIgual(u.habilitado, true, "habilitado");
    esperarIgual(u.extras.escenarioId, 1000, "escenarioId");
    esperarIgual(u.extras.empFleteraId, 7, "empFleteraId");
  });

  test("USUMOBILE con habilitado distinto de S → deshabilitado", () => {
    const u = mapearFilaSgm({ L: "123", N: "X", E: "", HAB: "N" });
    esperarIgual(u.habilitado, false, "habilitado");
  });

  test("USUMOBILE con email vacío → null, no string vacío", () => {
    const u = mapearFilaSgm({ L: "123", N: "X", E: "   ", HAB: "S" });
    esperarIgual(u.email, null, "email");
  });

  test("USUMOBILE con AGENCIAVINCEMPFLT en 0 → empFleteraId null", () => {
    // 0 significa "sin fletera", no la fletera con id 0.
    const u = mapearFilaSgm({ L: "123", N: "X", E: "", HAB: "S", EFLID: 0, EFLNOM: "" });
    esperarIgual(u.extras.empFleteraId, null, "empFleteraId");
  });

  test("ADMSEC con USUAUTAD='A' → origen LDAP", () => {
    const u = mapearFilaAdmsec({ L: "SACUNA", HAB: "S", AUTAD: "A", GRUPOS: [1, 52] });
    esperarIgual(u.origen, "LDAP", "origen");
    esperarIgual(u.extras.usuAutAd, "A", "usuAutAd");
  });

  test("ADMSEC con USUAUTAD distinto de A → origen GSIST", () => {
    const u = mapearFilaAdmsec({ L: "IBELBEDER", HAB: "S", AUTAD: "G", GRUPOS: [] });
    esperarIgual(u.origen, "GSIST", "origen");
  });

  test("ADMSEC con USUAUTAD nulo → GSIST (el default seguro)", () => {
    // Mismo criterio que normalizeAutAd en auth-admsec.js: cualquier cosa que
    // no sea 'A' se trata como 'G', para no mandar a nadie a LDAP por error.
    const u = mapearFilaAdmsec({ L: "X", HAB: "S", AUTAD: null, GRUPOS: [] });
    esperarIgual(u.origen, "GSIST", "origen");
  });

  test("ADMSEC no tiene nombre ni email → ambos null", () => {
    const u = mapearFilaAdmsec({ L: "SACUNA", HAB: "S", AUTAD: "A", GRUPOS: [] });
    esperarIgual(u.nombre, null, "nombre");
    esperarIgual(u.email, null, "email");
  });

  test("ADMSEC marca las cuentas de sistema", () => {
    const u = mapearFilaAdmsec({ L: "ROOT", HAB: "S", AUTAD: "G", GRUPOS: [] });
    esperarIgual(u.esCuentaSistema, true, "esCuentaSistema");
  });
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test:usuarios-comparacion`
Expected: FAIL — no resuelve `../src/lib/usuarios/sources/mapeo`.

- [ ] **Step 3: Implementar el mapeo**

Crear `src/lib/usuarios/sources/mapeo.ts`:

```ts
import { esCuentaSistema } from "../cuentasSistema";
import type { ExternalUser } from "../tipos";

// Las claves cortas (L, N, E, HAB...) son los alias de las queries del
// as400-api. DB2 devuelve los nombres de columna en mayúsculas, y los alias
// cortos evitan tener que escribir USUMOBILEHABILITADO en todos lados.

export interface FilaSgm {
  /** USUMOBILELOGIN */
  L: string;
  /** USUMOBILENOMBRE */
  N?: string | null;
  /** USUMOBILEEMAIL */
  E?: string | null;
  /** USUMOBILEHABILITADO */
  HAB?: string | null;
  /** ESCENARIO.ESCENARIOID */
  ESCID?: number | string | null;
  /** ESCENARIO.ESCENARIONOM */
  ESCNOM?: string | null;
  /** AGENCIA.AGENCIAVINCEMPFLT */
  EFLID?: number | string | null;
  /** EFLETERA.EFLNOM */
  EFLNOM?: string | null;
  /** USUMOBILEROLES.USUMOBR_ROLID */
  ROLES?: number[];
}

export interface FilaAdmsec {
  /** USULOGIN */
  L: string;
  /** USUHABILITADO */
  HAB?: string | null;
  /** USUAUTAD */
  AUTAD?: string | null;
  /** GRPIDs de ADMSEC.GRPUSU */
  GRUPOS?: number[];
}

export interface FilaLdapAd {
  sAMAccountName: string;
  displayName?: string | null;
  mail?: string | null;
  /** Active Directory: userAccountControl bit 2 = cuenta deshabilitada. */
  deshabilitada?: boolean;
}

function texto(v: string | null | undefined): string | null {
  const s = (v || "").trim();
  return s || null;
}

function habilitado(v: string | null | undefined): boolean {
  return (v || "").trim().toUpperCase() === "S";
}

function entero(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapearFilaSgm(row: FilaSgm): ExternalUser {
  const username = (row.L || "").trim();
  // AGENCIAVINCEMPFLT en 0 o null significa "sin fletera vinculada", no la
  // fletera con id 0. Mismo criterio que mapAgenciaFields en auth.js.
  const eflId = entero(row.EFLID);
  const empFleteraId = eflId != null && eflId > 0 ? eflId : null;

  return {
    origen: "SGM",
    username,
    nombre: texto(row.N),
    email: texto(row.E),
    habilitado: habilitado(row.HAB),
    esCuentaSistema: esCuentaSistema(username),
    extras: {
      escenarioId: entero(row.ESCID),
      escenarioNom: texto(row.ESCNOM),
      empFleteraId,
      empFleteraNom: empFleteraId != null ? texto(row.EFLNOM) : null,
      rolesSgm: row.ROLES ?? [],
    },
  };
}

export function mapearFilaAdmsec(row: FilaAdmsec): ExternalUser {
  const username = (row.L || "").trim();
  // Cualquier valor que no sea 'A' se trata como 'G'. Es el criterio de
  // normalizeAutAd en as400-api/src/routes/auth-admsec.js: más seguro,
  // evita mandar a alguien a LDAP por un dato sucio.
  const usuAutAd = (row.AUTAD || "").trim().toUpperCase() === "A" ? "A" : "G";

  return {
    origen: usuAutAd === "A" ? "LDAP" : "GSIST",
    username,
    // ADMSEC.USUARIOS no tiene columna de nombre ni de email. El nombre lo
    // completa el backfill del login contra AD (ver la spec, §6).
    nombre: null,
    email: null,
    habilitado: habilitado(row.HAB),
    esCuentaSistema: esCuentaSistema(username),
    extras: { grupos: row.GRUPOS ?? [], usuAutAd },
  };
}

export function mapearFilaLdapAd(row: FilaLdapAd): ExternalUser {
  const username = (row.sAMAccountName || "").trim();
  return {
    origen: "LDAP",
    username,
    nombre: texto(row.displayName),
    email: texto(row.mail),
    habilitado: !row.deshabilitada,
    esCuentaSistema: esCuentaSistema(username),
    extras: { usuAutAd: "A" },
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test:usuarios-comparacion`
Expected: PASS — `26 ok, 0 fallidos`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usuarios/sources/mapeo.ts scripts/test-usuarios-comparacion.ts
git commit -m "feat(usuarios): mapeo de filas del AS400 a ExternalUser

Funciones puras para USUMOBILE, ADMSEC y AD. ADMSEC decide el origen por
USUAUTAD ('A' = LDAP, cualquier otra cosa = GSIST, mismo criterio
conservador que normalizeAutAd en auth-admsec.js) y deja nombre/email en
null porque esa tabla no los tiene.

9 tests nuevos."
```

---

## Task 3: 🔴 GATE — Endpoints de enumeración en `as400-api`

**NO EMPEZAR hasta que `git status as400-api/` esté limpio** (spec §10.2: el router `/api/ficha` se está construyendo y no hay que pisarlo). Si sigue sucio, parar y avisar.

**Files:**
- Modify: `as400-api/src/middleware/apiKey.js`
- Modify: `as400-api/src/routes/ficha.js` (una línea: la llamada al middleware parametrizado)
- Create: `as400-api/src/routes/users.js`
- Modify: `as400-api/server.js`
- Modify: `as400-api/.env`
- Modify: `as400-api/README.md`

**Interfaces:**
- Consumes: `query()` de `../db/as400`, `requiereApiKey` de `../middleware/apiKey`.
- Produces: `POST /api/users/sgm/list`, `POST /api/users/admsec/list`, `POST /api/users/ldap/list`. Body `{ soloHabilitados?: boolean }`. Respuesta `{ ok: true, rows: [...] }` con los alias de `FilaSgm` / `FilaAdmsec`, o `{ ok: false, outcome: 'UNAVAILABLE', reason: 'NO_SERVICE_ACCOUNT' }`.

- [ ] **Step 1: Verificar que el gate está levantado**

Run: `git status --porcelain as400-api/`
Expected: sin salida. Si imprime algo, **parar** y avisar al usuario que el trabajo de `/api/ficha` sigue sin commitear.

- [ ] **Step 2: Parametrizar el middleware de api-key**

En `as400-api/src/middleware/apiKey.js`, convertir `requiereApiKey` en una factory que recibe el nombre de la env var, manteniendo `FICHA_API_KEY` como default para no cambiarle el comportamiento a `/api/ficha`:

```js
const crypto = require('crypto');

/**
 * Middleware de api-key por header `x-api-key`.
 *
 * `requiereApiKey(nombreEnv)` devuelve el middleware que compara contra
 * process.env[nombreEnv] con timingSafeEqual (comparando largos antes, porque
 * timingSafeEqual tira si los buffers miden distinto).
 *
 * Se invoca con FICHA_API_KEY desde /api/ficha y con USERS_API_KEY desde
 * /api/users. No se aplica a los routers viejos.
 */
function requiereApiKey(nombreEnv = 'FICHA_API_KEY') {
  return function (req, res, next) {
    const esperada = process.env[nombreEnv];

    if (!esperada) {
      console.error(`[apiKey] ${nombreEnv} no está definida: la ruta queda bloqueada`);
      return res.status(500).json({
        ok: false,
        error: `${nombreEnv} no está configurada en el servidor. Definila en el .env de as400-api y reiniciá el proceso.`,
      });
    }

    const recibida = req.get('x-api-key') || '';
    const bufRecibida = Buffer.from(recibida, 'utf8');
    const bufEsperada = Buffer.from(esperada, 'utf8');

    if (bufRecibida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecibida, bufEsperada)) {
      console.warn(`[apiKey] api-key inválida en ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ ok: false, error: 'API key inválida o ausente (header x-api-key)' });
    }

    return next();
  };
}

module.exports = { requiereApiKey };
```

En `as400-api/src/routes/ficha.js`, donde hoy se usa `requiereApiKey` como middleware directo, pasar a invocarlo: `router.use(requiereApiKey('FICHA_API_KEY'))`. Buscar la línea con `grep -n requiereApiKey as400-api/src/routes/ficha.js` y ajustarla.

- [ ] **Step 3: Crear el router de enumeración**

Crear `as400-api/src/routes/users.js`:

```js
const express = require('express');
const { query } = require('../db/as400');
const { requiereApiKey } = require('../middleware/apiKey');
const router = express.Router();

// Todo el router va detrás de api-key: estos endpoints exponen el padrón de
// usuarios de la empresa. No confundir con /api/db/query, que sigue abierto
// (deuda anotada aparte).
router.use(requiereApiKey('USERS_API_KEY'));

/**
 * POST /api/users/sgm/list
 * Enumera GXICAGEO.USUMOBILE con su agencia/escenario/fletera y sus roles.
 * NO devuelve USUMOBILEPASSWORD.
 * Body: { soloHabilitados?: boolean }
 */
router.post('/sgm/list', async (req, res) => {
  const { soloHabilitados = true } = req.body || {};
  const filtro = soloHabilitados ? "WHERE TRIM(u.USUMOBILEHABILITADO) = 'S'" : '';

  try {
    const rows = await query(
      `SELECT TRIM(u.USUMOBILELOGIN) AS L,
              TRIM(u.USUMOBILENOMBRE) AS N,
              u.USUMOBILEEMAIL AS E,
              u.USUMOBILEHABILITADO AS HAB,
              a.ESCENARIOID AS ESCID,
              TRIM(e.ESCENARIONOM) AS ESCNOM,
              a.AGENCIAVINCEMPFLT AS EFLID,
              TRIM(ef.EFLNOM) AS EFLNOM
         FROM GXICAGEO.USUMOBILE u
         LEFT JOIN GXICAGEO.AGENCIA a  ON a.AGENCIAID = u.AGENCIAID
         LEFT JOIN GXICAGEO.ESCENARIO e ON e.ESCENARIOID = a.ESCENARIOID
         LEFT JOIN GXCALDTA.EFLETERA ef ON ef.EFLID = a.AGENCIAVINCEMPFLT AND a.AGENCIAVINCEMPFLT > 0
         ${filtro}
        ORDER BY u.USUMOBILELOGIN`,
    );

    // Los roles van en una query aparte y se pegan en memoria: hacerlo con un
    // JOIN multiplicaría las filas de usuario por cantidad de roles.
    const roles = await query(
      `SELECT r.USUMOBILEID AS ID, r.USUMOBR_ROLID AS ROLID
         FROM GXICAGEO.USUMOBILEROLES r`,
    );
    const porLogin = new Map();
    const ids = await query(
      `SELECT u.USUMOBILEID AS ID, TRIM(u.USUMOBILELOGIN) AS L FROM GXICAGEO.USUMOBILE u`,
    );
    const loginPorId = new Map(ids.map((r) => [String(r.ID), r.L]));
    for (const r of roles) {
      const login = loginPorId.get(String(r.ID));
      if (!login) continue;
      if (!porLogin.has(login)) porLogin.set(login, []);
      porLogin.get(login).push(Number(r.ROLID));
    }

    const conRoles = rows.map((r) => ({ ...r, ROLES: porLogin.get(r.L) || [] }));
    console.log(`[Users SGM] ${conRoles.length} usuarios (soloHabilitados=${soloHabilitados})`);
    res.json({ ok: true, rows: conRoles });
  } catch (err) {
    console.error('[Users SGM] Error:', err.message);
    res.status(500).json({ ok: false, outcome: 'UNAVAILABLE', error: 'Error consultando USUMOBILE' });
  }
});

/**
 * POST /api/users/admsec/list
 * Enumera ADMSEC.USUARIOS con sus GRPIDs. NO devuelve USUPASSWORD.
 * Esta tabla NO tiene nombre ni email — es esperado, no un bug.
 * Body: { soloHabilitados?: boolean }
 */
router.post('/admsec/list', async (req, res) => {
  const { soloHabilitados = true } = req.body || {};
  const filtro = soloHabilitados ? "WHERE TRIM(u.USUHABILITADO) = 'S'" : '';

  try {
    const rows = await query(
      `SELECT u.USUID AS ID, TRIM(u.USULOGIN) AS L, u.USUHABILITADO AS HAB, u.USUAUTAD AS AUTAD
         FROM ADMSEC.USUARIOS u
         ${filtro}
        ORDER BY u.USULOGIN`,
    );

    const grupos = await query(`SELECT USUID AS ID, GRPID FROM ADMSEC.GRPUSU`);
    const porId = new Map();
    for (const g of grupos) {
      const k = String(g.ID);
      if (!porId.has(k)) porId.set(k, []);
      porId.get(k).push(Number(g.GRPID));
    }

    const conGrupos = rows.map(({ ID, ...r }) => ({ ...r, GRUPOS: porId.get(String(ID)) || [] }));
    console.log(`[Users ADMSEC] ${conGrupos.length} usuarios (soloHabilitados=${soloHabilitados})`);
    res.json({ ok: true, rows: conGrupos });
  } catch (err) {
    console.error('[Users ADMSEC] Error:', err.message);
    res.status(500).json({ ok: false, outcome: 'UNAVAILABLE', error: 'Error consultando ADMSEC' });
  }
});

/**
 * POST /api/users/ldap/list
 * Enumera Active Directory. Requiere una cuenta de servicio de solo lectura
 * (LDAP_BIND_USER / LDAP_BIND_PASSWORD), que al 2026-08-17 NO existe: sin ella
 * no se puede hacer search sobre el árbol, solo bind con la clave del propio
 * usuario. Mientras tanto responde NO_SERVICE_ACCOUNT y secapi cae a ADMSEC.
 *
 * Cuando se provisione la cuenta, implementar acá el bind + search por
 * (&(objectCategory=person)(objectClass=user)) sobre LDAP_BASE_DN, pidiendo
 * sAMAccountName, displayName, mail y userAccountControl.
 */
router.post('/ldap/list', async (req, res) => {
  if (!process.env.LDAP_BIND_USER || !process.env.LDAP_BIND_PASSWORD) {
    console.warn('[Users LDAP] sin service account: devolviendo NO_SERVICE_ACCOUNT');
    return res.json({
      ok: false,
      outcome: 'UNAVAILABLE',
      reason: 'NO_SERVICE_ACCOUNT',
      error: 'Falta la cuenta de servicio de Active Directory (LDAP_BIND_USER / LDAP_BIND_PASSWORD)',
    });
  }

  return res.status(501).json({
    ok: false,
    outcome: 'UNAVAILABLE',
    reason: 'NO_IMPLEMENTADO',
    error: 'La cuenta de servicio está configurada pero el search contra AD todavía no se implementó',
  });
});

module.exports = router;
```

- [ ] **Step 4: Montar el router**

En `as400-api/server.js`, junto a los otros `app.use`:

```js
app.use('/api/users',   require('./src/routes/users'));
```

Y en el listado de endpoints del `GET /`:

```js
    'POST /api/users/sgm/list                  (x-api-key)',
    'POST /api/users/admsec/list               (x-api-key)',
    'POST /api/users/ldap/list                 (x-api-key)',
```

- [ ] **Step 5: Generar la api-key y configurarla**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Agregar al `as400-api/.env` local **y al de node-dev** (`/var/www/secapi/as400-api/.env`):

```
# API key de /api/users (enumeracion de usuarios para secapi)
USERS_API_KEY=<el valor generado>
```

Y al `.env.local` de secapi (y al `.env.production` del server):

```
USERS_API_KEY=<el mismo valor>
```

- [ ] **Step 6: Verificar los tres endpoints contra el AS400 real**

Con el `as400-api` levantado (`node server.js` local, o el proceso pm2 de node-dev reiniciado):

```bash
K=<la api-key>
curl -s -X POST http://localhost:5000/api/users/admsec/list \
  -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('filas',j.rows.length,'| primera',JSON.stringify(j.rows[0]))})"
```

Expected: `filas 349` y una primera fila con `L`, `HAB`, `AUTAD`, `GRUPOS`.

```bash
curl -s -X POST http://localhost:5000/api/users/sgm/list \
  -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{}' | head -c 300
```

Expected: `{"ok":true,"rows":[...]}` con 919 filas.

```bash
curl -s -X POST http://localhost:5000/api/users/ldap/list \
  -H 'Content-Type: application/json' -H "x-api-key: $K" -d '{}'
```

Expected: `{"ok":false,"outcome":"UNAVAILABLE","reason":"NO_SERVICE_ACCOUNT",...}`

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5000/api/users/admsec/list \
  -H 'Content-Type: application/json' -d '{}'
```

Expected: `401` — sin api-key no entra.

- [ ] **Step 7: Verificar que `/api/ficha` sigue andando**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/ficha/cliente/1 -H "x-api-key: $FICHA_KEY"`
Expected: el mismo código que devolvía antes del cambio del middleware (no 500). Si da 500 con "FICHA_API_KEY no está configurada", el `router.use` de `ficha.js` quedó mal.

- [ ] **Step 8: Documentar en el README**

Agregar a `as400-api/README.md`, en la lista de endpoints:

```markdown
- `POST /api/users/sgm/list` — enumera `GXICAGEO.USUMOBILE` (login, nombre, email, habilitado, escenario, fletera, roles). Requiere `x-api-key` = `USERS_API_KEY`.
- `POST /api/users/admsec/list` — enumera `ADMSEC.USUARIOS` + `GRPUSU`. **No tiene nombre ni email: esa tabla no los tiene.** Requiere `x-api-key`.
- `POST /api/users/ldap/list` — enumera Active Directory. Devuelve `NO_SERVICE_ACCOUNT` hasta que existan `LDAP_BIND_USER` / `LDAP_BIND_PASSWORD`.

Ninguno devuelve columnas de password.
```

- [ ] **Step 9: Commit**

```bash
git add as400-api/
git commit -m "feat(as400-api): endpoints de enumeracion de usuarios

POST /api/users/{sgm,admsec,ldap}/list, read-only y detras de api-key
(USERS_API_KEY). Ninguno devuelve columnas de password.

requiereApiKey pasa a ser factory por nombre de env var, manteniendo
FICHA_API_KEY como default para no cambiarle nada a /api/ficha.

El de LDAP responde NO_SERVICE_ACCOUNT: sin cuenta de servicio el AD no
se puede enumerar. Queda escrito para que el dia que exista sea solo
configurar el .env."
```

---

## Task 4: Capa de fuentes en secapi

**Files:**
- Create: `src/lib/usuarios/sources/as400Users.ts`
- Create: `src/lib/usuarios/sources/index.ts`

**Interfaces:**
- Consumes: `mapearFilaSgm`, `mapearFilaAdmsec`, `mapearFilaLdapAd` (Task 2); los endpoints de Task 3.
- Produces:
  - `interface ExternalUserSource { key; label; available(); list(opts) }`
  - `obtenerFuente(key: OrigenExterno): ExternalUserSource`
  - `obtenerTodasLasFuentes(): ExternalUserSource[]`

- [ ] **Step 1: Implementar el cliente HTTP**

Crear `src/lib/usuarios/sources/as400Users.ts`:

```ts
import type { FilaAdmsec, FilaLdapAd, FilaSgm } from "./mapeo";

const AS400_API_URL = process.env.AS400_API_URL || "";
const USERS_API_KEY = process.env.USERS_API_KEY || "";
const TIMEOUT = 60_000; // enumerar ~1.000 filas del AS400 es lento

export interface RespuestaLista<T> {
  ok: boolean;
  rows?: T[];
  reason?: string;
  error?: string;
}

async function postLista<T>(path: string, body: unknown): Promise<RespuestaLista<T>> {
  if (!AS400_API_URL) return { ok: false, reason: "SIN_AS400_API_URL" };
  if (!USERS_API_KEY) return { ok: false, reason: "SIN_USERS_API_KEY" };

  try {
    const res = await fetch(`${AS400_API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": USERS_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const json = (await res.json()) as RespuestaLista<T>;
    if (!res.ok) return { ok: false, reason: json.reason || `HTTP_${res.status}`, error: json.error };
    return json;
  } catch (e) {
    return { ok: false, reason: "UNAVAILABLE", error: (e as Error).message };
  }
}

export const listarSgm = (soloHabilitados: boolean) =>
  postLista<FilaSgm>("/api/users/sgm/list", { soloHabilitados });

export const listarAdmsec = (soloHabilitados: boolean) =>
  postLista<FilaAdmsec>("/api/users/admsec/list", { soloHabilitados });

export const listarLdapAd = (soloHabilitados: boolean) =>
  postLista<FilaLdapAd>("/api/users/ldap/list", { soloHabilitados });
```

- [ ] **Step 2: Implementar las tres fuentes**

Crear `src/lib/usuarios/sources/index.ts`:

```ts
import type { ExternalUser, OrigenExterno } from "../tipos";
import { listarAdmsec, listarLdapAd, listarSgm } from "./as400Users";
import { mapearFilaAdmsec, mapearFilaLdapAd, mapearFilaSgm } from "./mapeo";

export interface Disponibilidad {
  ok: boolean;
  reason?: string;
}

export interface ExternalUserSource {
  key: OrigenExterno;
  label: string;
  available(): Promise<Disponibilidad>;
  list(opts: { soloHabilitados: boolean }): Promise<ExternalUser[]>;
}

/** ¿Hay cuenta de servicio de AD configurada? Es el único switch de §4.2. */
function hayServiceAccountAd(): boolean {
  return Boolean(process.env.LDAP_BIND_USER && process.env.LDAP_BIND_PASSWORD);
}

const sgmSource: ExternalUserSource = {
  key: "SGM",
  label: "SGM (usuarios móviles)",
  async available() {
    const r = await listarSgm(true);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    const r = await listarSgm(soloHabilitados);
    if (!r.ok || !r.rows) return [];
    return r.rows.map(mapearFilaSgm);
  },
};

/**
 * El origen LDAP: hoy sale de ADMSEC filtrando USUAUTAD='A'; cuando exista la
 * cuenta de servicio de AD, sale del AD real.
 *
 * ESTE ES EL ÚNICO LUGAR donde vive esa decisión. El resto de la app no se
 * entera de cuál de los dos caminos se usó.
 */
const ldapSource: ExternalUserSource = {
  key: "LDAP",
  label: "LDAP / Active Directory",
  async available() {
    if (hayServiceAccountAd()) {
      const r = await listarLdapAd(true);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    }
    const r = await listarAdmsec(true);
    return r.ok
      ? { ok: true, reason: "DESDE_ADMSEC" }
      : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    if (hayServiceAccountAd()) {
      const r = await listarLdapAd(soloHabilitados);
      if (r.ok && r.rows) return r.rows.map(mapearFilaLdapAd);
      // Si el AD falla, caemos a ADMSEC en vez de devolver vacío.
    }
    const r = await listarAdmsec(soloHabilitados);
    if (!r.ok || !r.rows) return [];
    return r.rows.map(mapearFilaAdmsec).filter((u) => u.origen === "LDAP");
  },
};

const gsistSource: ExternalUserSource = {
  key: "GSIST",
  label: "ADMSEC / GSIST",
  async available() {
    const r = await listarAdmsec(true);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },
  async list({ soloHabilitados }) {
    const r = await listarAdmsec(soloHabilitados);
    if (!r.ok || !r.rows) return [];
    return r.rows.map(mapearFilaAdmsec).filter((u) => u.origen === "GSIST");
  },
};

const FUENTES: Record<OrigenExterno, ExternalUserSource> = {
  SGM: sgmSource,
  LDAP: ldapSource,
  GSIST: gsistSource,
};

export function obtenerFuente(key: OrigenExterno): ExternalUserSource {
  return FUENTES[key];
}

export function obtenerTodasLasFuentes(): ExternalUserSource[] {
  return [sgmSource, ldapSource, gsistSource];
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/usuarios/sources/
git commit -m "feat(usuarios): capa de fuentes externas con el switch ADMSEC/AD

Tres ExternalUserSource (SGM, LDAP, GSIST) sobre los endpoints del
as400-api. ldapSource es el unico lugar donde vive la decision de leer
del AD real o de ADMSEC con USUAUTAD='A': cuando aparezca la cuenta de
servicio se cambia ahi y nadie mas se entera."
```

---

## Task 5: Endpoint de comparación

**Files:**
- Create: `src/app/api/db/usuarios/externos/route.ts`

**Interfaces:**
- Consumes: `obtenerFuente`, `obtenerTodasLasFuentes` (Task 4); `compararUsuarios`, `resumir` (Task 1).
- Produces: `GET /api/db/usuarios/externos` → `{ success, items, total, page, pageSize, resumen, fuentes }`.

- [ ] **Step 1: Implementar el endpoint**

Crear `src/app/api/db/usuarios/externos/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";
import { compararUsuarios, resumir } from "@/lib/usuarios/comparar";
import { obtenerFuente, obtenerTodasLasFuentes } from "@/lib/usuarios/sources";
import type {
  EstadoComparacion,
  ExternalUser,
  ExternalUserComparado,
  OrigenExterno,
} from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
const ESTADOS: EstadoComparacion[] = ["NUEVO", "MIGRADO", "DIFIERE", "CONFLICTO"];

function coincideFiltro(u: ExternalUserComparado, filtro: string): boolean {
  if (!filtro) return true;
  const f = filtro.toLowerCase();
  return (
    u.username.toLowerCase().includes(f) ||
    (u.nombre || "").toLowerCase().includes(f) ||
    (u.email || "").toLowerCase().includes(f)
  );
}

// =============================================
// GET /api/db/usuarios/externos
// Lista los usuarios de los orígenes externos, cruzados contra PostgreSQL.
// Query: origen, filtro, estadoComparacion, incluirDeshabilitados, page, pageSize
// =============================================
export async function GET(req: NextRequest) {
  try {
    const usuario = await resolveUsuario(req);
    if (!usuario) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const origenParam = (searchParams.get("origen") || "todos").toUpperCase();
    const filtro = (searchParams.get("filtro") || "").trim();
    const estadoParam = (searchParams.get("estadoComparacion") || "todos").toUpperCase();
    const incluirDeshabilitados = searchParams.get("incluirDeshabilitados") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "25")));

    const fuentes =
      origenParam === "TODOS"
        ? obtenerTodasLasFuentes()
        : ORIGENES.includes(origenParam as OrigenExterno)
          ? [obtenerFuente(origenParam as OrigenExterno)]
          : [];

    if (fuentes.length === 0) {
      return NextResponse.json({ success: false, error: `Origen inválido: ${origenParam}` }, { status: 400 });
    }

    // Traer los externos y los locales en paralelo. Los locales son ~850 filas
    // con 7 columnas: una query, sin joins.
    const [resultados, locales] = await Promise.all([
      Promise.all(
        fuentes.map(async (f) => {
          try {
            const users = await f.list({ soloHabilitados: !incluirDeshabilitados });
            return { origen: f.key, ok: true, reason: null as string | null, users };
          } catch (e) {
            console.error(`[externos] fuente ${f.key} falló:`, (e as Error).message);
            return { origen: f.key, ok: false, reason: (e as Error).message, users: [] as ExternalUser[] };
          }
        }),
      ),
      prisma.usuario.findMany({
        select: {
          id: true,
          username: true,
          nombre: true,
          apellido: true,
          email: true,
          estado: true,
          desdeSistema: true,
        },
      }),
    ]);

    const externos = resultados.flatMap((r) => r.users);
    const comparados = compararUsuarios(externos, locales);

    // El resumen cuenta el universo del origen, ignorando filtro y estado: si
    // no, los chips que filtran por estado se recalcularían al clickearlos y
    // quedarían en cero.
    const resumen = resumir(comparados);

    let visibles = comparados.filter((u) => coincideFiltro(u, filtro));
    if (ESTADOS.includes(estadoParam as EstadoComparacion)) {
      visibles = visibles.filter((u) => u.estadoComparacion === estadoParam);
    }
    visibles.sort((a, b) => a.username.localeCompare(b.username));

    const total = visibles.length;
    const items = visibles.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      resumen,
      fuentes: resultados.map((r) => ({ origen: r.origen, ok: r.ok, reason: r.reason })),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/externos GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar contra dev**

Con `pnpm dev` corriendo y una sesión iniciada (hace falta la cookie `token`), en el browser o con curl con la cookie:

```
http://localhost:4005/api/db/usuarios/externos?origen=SGM&estadoComparacion=NUEVO&pageSize=5
```

Expected: `resumen.nuevos === 94` y `resumen.migrados === 825` contra los datos actuales.

```
http://localhost:4005/api/db/usuarios/externos?origen=LDAP&estadoComparacion=NUEVO&pageSize=5
```

Expected: `resumen.nuevos === 312`, `resumen.migrados === 14`. **Los 14 son la prueba de que el match case-insensitive funciona**: si dan 0 migrados y 326 nuevos, el clasificador está comparando con case sensitivity.

```
http://localhost:4005/api/db/usuarios/externos?origen=todos&estadoComparacion=NUEVO&pageSize=1
```

Expected: `total === 429`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/db/usuarios/externos/
git commit -m "feat(usuarios): GET /api/db/usuarios/externos

Lista los usuarios de los origenes externos cruzados contra PG, con
estado de comparacion por fila, filtros y paginado del servidor.

El resumen cuenta el universo del origen y NO respeta filtro ni
estadoComparacion: los chips de la UI filtran por estado, y si el
resumen se recalculara con el filtro aplicado quedarian en cero al
clickearlos. total es lo que se pagina, resumen lo que alimenta los
chips: son distintos a proposito.

Si una fuente falla, se reporta en `fuentes` y las otras siguen
andando, en vez de fallar la request entera."
```

---

## Task 6: Endpoint de importación

**Files:**
- Create: `src/app/api/db/usuarios/importar/route.ts`

**Interfaces:**
- Consumes: `obtenerFuente` (Task 4), `resolveUsuario`, `persistEscenarioPreference(usuarioId, escenarioId, escenarioNom, isExternal)`, `persistEmpFleteraPreference(usuarioId, empFleteraId, empFleteraNom)`, `applyAdmsecGroupRoles({ usuario, groups })`, `assignDespachoOnNewUser(usuarioId, username, eligible)`.
- Produces: `POST /api/db/usuarios/importar` → `{ success, dryRun, total, creados, omitidos, errores, detalles }`.

- [ ] **Step 1: Implementar el endpoint**

Crear `src/app/api/db/usuarios/importar/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";
import { applyAdmsecGroupRoles } from "@/lib/auth/applyAdmsecGroupRoles";
import { assignDespachoOnNewUser } from "@/lib/auth/assignDespachoIfEligible";
import { persistEmpFleteraPreference } from "@/lib/auth/persistEmpFleteraPreference";
import { persistEscenarioPreference } from "@/lib/auth/persistEscenarioPreference";
import { normalizarUsername } from "@/lib/usuarios/comparar";
import { obtenerFuente } from "@/lib/usuarios/sources";
import type { ExternalUser, OrigenExterno } from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
const BATCH_SIZE = 50;

/** ROLID de USUMOBILEROLES que representa Despacho (mismo criterio que auth.js). */
const ROL_DESPACHO_SGM = 6;

type Estado = "creado" | "omitido" | "error";
interface Detalle {
  username: string;
  estado: Estado;
  motivo?: string;
}

async function crearUsuario(
  ext: ExternalUser,
  opts: { conPreferencias: boolean; conRoles: boolean; creadoPor: string; dryRun: boolean },
): Promise<Detalle> {
  const usernameOriginal = ext.username.trim();
  // Se escribe en minúsculas: es la convención de las filas que ya están
  // (el AS400 las guarda en MAYÚSCULAS y la PG en minúsculas).
  const username = usernameOriginal.toLowerCase();

  try {
    // Re-verificar contra PG: la grilla del paso 2 puede tener minutos de
    // antigüedad, y el import NUNCA actualiza (D4).
    const existente = await prisma.usuario.findFirst({
      where: { username: { equals: usernameOriginal, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (existente) {
      return { username: usernameOriginal, estado: "omitido", motivo: `Ya existe como "${existente.username}"` };
    }

    if (ext.email) {
      const conEseMail = await prisma.usuario.findFirst({
        where: { email: { equals: ext.email.trim(), mode: "insensitive" } },
        select: { username: true },
      });
      if (conEseMail) {
        return {
          username: usernameOriginal,
          estado: "omitido",
          motivo: `El email ya lo tiene "${conEseMail.username}"`,
        };
      }
    }

    if (opts.dryRun) return { username: usernameOriginal, estado: "creado", motivo: "dry-run" };

    const partes = (ext.nombre || "").trim().split(/\s+/).filter(Boolean);

    const creado = await prisma.usuario.create({
      data: {
        username,
        // Vacía a propósito: el login rechaza claves vacías antes de comparar
        // (resolveCredentials.ts:631), así que el fallback de clave local
        // queda inutilizable y estos usuarios SOLO entran validando contra su
        // fuente externa.
        password: "",
        email: ext.email?.trim() || null,
        nombre: partes[0] || null,
        apellido: partes.slice(1).join(" ") || null,
        estado: ext.habilitado ? "A" : "I",
        esExterno: "S",
        usuarioExterno: usernameOriginal,
        tipoUsuario: "E",
        desdeSistema: ext.origen,
        creadoPor: opts.creadoPor,
      },
      select: { id: true, username: true, esRoot: true },
    });

    if (opts.conPreferencias && ext.origen === "SGM") {
      await persistEscenarioPreference(creado.id, ext.extras.escenarioId, ext.extras.escenarioNom, true);
      await persistEmpFleteraPreference(creado.id, ext.extras.empFleteraId, ext.extras.empFleteraNom);
    }

    if (opts.conRoles) {
      if (ext.origen === "SGM") {
        await assignDespachoOnNewUser(
          creado.id,
          creado.username,
          (ext.extras.rolesSgm || []).includes(ROL_DESPACHO_SGM),
        );
      } else {
        await applyAdmsecGroupRoles({
          usuario: { id: creado.id, username: creado.username, esRoot: creado.esRoot },
          groups: ext.extras.grupos || [],
        });
      }
    }

    return { username: usernameOriginal, estado: "creado" };
  } catch (error: any) {
    const msg: string = error?.message || String(error);
    const util = msg.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "Error desconocido";
    console.error(`[Importar] Error con "${usernameOriginal}":`, util);
    return { username: usernameOriginal, estado: "error", motivo: util };
  }
}

// =============================================
// POST /api/db/usuarios/importar
// Body: { origen, usernames[], conPreferencias?, conRoles?, dryRun? }
// Solo CREA. Lo que ya existe se omite con su motivo.
// =============================================
export async function POST(req: NextRequest) {
  try {
    const operador = await resolveUsuario(req);
    if (!operador) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const origen = String(body.origen || "").toUpperCase() as OrigenExterno;
    const usernames: string[] = Array.isArray(body.usernames) ? body.usernames : [];
    const conPreferencias = body.conPreferencias !== false;
    const conRoles = body.conRoles !== false;
    const dryRun = body.dryRun === true;

    if (!ORIGENES.includes(origen)) {
      return NextResponse.json({ success: false, error: `Origen inválido: ${origen}` }, { status: 400 });
    }
    if (usernames.length === 0) {
      return NextResponse.json({ success: false, error: "No se seleccionó ningún usuario" }, { status: 400 });
    }

    const pedidos = new Set(usernames.map(normalizarUsername));
    const todos = await obtenerFuente(origen).list({ soloHabilitados: false });
    const aImportar = todos.filter((u) => pedidos.has(normalizarUsername(u.username)));

    const noEncontrados = [...pedidos].filter(
      (p) => !aImportar.some((u) => normalizarUsername(u.username) === p),
    );

    const creadoPor = `import:${operador.username}`.slice(0, 60);
    const detalles: Detalle[] = noEncontrados.map((u) => ({
      username: u,
      estado: "error" as const,
      motivo: "Ya no está en el origen externo",
    }));

    for (let i = 0; i < aImportar.length; i += BATCH_SIZE) {
      const lote = aImportar.slice(i, i + BATCH_SIZE);
      const res = await Promise.all(
        lote.map((u) => crearUsuario(u, { conPreferencias, conRoles, creadoPor, dryRun })),
      );
      detalles.push(...res);
      console.log(`[Importar] ${detalles.length}/${usernames.length} procesados`);
    }

    const creados = detalles.filter((d) => d.estado === "creado").length;
    const omitidos = detalles.filter((d) => d.estado === "omitido").length;
    const errores = detalles.filter((d) => d.estado === "error").length;

    return NextResponse.json({
      success: true,
      dryRun,
      mensaje: dryRun
        ? `Simulación: se crearían ${creados}, se omitirían ${omitidos}, ${errores} con error.`
        : `Importación completada: ${creados} creados, ${omitidos} omitidos, ${errores} errores.`,
      total: usernames.length,
      creados,
      omitidos,
      errores,
      detalles: detalles.filter((d) => d.estado !== "creado").slice(0, 200),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/importar POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar el dry-run contra dev**

Con `pnpm dev` y sesión iniciada, tomar 3 usernames NUEVO de SGM del endpoint de la tarea 5 y:

```bash
curl -s -X POST http://localhost:4005/api/db/usuarios/importar \
  -H 'Content-Type: application/json' -b "token=$TOKEN" \
  -d '{"origen":"SGM","usernames":["19605429","53830503","17505243"],"dryRun":true}'
```

Expected: `{"success":true,"dryRun":true,"creados":3,"omitidos":0,"errores":0,...}`

Verificar que **no se escribió nada**. El `$disconnect()` no es opcional: sin él el proceso queda colgado con la conexión abierta.

```bash
pnpm exec tsx -e "import p from './src/lib/prisma'; p.usuario.count().then(n => { console.log('usuarios:', n); return p.\$disconnect(); })"
```

Expected: `usuarios: 854`, el mismo número que antes del dry-run.

- [ ] **Step 3: Verificar el import real de UN usuario**

```bash
curl -s -X POST http://localhost:4005/api/db/usuarios/importar \
  -H 'Content-Type: application/json' -b "token=$TOKEN" \
  -d '{"origen":"SGM","usernames":["19605429"],"dryRun":false}'
```

Expected: `creados: 1`.

Verificar la fila creada:

```bash
pnpm exec tsx -e "
import p from './src/lib/prisma';
p.usuario.findFirst({ where: { username: '19605429' }, include: { preferencias: true } })
  .then(u => { console.log(JSON.stringify({
    username: u?.username, password: u?.password, desdeSistema: u?.desdeSistema,
    esExterno: u?.esExterno, tipoUsuario: u?.tipoUsuario, creadoPor: u?.creadoPor,
    prefs: u?.preferencias.map(x => x.atributo + '=' + x.valor),
  }, null, 2)); return p.\$disconnect(); });
"
```

Expected: `password: ""`, `desdeSistema: "SGM"`, `esExterno: "S"`, `tipoUsuario: "E"`, `creadoPor: "import:<tu usuario>"`, y una preferencia `Escenario`.

- [ ] **Step 4: Verificar la idempotencia**

Repetir el mismo POST del step 3.
Expected: `creados: 0, omitidos: 1`, con `motivo: 'Ya existe como "19605429"'`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/db/usuarios/importar/
git commit -m "feat(usuarios): POST /api/db/usuarios/importar

Alta masiva desde un origen externo. Solo CREA: re-verifica contra PG en
el momento del insert (la grilla puede tener minutos) y omite lo que ya
existe con su motivo, sin tocarlo nunca.

Los importados van con password vacia a proposito: el login rechaza
claves vacias antes de comparar, asi que el fallback de clave local
queda muerto y solo pueden entrar validando contra su fuente externa.

Reusa persistEscenarioPreference, persistEmpFleteraPreference,
applyAdmsecGroupRoles y assignDespachoOnNewUser, todos idempotentes.
Soporta dryRun."
```

---

## Task 7: Backfill de nombre y email en el login

**Files:**
- Modify: `src/lib/auth/resolveCredentials.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `backfillDatosLdap(usuario, ldapUser): Promise<void>` (privada del módulo).

- [ ] **Step 1: Agregar el helper**

En `src/lib/auth/resolveCredentials.ts`, antes de `resolveExistingUser` (cerca de la línea 360), agregar:

```ts
/**
 * Completa nombre / email de un usuario LDAP a partir de lo que devolvió el AD.
 *
 * Los usuarios importados desde ADMSEC nacen sin nombre ni email porque
 * ADMSEC.USUARIOS no tiene esas columnas. El AD sí los tiene y el login ya los
 * recibe en cada ingreso — hasta ahora los descartaba.
 *
 * SOLO rellena huecos: nunca pisa un valor que ya esté cargado, para no
 * deshacer una edición manual del operador.
 */
async function backfillDatosLdap(
  usuario: { id: number; username: string; nombre: string | null; email: string | null },
  ldapUser: { nombre?: string; email?: string } | undefined
): Promise<void> {
  if (!ldapUser) return;

  const data: { nombre?: string; apellido?: string; email?: string } = {};

  if (!usuario.nombre) {
    const partes = (ldapUser.nombre || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length > 0) {
      data.nombre = partes[0].slice(0, 60);
      const apellido = partes.slice(1).join(" ").trim();
      if (apellido) data.apellido = apellido.slice(0, 60);
    }
  }

  if (!usuario.email) {
    const mail = (ldapUser.email || "").trim();
    if (mail) data.email = mail.slice(0, 120);
  }

  if (Object.keys(data).length === 0) return;

  try {
    await prisma.usuario.update({ where: { id: usuario.id }, data });
    authLog.info("backfill de datos LDAP", { username: usuario.username, campos: Object.keys(data) });
  } catch (err) {
    // El email es @unique: si otro usuario ya lo tiene, no es motivo para
    // fallar el login. Se loguea y sigue.
    authLog.warn("no se pudo hacer backfill de datos LDAP", {
      username: usuario.username,
      message: (err as Error).message,
    });
  }
}
```

- [ ] **Step 2: Llamarlo en la rama LDAP**

En `resolveExistingUser`, dentro del bloque `if (desde === "LDAP")`, en el camino `ldap.outcome === "OK"`, **justo antes** de `await assignDespachoIfEligible({...})` (alrededor de la línea 476):

```ts
      await backfillDatosLdap(usuario, ldap.user);
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar en vivo**

Importar un usuario LDAP con el endpoint de la tarea 6 (queda con `nombre: null`), loguearse con él en `pnpm dev`, y volver a mirar la fila:

```bash
pnpm exec tsx -e "
import p from './src/lib/prisma';
p.usuario.findFirst({ where: { username: '<el importado>' } })
  .then(u => { console.log({ nombre: u?.nombre, apellido: u?.apellido, email: u?.email }); return p.\$disconnect(); });
"
```

Expected: `nombre` y `email` completos después del login, `null` antes.

Si no hay forma de probar un login LDAP real, dejarlo anotado para la verificación en dev de la tarea 11 y seguir.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/resolveCredentials.ts
git commit -m "feat(auth): backfill de nombre y email desde AD en el login LDAP

La rama LDAP ya recibia ldap.user.nombre y .email del AD y los tiraba.
Los usuarios importados desde ADMSEC nacen sin esos datos porque
ADMSEC.USUARIOS no tiene esas columnas, asi que sin esto quedaban sin
nombre para siempre.

Solo rellena huecos, nunca pisa lo que ya esta cargado. Si el update
falla (email @unique tomado), se loguea y el login sigue."
```

---

## Task 8: Wrappers de API y retiro de lo viejo

**Files:**
- Modify: `src/services/api.ts`
- Delete: `src/app/api/db/usuarios/sync/route.ts`
- Delete: `src/components/dashboard/usuarios/SyncUsuariosModal.tsx`
- Modify: `src/app/dashboard/usuarios/page.tsx`

**Interfaces:**
- Produces:
  - `apiUsuariosExternos(opts): Promise<UsuariosExternosResponse>`
  - `apiImportarUsuariosDB(payload): Promise<ImportarUsuariosResult>`
  - Tipos `UsuarioExternoRow`, `UsuariosExternosResponse`, `ImportarUsuariosResult`

- [ ] **Step 1: Agregar los wrappers**

En `src/services/api.ts`, al final del bloque de servicios Prisma:

```ts
// =====================================================================
// 📦 SERVICIOS PRISMA — Usuarios de orígenes externos (SGM / LDAP / GSIST)
// =====================================================================

export type OrigenExternoUI = "SGM" | "LDAP" | "GSIST";
export type EstadoComparacionUI = "NUEVO" | "MIGRADO" | "DIFIERE" | "CONFLICTO";

export interface UsuarioExternoRow {
  origen: OrigenExternoUI;
  username: string;
  nombre: string | null;
  email: string | null;
  habilitado: boolean;
  esCuentaSistema: boolean;
  estadoComparacion: EstadoComparacionUI;
  usuarioLocalId: number | null;
  diffs: { campo: "nombre" | "email" | "estado"; local: string | null; externo: string | null }[];
  conflictoCon: string | null;
  preseleccionado: boolean;
  extras: Record<string, unknown>;
}

export interface UsuariosExternosResponse {
  success: boolean;
  items: UsuarioExternoRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  resumen: {
    nuevos: number;
    migrados: number;
    difieren: number;
    conflictos: number;
    /** Los que vienen tildados: los NUEVO que NO son cuenta de sistema. */
    preseleccionados: number;
  };
  fuentes: { origen: OrigenExternoUI; ok: boolean; reason: string | null }[];
}

export const apiUsuariosExternos = async (opts: {
  origen: OrigenExternoUI | "todos";
  filtro?: string;
  estadoComparacion?: EstadoComparacionUI | "todos";
  incluirDeshabilitados?: boolean;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<UsuariosExternosResponse> => {
  const params = new URLSearchParams();
  params.set("origen", opts.origen);
  if (opts.filtro) params.set("filtro", opts.filtro);
  if (opts.estadoComparacion) params.set("estadoComparacion", opts.estadoComparacion);
  if (opts.incluirDeshabilitados) params.set("incluirDeshabilitados", "true");
  params.set("page", String(opts.page ?? 1));
  params.set("pageSize", String(opts.pageSize ?? 25));
  return dbFetch(`/api/db/usuarios/externos?${params}`, { signal: opts.signal });
};

export interface ImportarUsuariosResult {
  success: boolean;
  dryRun: boolean;
  mensaje: string;
  total: number;
  creados: number;
  omitidos: number;
  errores: number;
  detalles: { username: string; estado: string; motivo?: string }[];
}

export const apiImportarUsuariosDB = async (payload: {
  origen: OrigenExternoUI;
  usernames: string[];
  conPreferencias: boolean;
  conRoles: boolean;
  dryRun?: boolean;
}): Promise<ImportarUsuariosResult> =>
  dbFetch("/api/db/usuarios/importar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
```

- [ ] **Step 2: Comentar los wrappers viejos**

En `src/services/api.ts`, comentar **el bloque entero** de `apiSyncUsuarios` (y su interface `SyncUsuariosResult`) y de `apiImportarUsuario` (y sus tipos `ImportarUsuarioReq` / `ImportarUsuarioResp`), con este encabezado arriba de cada uno:

```ts
// ⚠️ RETIRADO 2026-08-17 — reemplazado por apiImportarUsuariosDB.
// Pegaba al servicio /importarUsuario de GeneXus. Se deja comentado, no
// borrado: no se confirmó con el equipo de GeneXus si ese servicio hace algo
// más que crear el usuario (spec §10.3). Si aparece un efecto que nos estamos
// perdiendo, está acá para volver.
```

- [ ] **Step 3: Borrar el sync viejo**

```bash
git rm -r src/app/api/db/usuarios/sync
git rm src/components/dashboard/usuarios/SyncUsuariosModal.tsx
```

Antes de borrar el modal, **copiar el bloque del panel de resultados** (líneas 125-172: los contadores y el detalle de errores) — se recicla en la tarea 10.

- [ ] **Step 4: Actualizar la página de usuarios**

En `src/app/dashboard/usuarios/page.tsx`: sacar el import y el uso de `SyncUsuariosModal`, y cambiar el botón que lo abría por uno que navegue a `/dashboard/usuarios/importar`. Usar `useRouter` de `next/navigation` y el ícono `Download` de `lucide-react`.

- [ ] **Step 5: Verificar que compila y que no quedaron referencias**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

Run: `grep -rn "SyncUsuariosModal\|apiSyncUsuarios\|usuarios/sync" src/ --include=*.ts --include=*.tsx | grep -v "^src/services/api.ts.*//"`
Expected: sin salida (solo pueden quedar menciones dentro de comentarios).

- [ ] **Step 6: Commit**

```bash
git add -A src/services/api.ts src/app/dashboard/usuarios/page.tsx src/app/api/db/usuarios/sync src/components/dashboard/usuarios/SyncUsuariosModal.tsx
git commit -m "refactor(usuarios): wrappers de origenes externos, retiro del sync de GeneXus

Se van POST /api/db/usuarios/sync y SyncUsuariosModal. Con el endpoint se
va el bug que escribia desdeSistema como Char(1) ('S'/'N') sobre una
columna VarChar(10); las 9 filas ya sucias quedan como estan.

apiImportarUsuario y apiSyncUsuarios quedan COMENTADOS, no borrados: no
se confirmo si el /importarUsuario de GeneXus hace algo mas que crear el
usuario."
```

---

## Task 9: Combo nuevo en la pantalla de usuarios

**Files:**
- Modify: `src/components/dashboard/usuarios/Usuarios.tsx`
- Create: `src/components/dashboard/usuarios/importar/badges.tsx`

**Interfaces:**
- Consumes: `apiUsuariosExternos`, `apiImportarUsuariosDB` (Task 8).
- Produces: `BadgeOrigen({ origen })`, `BadgeComparacion({ estado })` desde `badges.tsx`.

- [ ] **Step 1: Crear los badges compartidos**

Crear `src/components/dashboard/usuarios/importar/badges.tsx`:

```tsx
import React from "react";
import { Badge } from "@/components/ui/badge";
import type { EstadoComparacionUI, OrigenExternoUI } from "@/services/api";

const ORIGEN_ESTILO: Record<string, { label: string; className: string }> = {
  SGM: { label: "SGM", className: "border-amber-500 text-amber-400" },
  LDAP: { label: "LDAP", className: "border-sky-500 text-sky-400" },
  GSIST: { label: "GSIST", className: "border-violet-500 text-violet-400" },
  LOCAL: { label: "Local", className: "border-blue-500 text-blue-400" },
};

export function BadgeOrigen({ origen }: { origen: OrigenExternoUI | string | null }) {
  const key = (origen || "").trim().toUpperCase();
  const estilo = ORIGEN_ESTILO[key];
  // Los 9 registros con desdeSistema en "N"/"S" (bug viejo del sync) caen acá.
  if (!estilo) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={estilo.className}>
      {estilo.label}
    </Badge>
  );
}

const COMPARACION_ESTILO: Record<EstadoComparacionUI, { label: string; variant: "success" | "secondary" | "outline" | "destructive"; className?: string }> = {
  NUEVO: { label: "Nuevo", variant: "success" },
  MIGRADO: { label: "Migrado", variant: "secondary" },
  DIFIERE: { label: "Difiere", variant: "outline", className: "border-amber-500 text-amber-400" },
  CONFLICTO: { label: "Conflicto", variant: "destructive" },
};

export function BadgeComparacion({ estado }: { estado: EstadoComparacionUI }) {
  const e = COMPARACION_ESTILO[estado];
  return (
    <Badge variant={e.variant} className={e.className}>
      {e.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Reescribir el filtro y el fetcher de `Usuarios.tsx`**

Cambios concretos:

1. Reemplazar el estado `tipoUsuario` por `modo`, con los cinco valores nuevos:

```tsx
  // "locales" | "ext:todos" | "ext:SGM" | "ext:LDAP" | "ext:GSIST"
  const [modo, setModo] = useState("locales");
```

2. Reemplazar `fetcherGeneXus` por `fetcherExternos`:

```tsx
  const fetcherExternos = async (opts: {
    origen: "todos" | "SGM" | "LDAP" | "GSIST";
    filtro: string;
    page: number;
    pageSize: number;
    signal?: AbortSignal;
  }) => {
    const res = await apiUsuariosExternos({
      origen: opts.origen,
      filtro: opts.filtro,
      estadoComparacion: "NUEVO",
      page: opts.page,
      pageSize: opts.pageSize,
      signal: opts.signal,
    });
    return { items: res.items as unknown as Record<string, unknown>[], total: res.total };
  };
```

En el modo "sin importar" la grilla principal muestra **solo los NUEVO**: los MIGRADO ya se ven en "Locales" y mostrarlos duplicados confunde. La comparación completa vive en el paso 2 del wizard.

3. En el `useEffect` de carga, reemplazar la rama `tipoUsuario === "sinImportar"` por:

```tsx
        if (modo.startsWith("ext:")) {
          const origen = modo.slice(4) as "todos" | "SGM" | "LDAP" | "GSIST";
          const { items, total: fetchedTotal } = await fetcherExternos({
            origen,
            filtro: debouncedSearch,
            page,
            pageSize,
            signal: ac.signal,
          });
          setRows(items.map((u) => ({ ...u, _source: "externo" as const })));
          setTotal(fetchedTotal);
        } else {
```

Y en las dependencias del efecto, cambiar `tipoUsuario` por `modo`.

4. Extender el tipo de fila:

```tsx
type UsuarioRow = {
  _source: "db" | "externo";
  [key: string]: unknown;
};
```

5. Ajustar los getters (`getUserName`, `getUserUsername`, `getUserEmail`, `getUserTelefono`, `getUserEstado`, `getUserId`) para la forma nueva: los externos ya vienen con `username`, `nombre`, `email` y `habilitado` en minúsculas, así que la rama `_source === "externo"` lee esos campos directo. `getUserId` devuelve `0` para externos (no tienen id local).

6. Reemplazar la columna `origen` por:

```tsx
    {
      id: "origen",
      header: "Origen",
      cell: ({ row }) =>
        row.original._source === "db" ? (
          <BadgeOrigen origen={row.original.desdeSistema as string | null} />
        ) : (
          <BadgeOrigen origen={row.original.origen as string} />
        ),
    },
```

7. Reemplazar `handleImportUser` por la versión que usa el endpoint propio:

```tsx
  const handleImportUser = async (user: UsuarioRow) => {
    const username = String(user.username || "");
    const origen = String(user.origen || "") as "SGM" | "LDAP" | "GSIST";
    if (!username || !origen) return;
    try {
      setImportingUsers((prev) => new Set(prev).add(username));
      const res = await apiImportarUsuariosDB({
        origen,
        usernames: [username],
        conPreferencias: true,
        conRoles: true,
      });
      if (res.creados === 1) {
        toast.success(`Usuario ${username} importado`);
        setRows((prev) => prev.filter((r) => r.username !== username));
      } else {
        toast.error(res.detalles[0]?.motivo || "No se pudo importar");
      }
    } catch (error) {
      toast.error("Error al importar: " + (error as Error).message);
    } finally {
      setImportingUsers((prev) => {
        const s = new Set(prev);
        s.delete(username);
        return s;
      });
    }
  };
```

Cambiar el tipo de `importingUsers` a `Set<string>` y borrar el estado `importedUsers` (las filas importadas ahora desaparecen de la grilla).

8. Reemplazar el `<Select>` del tipo:

```tsx
      <Select value={modo} onValueChange={(v) => { setModo(v); setPage(1); }}>
        <SelectTrigger className="w-56">
          {{
            locales: "Locales (PostgreSQL)",
            "ext:todos": "Sin importar — todos",
            "ext:SGM": "Sin importar — SGM",
            "ext:LDAP": "Sin importar — LDAP",
            "ext:GSIST": "Sin importar — ADMSEC/GSIST",
          }[modo] ?? "Locales (PostgreSQL)"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="locales">Locales (PostgreSQL)</SelectItem>
          <SelectItem value="ext:todos">Sin importar — todos</SelectItem>
          <SelectItem value="ext:SGM">Sin importar — SGM</SelectItem>
          <SelectItem value="ext:LDAP">Sin importar — LDAP</SelectItem>
          <SelectItem value="ext:GSIST">Sin importar — ADMSEC/GSIST</SelectItem>
        </SelectContent>
      </Select>
```

9. En `headerActions`, agregar el botón de importación masiva antes del de "Nuevo Usuario":

```tsx
      {modo.startsWith("ext:") && (
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/usuarios/importar?origen=${modo.slice(4)}`)}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Importación masiva
        </Button>
      )}
```

10. En `shouldShowImportButton`, cambiar la condición a `user._source === "externo" && user.estadoComparacion === "NUEVO"`. Y en la columna de acciones, ocultar los botones de editar y borrar cuando `_source === "externo"` (no tienen fila local que editar).

- [ ] **Step 3: Verificar que compila y arranca**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

Run: `pnpm dev` y abrir `http://localhost:4005/dashboard/usuarios`
Expected: el combo muestra las 5 opciones; "Sin importar — SGM" lista 94 usuarios; "Locales" sigue andando como antes.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/usuarios/
git commit -m "feat(usuarios): combo de origenes externos en la pantalla de usuarios

Se van 'Todos (DB)' (era la MISMA consulta que 'Locales', misma rama del
if) y 'Sin importar (GX)'. Entran cinco opciones: Locales y los tres
origenes por separado, mas 'sin importar - todos'.

El boton Importar de cada fila ahora crea en la PG propia en vez de
llamar al /importarUsuario de GeneXus. En modo externo la grilla muestra
solo los NUEVO: los migrados ya estan en 'Locales'."
```

---

## Task 10: Pantalla de importación masiva

**Files:**
- Create: `src/app/dashboard/usuarios/importar/page.tsx`
- Create: `src/components/dashboard/usuarios/importar/PasoOrigen.tsx`
- Create: `src/components/dashboard/usuarios/importar/PasoComparacion.tsx`
- Create: `src/components/dashboard/usuarios/importar/ResultadoImport.tsx`

**Interfaces:**
- Consumes: `apiUsuariosExternos`, `apiImportarUsuariosDB` (Task 8); `BadgeComparacion`, `BadgeOrigen` (Task 9).
- Produces: la pantalla. Nada que consuman otras tareas.

- [ ] **Step 1: Panel de resultado**

Crear `src/components/dashboard/usuarios/importar/ResultadoImport.tsx` con el bloque rescatado de `SyncUsuariosModal` (contadores + detalle), adaptado a `creados / omitidos / errores`:

```tsx
"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ImportarUsuariosResult } from "@/services/api";

export default function ResultadoImport({ result }: { result: ImportarUsuariosResult }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {result.errores === 0 ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
        )}
        <span className="font-medium text-sm">{result.mensaje}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-green-600">{result.creados}</span>
          <span className="text-xs text-muted-foreground mt-1">Creados</span>
        </div>
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-blue-600">{result.omitidos}</span>
          <span className="text-xs text-muted-foreground mt-1">Omitidos</span>
        </div>
        <div className="flex flex-col items-center rounded-md bg-muted p-3">
          <span className="text-2xl font-bold text-red-600">{result.errores}</span>
          <span className="text-xs text-muted-foreground mt-1">Errores</span>
        </div>
      </div>

      {result.detalles?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Detalle
          </p>
          <div className="max-h-60 overflow-y-auto space-y-1 rounded border p-2 bg-muted/40">
            {result.detalles.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <XCircle
                  className={`w-3 h-3 mt-0.5 shrink-0 ${d.estado === "error" ? "text-red-500" : "text-blue-500"}`}
                />
                <span>
                  <span className="font-mono font-medium">{d.username}</span>
                  {" — "}
                  <span className="text-muted-foreground break-all">{d.motivo || d.estado}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Paso 1 — origen y opciones**

Crear `src/components/dashboard/usuarios/importar/PasoOrigen.tsx`:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Network, Server, Smartphone } from "lucide-react";
import { apiUsuariosExternos, type OrigenExternoUI } from "@/services/api";

export interface OpcionesImport {
  origen: OrigenExternoUI;
  filtro: string;
  incluirDeshabilitados: boolean;
  conPreferencias: boolean;
  conRoles: boolean;
}

const CARDS: { key: OrigenExternoUI; label: string; detalle: string; Icon: typeof Smartphone }[] = [
  { key: "SGM", label: "SGM", detalle: "Usuarios móviles (GXICAGEO.USUMOBILE)", Icon: Smartphone },
  { key: "LDAP", label: "LDAP", detalle: "Validan contra Active Directory", Icon: Network },
  { key: "GSIST", label: "ADMSEC / GSIST", detalle: "Clave propia en ADMSEC", Icon: Server },
];

/** Traduce el `reason` técnico de la fuente a algo que el operador entienda. */
function motivoLegible(reason: string | null): string {
  if (reason === "NO_SERVICE_ACCOUNT") return "Requiere cuenta de servicio de Active Directory";
  if (reason === "SIN_USERS_API_KEY") return "Falta configurar USERS_API_KEY";
  if (reason === "SIN_AS400_API_URL") return "Falta configurar AS400_API_URL";
  return "No disponible";
}

export default function PasoOrigen({
  opciones,
  onChange,
  onContinuar,
}: {
  opciones: OpcionesImport;
  onChange: (o: OpcionesImport) => void;
  onContinuar: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [estadoFuentes, setEstadoFuentes] = useState<
    Record<string, { ok: boolean; reason: string | null; nuevos: number }>
  >({});

  // Al montar, una consulta por origen para saber disponibilidad y cuántos faltan.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setCargando(true);
        const res = await Promise.all(
          CARDS.map((c) =>
            apiUsuariosExternos({
              origen: c.key,
              estadoComparacion: "NUEVO",
              pageSize: 1,
              signal: ac.signal,
            })
              .then((r) => ({
                key: c.key,
                ok: r.fuentes[0]?.ok ?? true,
                reason: r.fuentes[0]?.reason ?? null,
                nuevos: r.total,
              }))
              .catch(() => ({ key: c.key, ok: false, reason: null, nuevos: 0 })),
          ),
        );
        setEstadoFuentes(
          Object.fromEntries(res.map((r) => [r.key, { ok: r.ok, reason: r.reason, nuevos: r.nuevos }])),
        );
      } finally {
        setCargando(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const esSgm = opciones.origen === "SGM";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map(({ key, label, detalle, Icon }) => {
          const estado = estadoFuentes[key];
          const deshabilitada = estado ? !estado.ok : false;
          const elegida = opciones.origen === key;
          return (
            <button
              key={key}
              type="button"
              disabled={deshabilitada}
              onClick={() => onChange({ ...opciones, origen: key })}
              className={`rounded-lg border p-4 text-left transition ${
                elegida ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              } ${deshabilitada ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{detalle}</p>
              <div className="mt-3 text-sm">
                {cargando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : deshabilitada ? (
                  <span className="text-amber-500 text-xs">{motivoLegible(estado?.reason ?? null)}</span>
                ) : (
                  <span>
                    <span className="text-2xl font-bold">{estado?.nuevos ?? 0}</span>
                    <span className="text-muted-foreground text-xs ml-1">sin importar</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="filtro-origen">Filtrar</Label>
          <Input
            id="filtro-origen"
            placeholder="Usuario, nombre o email"
            value={opciones.filtro}
            onChange={(e) => onChange({ ...opciones, filtro: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Incluir deshabilitados</p>
            <p className="text-xs text-muted-foreground">Usuarios dados de baja en el sistema origen</p>
          </div>
          <Switch
            checked={opciones.incluirDeshabilitados}
            onCheckedChange={(v) => onChange({ ...opciones, incluirDeshabilitados: v })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Traer preferencias</p>
            <p className="text-xs text-muted-foreground">
              {esSgm
                ? "Escenario y Empresa Fletera desde la agencia del usuario"
                : "Solo aplica a usuarios de SGM"}
            </p>
          </div>
          <Switch
            disabled={!esSgm}
            checked={esSgm && opciones.conPreferencias}
            onCheckedChange={(v) => onChange({ ...opciones, conPreferencias: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Asignar roles</p>
            <p className="text-xs text-muted-foreground">
              Según los grupos que el usuario tenga en el sistema origen
            </p>
          </div>
          <Switch
            checked={opciones.conRoles}
            onCheckedChange={(v) => onChange({ ...opciones, conRoles: v })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onContinuar} disabled={cargando || estadoFuentes[opciones.origen]?.ok === false}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Paso 2 — la grilla comparativa**

Crear `src/components/dashboard/usuarios/importar/PasoComparacion.tsx`. Lo delicado acá es la selección: alcanza **todo el filtro**, no la página, así que no se puede guardar un `Set` de lo tildado — hay que guardar el modo y las **excepciones**.

```tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  apiImportarUsuariosDB,
  apiUsuariosExternos,
  type EstadoComparacionUI,
  type ImportarUsuariosResult,
  type UsuarioExternoRow,
} from "@/services/api";
import { BadgeComparacion, BadgeOrigen } from "./badges";
import type { OpcionesImport } from "./PasoOrigen";

const CHIPS: { key: EstadoComparacionUI | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "NUEVO", label: "Nuevos" },
  { key: "MIGRADO", label: "Migrados" },
  { key: "DIFIERE", label: "Difieren" },
  { key: "CONFLICTO", label: "Conflictos" },
];

/** Solo los NUEVO se pueden importar; los CONFLICTO reventarían el insert. */
function esImportable(u: UsuarioExternoRow): boolean {
  return u.estadoComparacion === "NUEVO";
}

export default function PasoComparacion({
  opciones,
  onImportado,
}: {
  opciones: OpcionesImport;
  onImportado: (r: ImportarUsuariosResult) => void;
}) {
  const [rows, setRows] = useState<UsuarioExternoRow[]>([]);
  const [resumen, setResumen] = useState({
    nuevos: 0,
    migrados: 0,
    difieren: 0,
    conflictos: 0,
    preseleccionados: 0,
  });
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoComparacionUI | "todos">("NUEVO");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [importando, setImportando] = useState(false);

  // Modelo de selección: guardar lo tildado no sirve — son 429 filas en 18
  // páginas y en pantalla solo está una. Se guarda el MODO más dos conjuntos
  // de excepciones, que se mantienen disjuntos:
  //   excluidos → filas que VENÍAN preseleccionadas y el operador destildó
  //   incluidos → filas que NO venían preseleccionadas y el operador tildó
  //               (el caso de las cuentas de sistema, que se pueden importar
  //                pero no vienen marcadas)
  const [todoElFiltro, setTodoElFiltro] = useState(true);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set());

  const estaTildado = useCallback(
    (u: UsuarioExternoRow) => {
      if (!esImportable(u)) return false;
      if (!todoElFiltro) return incluidos.has(u.username);
      if (u.preseleccionado) return !excluidos.has(u.username);
      return incluidos.has(u.username);
    },
    [todoElFiltro, excluidos, incluidos],
  );

  // `preseleccionados`, NO `nuevos`: las cuentas de sistema son NUEVO pero
  // arrancan destildadas, así que contarlas prometería importar de más.
  // Los dos conjuntos son disjuntos, por eso se suman sin miedo a duplicar.
  const cantidadSeleccionada = todoElFiltro
    ? Math.max(0, resumen.preseleccionados - excluidos.size) + incluidos.size
    : incluidos.size;

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setCargando(true);
        const res = await apiUsuariosExternos({
          origen: opciones.origen,
          filtro: opciones.filtro,
          estadoComparacion: estadoFiltro,
          incluirDeshabilitados: opciones.incluirDeshabilitados,
          page,
          pageSize,
          signal: ac.signal,
        });
        setRows(res.items);
        setTotal(res.total);
        setResumen(res.resumen);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          toast.error("Error cargando la comparación: " + (e as Error).message);
        }
      } finally {
        setCargando(false);
      }
    })();
    return () => ac.abort();
  }, [opciones, estadoFiltro, page, pageSize]);

  const alternarFila = (u: UsuarioExternoRow, tildar: boolean) => {
    // Con "todo el filtro" activo, una fila que venía preseleccionada se mueve
    // en `excluidos`; una que NO venía (cuenta de sistema) se mueve en
    // `incluidos`. Así los dos conjuntos nunca se pisan y el contador cierra.
    const usaExcluidos = todoElFiltro && u.preseleccionado;
    const setter = usaExcluidos ? setExcluidos : setIncluidos;
    const agregaAlTildar = !usaExcluidos;

    setter((prev) => {
      const s = new Set(prev);
      if (tildar === agregaAlTildar) s.add(u.username);
      else s.delete(u.username);
      return s;
    });
  };

  /**
   * Junta los usernames a importar. Con `todoElFiltro` hay que traerlos todos
   * del servidor, porque en pantalla solo está la página actual.
   */
  const resolverUsernames = async (): Promise<string[]> => {
    if (!todoElFiltro) return [...incluidos];

    const TAMANIO = 500;
    const acumulado: string[] = [];
    let pagina = 1;
    for (;;) {
      const res = await apiUsuariosExternos({
        origen: opciones.origen,
        filtro: opciones.filtro,
        estadoComparacion: "NUEVO",
        incluirDeshabilitados: opciones.incluirDeshabilitados,
        page: pagina,
        pageSize: TAMANIO,
      });
      acumulado.push(
        ...res.items
          .filter((u) =>
            u.preseleccionado ? !excluidos.has(u.username) : incluidos.has(u.username),
          )
          .map((u) => u.username),
      );
      if (pagina >= res.totalPages || res.items.length === 0) break;
      pagina++;
    }
    return acumulado;
  };

  const importar = async () => {
    setImportando(true);
    try {
      const usernames = await resolverUsernames();
      if (usernames.length === 0) {
        toast.warning("No hay usuarios seleccionados");
        return;
      }
      const res = await apiImportarUsuariosDB({
        origen: opciones.origen,
        usernames,
        conPreferencias: opciones.origen === "SGM" && opciones.conPreferencias,
        conRoles: opciones.conRoles,
      });
      onImportado(res);
    } catch (e) {
      toast.error("Error importando: " + (e as Error).message);
    } finally {
      setImportando(false);
      setConfirmando(false);
    }
  };

  const columns: ColumnDef<UsuarioExternoRow, unknown>[] = [
    {
      id: "sel",
      header: () => (
        <Checkbox
          checked={todoElFiltro}
          onCheckedChange={(v) => {
            setTodoElFiltro(Boolean(v));
            setExcluidos(new Set());
            setIncluidos(new Set());
          }}
          aria-label="Seleccionar todos los del filtro"
        />
      ),
      cell: ({ row }) => {
        const u = row.original;
        if (u.estadoComparacion === "CONFLICTO") {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Checkbox disabled aria-label="No importable" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                El email ya lo tiene el usuario «{u.conflictoCon}»
              </TooltipContent>
            </Tooltip>
          );
        }
        return (
          <Checkbox
            disabled={!esImportable(u)}
            checked={estaTildado(u)}
            onCheckedChange={(v) => alternarFila(u, Boolean(v))}
            aria-label={`Seleccionar ${u.username}`}
          />
        );
      },
    },
    {
      id: "usuario",
      header: "Usuario",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-sm font-medium">{row.original.username}</div>
          {row.original.nombre && (
            <div className="text-sm text-muted-foreground">{row.original.nombre}</div>
          )}
          {row.original.esCuentaSistema && (
            <Badge variant="outline" className="mt-1 border-amber-500 text-amber-400 text-[10px]">
              cuenta de sistema
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => row.original.email || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "origen",
      header: "Origen",
      cell: ({ row }) => <BadgeOrigen origen={row.original.origen} />,
    },
    {
      id: "estadoOrigen",
      header: "En el origen",
      cell: ({ row }) => (
        <Badge variant={row.original.habilitado ? "success" : "secondary"}>
          {row.original.habilitado ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "comparacion",
      header: "Comparación",
      cell: ({ row }) => <BadgeComparacion estado={row.original.estadoComparacion} />,
    },
    {
      id: "diffs",
      header: "Diferencias",
      cell: ({ row }) => {
        const d = row.original.diffs;
        if (!d?.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="space-y-0.5 text-xs">
            {d.map((x, i) => (
              <div key={i}>
                <span className="font-medium">{x.campo}:</span>{" "}
                <span className="text-muted-foreground">{x.local ?? "—"}</span>
                {" → "}
                <span>{x.externo ?? "—"}</span>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(({ key, label }) => {
          const n =
            key === "todos"
              ? resumen.nuevos + resumen.migrados + resumen.difieren + resumen.conflictos
              : key === "NUEVO"
                ? resumen.nuevos
                : key === "MIGRADO"
                  ? resumen.migrados
                  : key === "DIFIERE"
                    ? resumen.difieren
                    : resumen.conflictos;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setEstadoFiltro(key); setPage(1); }}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                estadoFiltro === key ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="font-semibold">{n}</span> {label}
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={cargando}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        emptyTitle="Sin resultados"
        emptyDescription="No hay usuarios con los filtros actuales."
        pageSizeOptions={[25, 50, 100]}
      />

      <div className="flex justify-end">
        <Button onClick={() => setConfirmando(true)} disabled={cantidadSeleccionada === 0 || importando}>
          {importando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" />Importar {cantidadSeleccionada} usuarios</>
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={`¿Importar ${cantidadSeleccionada} usuarios desde ${opciones.origen}?`}
        description={
          `Se van a crear ${cantidadSeleccionada} usuarios nuevos. Los que ya existen no se tocan. ` +
          `Preferencias: ${opciones.origen === "SGM" && opciones.conPreferencias ? "sí" : "no"}. ` +
          `Roles por grupo: ${opciones.conRoles ? "sí" : "no"}.`
        }
        confirmLabel="Importar"
        onConfirm={importar}
        loading={importando}
      />
    </div>
  );
}
```

Dos cosas ya verificadas contra el repo, para que nadie las vuelva a chequear: `ConfirmDialogProps` es exactamente `{ open, onOpenChange, title, description?, confirmLabel?, cancelLabel?, tone?, icon?, onConfirm, loading? }`, y **`Tooltip` ya se envuelve solo en `TooltipProvider`** (`src/components/ui/tooltip.tsx:25`), así que no hace falta agregar un provider.

- [ ] **Step 4: La página**

Crear `src/app/dashboard/usuarios/importar/page.tsx`: `PageHeader` con `title="Importar usuarios"`, `icon={Download}`, un estado `paso: 1 | 2 | 3`, y el origen inicial leído de `useSearchParams().get("origen")`. Envolver en `<Suspense>` porque `useSearchParams` lo requiere en el App Router.

- [ ] **Step 5: Verificar en el browser**

Run: `pnpm dev`, ir a `/dashboard/usuarios/importar`

Verificar:
- Las tres cards muestran contadores (SGM 94, LDAP 312, GSIST 23 nuevos).
- Elegir LDAP → los switches se ven, el de preferencias deshabilitado con su explicación.
- Paso 2: los chips suman 429 en "todos"; clickear "Conflictos" filtra.
- Tildar el header → el botón dice "Importar 312 usuarios".
- Destildar dos → dice 310.
- Una fila CONFLICTO (si hay) no se deja tildar.
- `ROOT` en GSIST viene destildado y con su badge.

- [ ] **Step 6: Sacar capturas**

Guardar capturas del paso 1 y del paso 2 con datos reales. Son parte del entregable: el usuario pidió explícitamente validar la UI con capturas y no mostrar pantallas a medio hacer.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/usuarios/importar src/components/dashboard/usuarios/importar
git commit -m "feat(usuarios): pantalla de importacion masiva con grilla comparativa

Wizard de dos pasos que reemplaza al SyncUsuariosModal (que pedia el
sistema origen en un input de texto libre y ejecutaba sin mostrar nada).

Paso 1: cards por origen con disponibilidad, filtros y los dos switches
(preferencias / roles), encendidos por defecto.
Paso 2: grilla paginada del servidor con el estado de comparacion por
fila, los diffs campo por campo, y seleccion que alcanza TODO el filtro
y no solo la pagina. Los CONFLICTO no se pueden tildar y las cuentas de
sistema vienen destildadas."
```

---

## Task 11: Verificación end-to-end y deploy a dev

**Files:** ninguno. Es la verificación del conjunto.

- [ ] **Step 1: Correr todo lo automatizable**

```bash
pnpm test:usuarios-comparacion
pnpm test:docs-guard
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Expected: los cinco en verde. `pnpm build` es el que importa: valida que las rutas nuevas compilan en el App Router.

- [ ] **Step 2: Verificar los números contra dev**

Con `pnpm dev` y sesión iniciada, confirmar que `/api/db/usuarios/externos` devuelve:

| Consulta | Esperado |
|---|---|
| `?origen=SGM&estadoComparacion=NUEVO` | `total` 94, `resumen.migrados` 825 |
| `?origen=LDAP&estadoComparacion=NUEVO` | `total` 312, `resumen.migrados` **14** |
| `?origen=GSIST&estadoComparacion=NUEVO` | `total` 23, `resumen.migrados` 0 |
| `?origen=todos&estadoComparacion=NUEVO` | `total` 429 |

Si LDAP da 326 nuevos y 0 migrados, **parar**: el match volvió a ser case-sensitive y el import va a crear 14 duplicados.

- [ ] **Step 3: Import real de un lote chico**

Importar 5 usuarios NUEVO de SGM desde la pantalla, con los dos switches encendidos. Verificar en la base:

```bash
pnpm exec tsx -e "
import p from './src/lib/prisma';
p.usuario.findMany({
  where: { creadoPor: { startsWith: 'import:' } },
  select: { username: true, password: true, desdeSistema: true, esExterno: true, tipoUsuario: true, creadoPor: true, preferencias: { select: { atributo: true } } },
}).then(u => { console.log(JSON.stringify(u, null, 2)); return p.\$disconnect(); });
"
```

Expected: 5 filas (más el de la tarea 6), todas con `password: ""`, `desdeSistema: "SGM"`, `esExterno: "S"`, `tipoUsuario: "E"`, y preferencia `Escenario`.

- [ ] **Step 4: Verificar que un importado puede loguearse**

Entrar a secapi con uno de los usuarios SGM importados y su clave de SGM.
Expected: entra (valida contra USUMOBILE, no contra la clave local vacía).

Y probar con clave vacía o cualquier otra: no entra.

- [ ] **Step 5: Verificar que no rompimos nada**

- `/dashboard/usuarios` en modo "Locales" lista los 854+ de siempre.
- El login normal (usuario local, usuario SGM ya migrado, usuario LDAP ya migrado) sigue andando.
- `/api/ficha` del `as400-api` sigue respondiendo.

- [ ] **Step 6: Deploy a dev**

Correr el Custom Command **secapi-dev** desde Webmin (`https://node-dev.glp.riogas.com.uy:12321` → Custom Commands), que hace `git fetch` + `checkout -f -B dev origin/dev` + `pnpm install --frozen-lockfile` + build + `pm2 restart`.

⚠️ Si se tocó `as400-api`, ese proceso pm2 se reinicia aparte: `su - node -c "pm2 restart as400-api"`. Y hay que confirmar que `USERS_API_KEY` está en los dos `.env` del server antes de reiniciar.

- [ ] **Step 7: Verificar en dev**

Abrir `https://secapi-dev.glp.riogas.com.uy/dashboard/usuarios/importar` y repetir los chequeos del step 2 contra el server.

- [ ] **Step 8: Commit final y push**

```bash
git push origin dev
```

**No mergear a `main`.** El usuario decide cuándo va a prod.

---

## Notas para quien ejecute

**Lo que más fácil se rompe:** el match case-insensitive. Los 14 usuarios de ADMSEC que ya están migrados son la única evidencia de que funciona, y se detecta en un solo lugar: `resumen.migrados` del origen LDAP. Si en algún momento da 0, hay duplicados en camino.

**Lo que parece un bug y no lo es:** que los 312 usuarios de LDAP no tengan nombre ni email. `ADMSEC.USUARIOS` no tiene esas columnas — no es que la query se olvidó de pedirlas. Se completan solos en el primer login (tarea 7).

**Lo que NO hay que hacer:**
- Reconstruir el nombre con `PRESUDB.FUNCIONARIO`. Ya se probó: 197 logins comparten 70 `FUNID` y devuelve el nombre de otra persona. Esa tabla además tiene sueldos.
- Hacer que el import actualice usuarios existentes. Solo crea.
- Normalizar las 9 filas con `desdeSistema` en `"N"`/`"S"`. Están fuera de alcance por decisión explícita.
- Tocar `as400-api` antes de que `/api/ficha` esté commiteado.
