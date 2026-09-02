/**
 * scripts/sync-admsec.ts
 *
 * El job horario ADMSEC → secapi. Hace DOS cosas y nada más (spec 3.1 y 3.3 de
 * docs/superpowers/specs/2026-09-01-sync-usuarios-admsec-design.md):
 *
 *   Regla A. Si un usuario de ADMSEC.USUARIOS no está en la Postgres de secapi,
 *            lo importa (sin roles, sin preferencias).
 *   Regla B. Si está, y su USUDTUPD es más nueva que la marca de la última
 *            corrida OK, y el estado difiere, le actualiza SOLO el estado.
 *
 * No toca roles, ni esRoot, ni fechaBaja, ni el AS400, ni SGM, y no desactiva a
 * nadie por ausencia en el origen.
 *
 * ── Cómo se corre ───────────────────────────────────────────────────────────
 *
 *   pnpm exec tsx scripts/sync-admsec.ts              # seco (default)
 *   pnpm exec tsx scripts/sync-admsec.ts --dry-run    # seco, explícito
 *   pnpm exec tsx scripts/sync-admsec.ts --escribir   # escribe en `usuarios`
 *
 * Sin flags manda la env `SYNC_ADMSEC_ESCRIBE`: solo el valor "si" escribe,
 * cualquier otra cosa (o ausente) es corrida en seco. El default es seco a
 * propósito: dev y prod apuntan a la MISMA Postgres de producción (spec 2.5),
 * así que una corrida de prueba desde el repo escribe en el padrón real.
 *
 * En automático va por pm2 con `cron_restart: "0 * * * *"` y `autorestart:
 * false` (spec 5). El registro de lo que hizo es la fila en
 * `sync_admsec_corridas` más el log de pm2.
 *
 * Códigos de salida: 0 si la corrida terminó OK (o si había otra en curso),
 * 1 si quedó FALLIDA.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import type { ExternalUser } from "../src/lib/usuarios/tipos";
import type {
  AccionSync,
  FilaLocalSync,
  FilaOrigenSync,
} from "../src/lib/usuarios/syncAdmsec";

// ─── Entorno ────────────────────────────────────────────────────────────────
// En producción no hay .env: el entorno lo inyecta pm2 (spec 5). Acá se carga
// el del repo solo si existe, para poder correr a mano en dev.

function cargarEnv(): void {
  const envLocal = path.resolve(process.cwd(), ".env.local");
  const env = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  else if (fs.existsSync(env)) dotenv.config({ path: env });
}

// ─── Modo ───────────────────────────────────────────────────────────────────

function resolverModo(argv: string[]): { escribe: boolean } {
  // --dry-run se mira primero: si alguien pasa los dos flags, gana el que no
  // escribe.
  if (argv.includes("--dry-run")) return { escribe: false };
  if (argv.includes("--escribir")) return { escribe: true };
  return {
    escribe: (process.env.SYNC_ADMSEC_ESCRIBE || "").trim().toLowerCase() === "si",
  };
}

// ─── El reloj del origen ────────────────────────────────────────────────────
/** Ancho exacto de 'YYYY-MM-DD HH:MM:SS.ffffff'. */
const LARGO_MARCA = 26;

/**
 * La marca de la corrida es el `CURRENT TIMESTAMP` del propio AS400, que viene
 * en la misma respuesta que las filas (campo `reloj` de /admsec/list).
 *
 * NO se usa la USUDTUPD más alta de las filas, aunque sea tentador porque no
 * necesita nada del as400-api: esa marca las filas que sostienen el máximo la
 * cumplen para SIEMPRE (`dtUpd >= max(dtUpd)` es verdadero para ellas), y hoy
 * las 1.106 filas comparten el valor del backfill. La Regla B se convertiría
 * en un espejo de estado incondicional cada hora —justo lo que la spec §3.3
 * dice que no hay que hacer— y `divergentesSinMarca`, la vigilancia de la §6,
 * reportaría 0 para siempre tapando el síntoma.
 *
 * Se valida el ancho: si algún día alguien saca el VARCHAR_FORMAT del
 * as400-api, la comparación de texto seguiría "funcionando" en silencio con
 * anchos distintos y daría resultados arbitrarios.
 */
