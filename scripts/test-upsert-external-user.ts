/*
 * ============================================================================
 * upsertExternalUser — la rama que decide si una fila CAMBIA DE DUEÑO
 * ============================================================================
 *
 * Esta función corre en el login de las cuatro aplicaciones, cada vez que entra
 * un usuario de una fuente externa (SGM, GSIST o LDAP). Casi siempre hace un
 * upsert por username y listo. Lo que se prueba acá es la OTRA rama: la del
 * conflicto de email, que es la única que toma una fila que ya existe y le
 * escribe encima el username y la clave del que viene de afuera.
 *
 * Por qué merece test propio: esa fila conserva sus `usuario_roles`. Desde que
 * ser root ES tener el rol Root, re-vincular sobre la fila de un root equivale
 * a regalarle la cuenta —roles incluidos— a quien controle una cuenta de AD con
 * el mismo mail. El test fija que eso no pase, y fija también que el caso
 * legítimo (una persona común, sin roles, que se migra de sistema) siga
 * andando: si se rompe eso, alguien queda afuera del sistema en el login y sin
 * explicación.
 *
 * No toca la base: se le inyecta un doble por el parámetro `cliente`.
 */
import { upsertExternalUser, type ClienteUpsert } from "@/lib/auth/upsertExternalUser";

let ok = 0;
let fallidos = 0;
const nombresFallidos: string[] = [];

async function test(nombre: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
    ok += 1;
  } catch (e) {
    console.log(`  ✗ ${nombre}`);
    console.log(`      ${(e as Error).message}`);
    fallidos += 1;
    nombresFallidos.push(nombre);
  }
}

function esperar(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** El P2002 de Prisma sobre la columna email, tal cual lo tira el cliente. */
function conflictoDeEmail() {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target: ["email"] },
  });
}

const ENTRADA = {
  username: "ATACANTE",
  nombre: "Juan Perez",
  email: "dmedaglia@riogas.com.uy",
  password: "loquesea",
  desdeSistema: "LDAP" as const,
};

/**
 * Doble del cliente. `rolesDeLaFila` es lo que devuelve el count, y `updates`
 * registra si se llegó a escribir — que es lo único que importa acá.
 */
function doble(opciones: {
  filaExistente: Record<string, unknown> | null;
  rolesDeLaFila: number;
  upsertFalla?: boolean;
}) {
  const updates: Array<any> = [];
  const cuentasPedidas: Array<any> = [];
  const cliente = {
    usuario: {
      upsert: async (args: any) => {
        if (opciones.upsertFalla) throw conflictoDeEmail();
        return { id: 999, username: args.where.username } as any;
      },
      findUnique: async () => opciones.filaExistente as any,
      update: async (args: any) => {
        updates.push(args);
        return { id: 1, ...args.data } as any;
      },
    },
    usuarioRol: {
      count: async (args: any) => {
        cuentasPedidas.push(args);
        return opciones.rolesDeLaFila;
      },
    },
  } as unknown as ClienteUpsert;
  return { cliente, updates, cuentasPedidas };
}

const FILA_ROOT = {
  id: 845,
  username: "dmedaglia",
  estado: "A",
  nombre: "Diego",
  apellido: "Medaglia Rivera",
};

