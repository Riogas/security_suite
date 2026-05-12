import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupAs400Agencia } from "@/lib/auth/clients/as400Client";
import { authLog } from "@/lib/auth/logger";

/**
 * POST /api/db/admin/import-sgm-preferences
 *
 * Proceso de importación masiva (one-off / barrido limpio inicial).
 * Opera sobre usuarios PostgreSQL que cumplan AMBAS condiciones:
 *   - username es numérico (solo dígitos — cédula).
 *   - desdeSistema = 'SGM'.
 *
 * Paso 1 — Sobreescribir Escenario y EmpFletera desde AS400/GXICAGEO:
 *   Para cada usuario candidato, consulta el AS400 API (lookup sin password) para
 *   obtener escenarioId/nom y empFleteraId/nom. Sobreescribe los valores existentes
 *   en usuario_preferencias (DELETE + INSERT). Si AS400 devuelve null para un
 *   atributo, conserva el valor existente (no romper datos manuales).
 *
 * Paso 2 — Asignar rol Distribuidor a quienes tengan FWL_Distribuidor:
 *   Aplica a TODOS los usuarios PG (no solo SGM numéricos). Idempotente.
 *
 * Query params:
 *   ?dryRun=true   → muestra lo que haría sin escribir nada en la DB.
 *
 * Autenticación: requiere cookie JWT "token" (mismo mecanismo que /api/db/usuarios/sync).
 *
 * Respuesta:
 * {
 *   success: boolean,
 *   dryRun: boolean,
 *   summary: {
 *     candidatos: number,
 *     escenarioActualizados: number,
 *     escenarioSkipped: number,
 *     empFleteraActualizados: number,
 *     empFleteraSkipped: number,
 *     fwlDistribuidorEncontrados: number,
 *     distribuidorAsignados: number,
 *     errores: number
 *   },
 *   detalles: Array<{ username: string; status: string; escenario?: string; empFletera?: string; error?: string }>
 * }
 */

function isNumeric(s: string): boolean {
  return /^\d+$/.test(s);
}

interface ImportSummary {
  candidatos: number;
  escenarioActualizados: number;
  escenarioSkipped: number;
  empFleteraActualizados: number;
  empFleteraSkipped: number;
  fwlDistribuidorEncontrados: number;
  distribuidorAsignados: number;
  errores: number;
}

interface DetalleUsuario {
  username: string;
  usuarioId: number;
  status: "actualizado" | "skipped" | "error";
  escenario?: string;
  empFletera?: string;
  error?: string;
}