function validarMarca(reloj: string | undefined): string {
  const r = (reloj || "").trim();
  if (r.length !== LARGO_MARCA) {
    throw new Error(
      `el origen no mandó un reloj con formato de ancho fijo (vino ${JSON.stringify(reloj)}). ` +
        `Sin eso la comparación de marcas no es confiable: revisar el VARCHAR_FORMAT de /admsec/list.`,
    );
  }
  return r;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Alta = Extract<AccionSync, { tipo: "ALTA" }>;
type Cambio = Extract<AccionSync, { tipo: "CAMBIO_ESTADO" }>;
type Omitido = Extract<AccionSync, { tipo: "OMITIDO" }>;

const esAlta = (a: AccionSync): a is Alta => a.tipo === "ALTA";
const esCambio = (a: AccionSync): a is Cambio => a.tipo === "CAMBIO_ESTADO";
const esOmitido = (a: AccionSync): a is Omitido => a.tipo === "OMITIDO";

function enLotes<T>(items: T[], tam: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tam) lotes.push(items.slice(i, i + tam));
  return lotes;
}

/** El ExternalUser que espera `crearUsuario`. ADMSEC no tiene nombre ni email. */
function externalUserDeAlta(a: Alta): ExternalUser {
  return {
    origen: a.origen,
    username: a.login,
    nombre: null,
    email: null,
    habilitado: a.habilitado,
    // `crearUsuario` no lo mira, y el filtro de cuentas de sistema ya lo hizo
    // el planificador antes de emitir el ALTA.
    esCuentaSistema: false,
    extras: {},
  };
}

function armarNota(datos: {
  omitidos: Omitido[];
  divergentesSinMarca: number;
  errores: string[];
}): string | null {
  const lineas: string[] = [];

  const logins = (motivo: Omitido["motivo"]) =>
    datos.omitidos.filter((o) => o.motivo === motivo).map((o) => o.login);

  // Estos dos van con nombre y apellido porque son los que alguien tiene que
  // resolver a mano: el job, por diseño, no los va a tocar nunca.
  const roots = logins("ES_ROOT");
  if (roots.length > 0) {
    lineas.push(`ES_ROOT (el origen los manda desactivar y son root acá): ${roots.join(", ")}`);
  }
  const bajas = logins("BAJA_LOCAL");
  if (bajas.length > 0) {
    lineas.push(`BAJA_LOCAL (dados de baja en secapi y habilitados en el origen): ${bajas.join(", ")}`);
  }

  if (datos.divergentesSinMarca > 0) {
    lineas.push(
      `divergentes sin marca: ${datos.divergentesSinMarca} (estado distinto sin que USUDTUPD se moviera; el job no los toca)`,
    );
  }

  if (datos.errores.length > 0) {
    lineas.push(`errores de alta: ${datos.errores.join(" | ")}`);
  }

  return lineas.length > 0 ? lineas.join("\n") : null;
}

/**
 * Ventana de huérfanas. Son CUATRO horas y no dos a propósito: la siembra
 * inicial son ~1.073 altas contra el AS400 y es justo la corrida que puede
 * pasarse de largo. Con un corte corto, el proceso de la hora siguiente le
 * marca FALLIDA la fila a una corrida que está viva y arranca en paralelo.
 */
const VENTANA_HUERFANA_MS = 4 * 60 * 60 * 1000;