async function main() {
  console.log("\nupsertExternalUser — conflicto de email\n");

  await test("el camino feliz no toca la rama de conflicto: ni cuenta roles", async () => {
    const d = doble({ filaExistente: null, rolesDeLaFila: 0 });
    const u = await upsertExternalUser(ENTRADA, d.cliente);
    esperar(u.id === 999, "tenía que devolver lo que dio el upsert");
    esperar(d.cuentasPedidas.length === 0, "no puede consultar usuario_roles en el camino feliz");
    esperar(d.updates.length === 0, "no puede escribir sobre otra fila en el camino feliz");
  });

  await test("NO se re-vincula sobre una fila CON roles: corta el login", async () => {
    const d = doble({ filaExistente: FILA_ROOT, rolesDeLaFila: 4, upsertFalla: true });
    let tiro = false;
    try {
      await upsertExternalUser(ENTRADA, d.cliente);
    } catch {
      tiro = true;
    }
    esperar(tiro, "tenía que cortar el login, no devolver un usuario");
    esperar(
      d.updates.length === 0,
      "NO puede haber escrito: es la fila de un root cambiando de dueño",
    );
  });

  await test("cuenta los roles de la fila EXISTENTE, no los del que entra", async () => {
    const d = doble({ filaExistente: FILA_ROOT, rolesDeLaFila: 1, upsertFalla: true });
    try {
      await upsertExternalUser(ENTRADA, d.cliente);
    } catch {
      /* esperado */
    }
    esperar(d.cuentasPedidas.length === 1, "tenía que consultar una vez");
    esperar(
      d.cuentasPedidas[0]?.where?.usuarioId === FILA_ROOT.id,
      `tenía que contar los roles de la fila ${FILA_ROOT.id}, no de otra`,
    );
  });

  await test("UN solo rol ya alcanza para cortar (el umbral es 'tiene roles', no 'es root')", async () => {
    const d = doble({
      filaExistente: { ...FILA_ROOT, id: 300, username: "operador" },
      rolesDeLaFila: 1,
      upsertFalla: true,
    });
    let tiro = false;
    try {
      await upsertExternalUser(ENTRADA, d.cliente);
    } catch {
      tiro = true;
    }
    esperar(tiro, "una fila con un rol tampoco se re-vincula");
    esperar(d.updates.length === 0, "no puede haber escrito");
  });

  await test("el caso legítimo SIGUE andando: fila sin roles se re-vincula", async () => {
    const fila = { id: 500, username: "12345678", estado: "A", nombre: "Ana", apellido: "Gomez" };
    const d = doble({ filaExistente: fila, rolesDeLaFila: 0, upsertFalla: true });
    const u = await upsertExternalUser(ENTRADA, d.cliente);
    esperar(d.updates.length === 1, "tenía que re-vincular: la fila no tiene roles");
    esperar(
      d.updates[0]?.where?.id === 500,
      "tenía que actualizar la fila existente",
    );
    esperar(
      (d.updates[0]?.data as any)?.username === "ATACANTE",
      "el re-vínculo escribe el username nuevo, que es su razón de ser",
    );
    esperar((u as any).username === "ATACANTE", "devuelve la fila re-vinculada");
  });

  await test("la fila INACTIVA sigue cortando antes de contar roles", async () => {
    const d = doble({
      filaExistente: { ...FILA_ROOT, estado: "I" },
      rolesDeLaFila: 0,
      upsertFalla: true,
    });
    let tiro = false;
    try {
      await upsertExternalUser(ENTRADA, d.cliente);
    } catch {
      tiro = true;
    }
    esperar(tiro, "una fila inactiva no se re-vincula");
    esperar(
      d.cuentasPedidas.length === 0,
      "el chequeo de inactivo va ANTES: no hace falta pagar la consulta de roles",
    );
  });

  await test("un error que NO es conflicto de email se propaga tal cual", async () => {
    const d = doble({ filaExistente: FILA_ROOT, rolesDeLaFila: 0 });
    const cliente = {
      ...d.cliente,
      usuario: {
        ...d.cliente.usuario,
        upsert: async () => {
          throw new Error("la base no contesta");
        },
      },
    } as unknown as ClienteUpsert;
    let mensaje = "";
    try {
      await upsertExternalUser(ENTRADA, cliente);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    esperar(mensaje === "la base no contesta", `se comió el error original: "${mensaje}"`);
  });

  console.log(
    `\n${ok} ok, ${fallidos} fallidos${fallidos ? ": " + nombresFallidos.join(", ") : ""}\n`,
  );
  if (fallidos > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
