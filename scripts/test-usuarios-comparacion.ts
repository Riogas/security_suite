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
    // email: null a propósito — si hereda el email default (igual al de
    // local()) esto deja de ser un NUEVO sin más y pasa a ser el caso de
    // conflicto de email que se prueba aparte más abajo.
    const r = uno([externo({ username: "nuevo", email: null })], [local()]);
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
    // email: null por la misma razón que en el caso anterior.
    const r = uno([externo({ username: "ROOT", esCuentaSistema: true, email: null })], [local()]);
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