// ─── El ciclo ───────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  cargarEnv();
  const modo = resolverModo(process.argv.slice(2));

  // Los imports de runtime van DINÁMICOS y después de cargarEnv() a propósito:
  // as400Users.ts lee AS400_API_URL y USERS_API_KEY en el cuerpo del módulo, y
  // el PrismaClient resuelve DATABASE_URL al construirse. Un import estático se
  // evalúa ANTES del cuerpo de este archivo, o sea antes de que el .env exista
  // para el proceso. Con pm2 daría igual (el entorno ya viene puesto); corriendo
  // a mano desde el repo, no.
  const [
    { prisma },
    { SELECT_ASIGNACIONES_ROL, aplicacionesRootDe },
    { crearUsuario, BATCH_SIZE },
    { listarAdmsec },
    { mapearFilaAdmsec },
    { planificar },
  ] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/permisos"),
    import("../src/lib/usuarios/importar"),
    import("../src/lib/usuarios/sources/as400Users"),
    import("../src/lib/usuarios/sources/mapeo"),
    import("../src/lib/usuarios/syncAdmsec"),
  ]);

  let corridaId: number | null = null;

  try {
    // ── 0. Las huérfanas ────────────────────────────────────────────────────
    // Una EN_CURSO de más de dos horas es un job que se murió sin cerrar. Sin
    // esto, el índice único deja la sincronización trabada para siempre.
    // El `Date` de acá es el `inicio` de la corrida, que es un timestamp de
    // Postgres: no tiene nada que ver con las marcas del AS400, que son texto
    // y jamás pasan por Date.
    const huerfanas = await prisma.syncAdmsecCorrida.updateMany({
      where: { resultado: "EN_CURSO", fin: null, inicio: { lt: new Date(Date.now() - VENTANA_HUERFANA_MS) } },
      data: {
        resultado: "FALLIDA",
        fin: new Date(),
        nota: "huérfana: quedó EN_CURSO más de cuatro horas",
      },
    });
    if (huerfanas.count > 0) {
      console.log(`[sync-admsec] ${huerfanas.count} corrida(s) huérfana(s) marcadas FALLIDA`);
    }

    // ── 1. La corrida ───────────────────────────────────────────────────────
    try {
      const creada = await prisma.syncAdmsecCorrida.create({ data: {}, select: { id: true } });
      corridaId = creada.id;
    } catch (error: any) {
      // ux_sync_admsec_una_en_curso: ya hay otra corriendo. No se escribe nada.
      if (error?.code === "P2002") {
        console.log("[sync-admsec] ya hay una corrida EN_CURSO: no hago nada");
        return 0;
      }
      throw error;
    }

    console.log(
      `[sync-admsec] corrida ${corridaId} — modo ${modo.escribe ? "ESCRIBE" : "SECO (no toca usuarios)"}`,
    );

    // ── 2 y 4. El padrón del origen, entero, y el reloj que sale de él ──────
    const respuesta = await listarAdmsec(false);
    if (!respuesta.ok || !respuesta.rows) {
      throw new Error(`el origen ADMSEC no contestó (reason=${respuesta.reason ?? "?"})`);
    }
    if (respuesta.rows.length === 0) {
      throw new Error("el origen ADMSEC devolvió 0 filas");
    }

    const origen: FilaOrigenSync[] = respuesta.rows.map((row) => {
      const ext = mapearFilaAdmsec(row);
      return {
        login: ext.username,
        habilitado: ext.habilitado,
        autAd: ext.extras.usuAutAd ?? "G",
        dtUpd: ext.extras.dtUpd ?? null,
      };
    });

    const reloj = validarMarca(respuesta.reloj);

    // ── 3. La marca de la última corrida OK ─────────────────────────────────
    // `relojOrigen: not null` no es cosmético: las corridas en seco cierran OK
    // pero guardan la marca en null a propósito (ver el cierre, paso 7). Sin
    // este filtro, una corrida en seco haría avanzar la marca sin haber escrito
    // nada, y todo lo que cambiara en ADMSEC mientras el job está en seco
    // quedaría por debajo de la marca y no se aplicaría NUNCA al pasar a
    // escribir: cambios perdidos en silencio, con la corrida en verde.
    const ultima = await prisma.syncAdmsecCorrida.findFirst({
      where: { resultado: "OK", relojOrigen: { not: null } },
      orderBy: { inicio: "desc" },
      select: { relojOrigen: true },
    });
    const marca = ultima?.relojOrigen ?? null;
    console.log(`[sync-admsec] ${origen.length} filas del origen · marca=${marca ?? "(ninguna)"} · reloj=${reloj ?? "(ninguno)"}`);

    // ── 5. El padrón local ──────────────────────────────────────────────────
    // Los roles vienen en el MISMO query (un findMany, no 854 + N) y el criterio
    // de root lo pone `aplicacionesRootDe`, que es tolerante con el nombre del
    // rol y exige rol y aplicación activos más vigencia. Reimplementar
    // `nombre = 'Root'` acá construye justo el lockout que el ES_ROOT evita
    // (spec 3.4). Root en CUALQUIER aplicación cuenta: dmedaglia es el único
    // root de Granel y no lo es de secapi.
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        username: true,
        estado: true,
        fechaBaja: true,
        roles: { select: SELECT_ASIGNACIONES_ROL },
      },
    });
    const local: FilaLocalSync[] = usuarios.map((u) => ({
      id: u.id,
      username: u.username,
      estado: u.estado,
      fechaBaja: u.fechaBaja,
      esRoot: aplicacionesRootDe(u.roles).length > 0,
    }));

    // ── 6. El plan y su ejecución, en lotes ─────────────────────────────────
    const plan = planificar(origen, local, marca);

    const altas = plan.acciones.filter(esAlta);
    const cambios = plan.acciones.filter(esCambio);
    const omitidos = plan.acciones.filter(esOmitido);

    for (const o of omitidos) console.log(`  omitido ${o.motivo}: ${o.login}`);

    let nAltas = 0;
    const noCreados: string[] = [];
    const errores: string[] = [];

    for (const lote of enLotes(altas, BATCH_SIZE)) {
      const detalles = await Promise.all(
        lote.map((a) =>
          crearUsuario(externalUserDeAlta(a), {
            creadoPor: "sync-admsec",
            conRoles: false,
            conPreferencias: false,
            dryRun: !modo.escribe,
          }),
        ),
      );
      for (const d of detalles) {
        if (d.estado === "creado") nAltas++;
        else if (d.estado === "omitido") noCreados.push(`${d.username}: ${d.motivo ?? "omitido"}`);
        else errores.push(`${d.username}: ${d.motivo ?? "error"}`);
      }
    }
    for (const n of noCreados) console.log(`  alta omitida ${n}`);

    let nCambios = 0;
    for (const lote of enLotes(cambios, BATCH_SIZE)) {
      if (modo.escribe) {
        // allSettled y no all: si una fila se borró entre el findMany y el
        // update (P2025), lo que corresponde es anotar ESA y seguir. Con
        // Promise.all la corrida entera sale FALLIDA diciendo que no hizo nada
        // cuando en realidad los lotes anteriores ya escribieron.
        const r = await Promise.allSettled(
          lote.map((c) =>
            prisma.usuario.update({
              where: { id: c.usuarioId },
              // SOLO estado. Ni fechaBaja, ni desdeSistema, ni nada más (D6).
              data: { estado: c.a },
            }),
          ),
        );
        r.forEach((res, i) => {
          if (res.status === "fulfilled") nCambios++;
          else errores.push(`${lote[i].login}: ${(res.reason as Error)?.message ?? "error"}`);
        });
      }
      for (const c of lote) console.log(`  estado: ${c.login} ${c.de} → ${c.a}`);
    }

    // ── 7. Cerrar OK. Recién acá avanza la marca ────────────────────────────
    const nOmitidos = omitidos.length + noCreados.length;
    await prisma.syncAdmsecCorrida.update({
      where: { id: corridaId },
      data: {
        resultado: "OK",
        fin: new Date(),
        // La marca SOLO avanza si de verdad se escribió. Una corrida en seco
        // deja null y la siguiente hereda la marca de la última que sí escribió
        // (ver el paso 3): así el período de revisión en seco no se come la
        // ventana de cambios.
        relojOrigen: modo.escribe ? reloj : null,
        altas: nAltas,
        cambios: nCambios,
        omitidos: nOmitidos,
        nota: armarNota({ omitidos, divergentesSinMarca: plan.divergentesSinMarca, errores }),
      },
    });

    console.log(
      `[sync-admsec] OK — altas=${nAltas} cambios=${nCambios} omitidos=${nOmitidos}` +
        `${errores.length > 0 ? ` errores=${errores.length}` : ""}` +
        `${modo.escribe ? "" : " (seco: no se escribió en usuarios)"}`,
    );
    return 0;
  } catch (error) {
    const mensaje = (error as Error)?.message || String(error);
    console.error(`[sync-admsec] FALLIDA: ${mensaje}`);
    if (corridaId !== null) {
      try {
        // Se cierra FALLIDA SIN reloj_origen: la marca no avanza y la hora que
        // viene vuelve a ver la misma ventana.
        await prisma.syncAdmsecCorrida.update({
          where: { id: corridaId },
          data: { resultado: "FALLIDA", fin: new Date(), nota: mensaje },
        });
      } catch (otro) {
        console.error(`[sync-admsec] no pude cerrar la corrida ${corridaId}: ${(otro as Error)?.message}`);
      }
    }
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((error) => {
    console.error(`[sync-admsec] error no controlado: ${(error as Error)?.message || String(error)}`);
    process.exitCode = 1;
  });