interface BatchResult {
  detalle: DetalleUsuario;
  escenarioUpdated: boolean;
  empFleteraUpdated: boolean;
  isError: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Paso 1: sobreescribir preferencia de escenario/empFletera para un usuario
// ──────────────────────────────────────────────────────────────────────────────

async function overwritePreference(
  usuarioId: number,
  atributo: "Escenario" | "EmpFletera",
  id: number,
  nombre: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;

  // Delete + Create (force overwrite — comportamiento opuesto al login que es insert-only)
  await prisma.usuarioPreferencia.deleteMany({
    where: { usuarioId, atributo },
  });
  await prisma.usuarioPreferencia.create({
    data: {
      usuarioId,
      atributo,
      valor: JSON.stringify([{ Nombre: nombre, Valor: id }]),
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Paso 2: asignar rol Distribuidor a TODOS los usuarios con FWL_Distribuidor
// ──────────────────────────────────────────────────────────────────────────────

async function bulkAssignDistribuidor(
  dryRun: boolean
): Promise<{ encontrados: number; asignados: number; rolMissing: boolean }> {
  // Buscar el rol Distribuidor (estado activo)
  const distribuidorRol = await prisma.rol.findFirst({
    where: { nombre: "Distribuidor", estado: "A" },
    select: { id: true },
  });

  if (!distribuidorRol) {
    authLog.warn("importSgmPreferences: rol 'Distribuidor' no encontrado en tabla rol");
    return { encontrados: 0, asignados: 0, rolMissing: true };
  }

  // Buscar el rol FWL_Distribuidor (estado activo) para obtener su id
  const fwlRol = await prisma.rol.findFirst({
    where: { nombre: "FWL_Distribuidor", estado: "A" },
    select: { id: true },
  });

  if (!fwlRol) {
    authLog.warn("importSgmPreferences: rol 'FWL_Distribuidor' no encontrado en tabla rol");
    return { encontrados: 0, asignados: 0, rolMissing: false };
  }

  // Usuarios que tienen FWL_Distribuidor (sin filtro de estado del usuario_rol ya que no hay campo estado ahí)
  const usuariosConFwl = await prisma.usuarioRol.findMany({
    where: { rolId: fwlRol.id },
    select: { usuarioId: true },
  });

  const encontrados = usuariosConFwl.length;
  if (encontrados === 0) {
    return { encontrados: 0, asignados: 0, rolMissing: false };
  }

  const usuarioIds = usuariosConFwl.map((u) => u.usuarioId);

  // Usuarios que YA tienen Distribuidor (para excluirlos — idempotencia)
  const yaConDistribuidor = await prisma.usuarioRol.findMany({
    where: {
      usuarioId: { in: usuarioIds },
      rolId: distribuidorRol.id,
    },
    select: { usuarioId: true },
  });

  const yaConDistribuidorSet = new Set(yaConDistribuidor.map((u) => u.usuarioId));
  const aAsignar = usuarioIds.filter((id) => !yaConDistribuidorSet.has(id));

  if (dryRun) {
    authLog.info("importSgmPreferences [dryRun] Distribuidor a asignar", {
      encontrados,
      aAsignar: aAsignar.length,
    });
    return { encontrados, asignados: aAsignar.length, rolMissing: false };
  }

  if (aAsignar.length > 0) {
    await prisma.usuarioRol.createMany({
      data: aAsignar.map((usuarioId) => ({ usuarioId, rolId: distribuidorRol.id })),
      skipDuplicates: true,
    });
  }

  authLog.info("importSgmPreferences: Distribuidor asignado", {
    encontrados,
    asignados: aAsignar.length,
  });

  return { encontrados, asignados: aAsignar.length, rolMissing: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Procesador individual de usuario (para batches paralelos)
// ──────────────────────────────────────────────────────────────────────────────

async function procesarUsuario(
  u: { id: number; username: string },
  dryRun: boolean
): Promise<BatchResult> {
  try {
    const lookup = await lookupAs400Agencia(u.username);

    if (lookup.outcome === "UNAVAILABLE") {
      authLog.warn("importSgmPreferences: AS400 UNAVAILABLE para usuario", {
        username: u.username,
      });
      return {
        detalle: {
          username: u.username,
          usuarioId: u.id,
          status: "skipped",
          escenario: "AS400 UNAVAILABLE",
          empFletera: "AS400 UNAVAILABLE",
        },
        escenarioUpdated: false,
        empFleteraUpdated: false,
        isError: false,
      };
    }

    if (lookup.outcome === "NOT_FOUND") {
      authLog.info("importSgmPreferences: usuario no encontrado en AS400", {
        username: u.username,
      });
      return {
        detalle: {
          username: u.username,
          usuarioId: u.id,
          status: "skipped",
          escenario: "NOT_FOUND en AS400",
          empFletera: "NOT_FOUND en AS400",
        },
        escenarioUpdated: false,
        empFleteraUpdated: false,
        isError: false,
      };
    }

    // FOUND — procesar escenario y empFletera
    const data = lookup.data!;
    let escenarioResult = "sin datos en AS400 — conservado";
    let empFleteraResult = "sin datos en AS400 — conservado";
    let escenarioUpdated = false;
    let empFleteraUpdated = false;

    // Escenario
    if (
      data.escenarioId != null &&
      Number.isFinite(Number(data.escenarioId)) &&
      data.escenarioNom?.trim()
    ) {
      await overwritePreference(
        u.id,
        "Escenario",
        Number(data.escenarioId),
        data.escenarioNom.trim(),
        dryRun
      );
      escenarioUpdated = true;
      escenarioResult = dryRun
        ? `[dryRun] would write: ${data.escenarioNom} (${data.escenarioId})`
        : `actualizado: ${data.escenarioNom} (${data.escenarioId})`;
    }

    // EmpFletera
    if (
      data.empFleteraId != null &&
      Number.isFinite(Number(data.empFleteraId)) &&
      Number(data.empFleteraId) > 0 &&
      data.empFleteraNom?.trim()
    ) {
      await overwritePreference(
        u.id,
        "EmpFletera",
        Number(data.empFleteraId),
        data.empFleteraNom.trim(),
        dryRun
      );
      empFleteraUpdated = true;
      empFleteraResult = dryRun
        ? `[dryRun] would write: ${data.empFleteraNom} (${data.empFleteraId})`
        : `actualizado: ${data.empFleteraNom} (${data.empFleteraId})`;
    }

    const anythingWritten = escenarioUpdated || empFleteraUpdated;

    authLog.info("importSgmPreferences: usuario procesado", {
      username: u.username,
      escenario: escenarioResult,
      empFletera: empFleteraResult,
      dryRun,
    });

    return {
      detalle: {
        username: u.username,
        usuarioId: u.id,
        status: anythingWritten ? "actualizado" : "skipped",
        escenario: escenarioResult,
        empFletera: empFleteraResult,
      },
      escenarioUpdated,
      empFleteraUpdated,
      isError: false,
    };
  } catch (err) {
    const msg = (err as Error).message || "Error desconocido";
    authLog.error("importSgmPreferences: error procesando usuario", {
      username: u.username,
      error: msg,
    });
    return {
      detalle: {
        username: u.username,
        usuarioId: u.id,
        status: "error",
        error: msg,
      },
      escenarioUpdated: false,
      empFleteraUpdated: false,
      isError: true,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler principal
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth: requiere JWT en cookie (mismo patrón que /api/db/usuarios/sync)
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No autenticado. Iniciá sesión primero." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "true";

    authLog.info("importSgmPreferences: iniciando", { dryRun });

    // ── Paso 1: obtener candidatos (numéricos + SGM) ──────────────────────────

    const candidatos = await prisma.usuario.findMany({
      where: { desdeSistema: "SGM" },
      select: { id: true, username: true },
    });

    // Filtrar solo numéricos (cédula = solo dígitos)
    const sgmNumericos = candidatos.filter((u) => isNumeric(u.username));

    authLog.info("importSgmPreferences: candidatos encontrados", {
      total: candidatos.length,
      numericos: sgmNumericos.length,
    });

    const summary: ImportSummary = {
      candidatos: sgmNumericos.length,
      escenarioActualizados: 0,
      escenarioSkipped: 0,
      empFleteraActualizados: 0,
      empFleteraSkipped: 0,
      fwlDistribuidorEncontrados: 0,
      distribuidorAsignados: 0,
      errores: 0,
    };

    const detalles: DetalleUsuario[] = [];

    // ── Paso 1b: procesar en batches ─────────────────────────────────────────
    // Batches de 20 para no saturar el AS400 API.
    // Los contadores se acumulan DESPUÉS del await (seguro en event loop JS).

    const BATCH_SIZE = 20;

    for (let i = 0; i < sgmNumericos.length; i += BATCH_SIZE) {
      const batch = sgmNumericos.slice(i, i + BATCH_SIZE);
      const resultados = await Promise.all(batch.map((u) => procesarUsuario(u, dryRun)));

      for (const r of resultados) {
        detalles.push(r.detalle);
        if (r.isError) {
          summary.errores++;
        } else {
          if (r.escenarioUpdated) summary.escenarioActualizados++;
          else summary.escenarioSkipped++;
          if (r.empFleteraUpdated) summary.empFleteraActualizados++;
          else summary.empFleteraSkipped++;
        }
      }

      authLog.info(
        `importSgmPreferences: batch ${Math.floor(i / BATCH_SIZE) + 1} completado`,
        { procesados: i + batch.length, total: sgmNumericos.length }
      );
    }

    // ── Paso 2: asignar Distribuidor a todos con FWL_Distribuidor ─────────────

    const distribuidorResult = await bulkAssignDistribuidor(dryRun);

    if (distribuidorResult.rolMissing) {
      authLog.warn("importSgmPreferences: rol Distribuidor no encontrado — paso 2 omitido");
    }

    summary.fwlDistribuidorEncontrados = distribuidorResult.encontrados;
    summary.distribuidorAsignados = distribuidorResult.asignados;

    const mensaje = dryRun
      ? "[DRY RUN] Simulación completada. No se escribió nada."
      : `Importación completada: ${summary.escenarioActualizados} escenarios y ${summary.empFleteraActualizados} empFleteras actualizados, ${summary.distribuidorAsignados} roles Distribuidor asignados, ${summary.errores} errores.`;

    authLog.info("importSgmPreferences: finalizado", { summary, dryRun });

    return NextResponse.json({
      success: true,
      dryRun,
      mensaje,
      summary,
      detalles,
    });
  } catch (error: unknown) {
    const msg = (error as Error)?.message || "Error desconocido";
    authLog.error("importSgmPreferences: error general", { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
