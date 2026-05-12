/**
 * scripts/import-sgm-preferences.ts
 *
 * CLI script para disparar POST /api/db/admin/import-sgm-preferences
 * sin necesidad de login manual en el browser.
 *
 * Genera un JWT localmente usando JWT_SECRET del .env (igual que buildSuccessResponse)
 * y lo envía como cookie "token" en el request.
 *
 * Uso:
 *   pnpm import:sgm-prefs
 *   pnpm import:sgm-prefs --dry-run
 *   pnpm import:sgm-prefs --base-url=http://localhost:4005
 *   pnpm import:sgm-prefs --help
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

// ─── Cargar .env.local (mismo que usa la app en desarrollo) ──────────────────

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// ─── Parseo de args CLI ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  dryRun: boolean;
  baseUrl: string | null;
  help: boolean;
} {
  let dryRun = false;
  let baseUrl: string | null = null;
  let help = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    }
  }

  return { dryRun, baseUrl, help };
}

function printHelp(): void {
  console.log(`
import-sgm-preferences — Dispara POST /api/db/admin/import-sgm-preferences vía CLI

OPCIONES
  --dry-run              Ejecuta sin escribir nada en la DB (agrega ?dryRun=true)
  --base-url=<url>       URL base del servidor (default: IMPORT_BASE_URL o http://localhost:4005)
  --help, -h             Muestra este mensaje

VARIABLES DE ENTORNO
  JWT_SECRET             (obligatoria) Secret para firmar el JWT — misma que usa la app
  DATABASE_URL           (opcional)    URL de PostgreSQL — solo se usa si no se especifica admin
  IMPORT_BASE_URL        (opcional)    URL base del servidor (default: http://localhost:4005)
  IMPORT_ADMIN_USERNAME  (opcional)    Username del admin para el JWT (default: lookup esRoot='S')
  IMPORT_ADMIN_USERID    (opcional)    UserId del admin para el JWT (default: lookup esRoot='S')

EJEMPLOS
  pnpm import:sgm-prefs
  pnpm import:sgm-prefs --dry-run
  pnpm import:sgm-prefs --base-url=https://securitysuite.riogas.com.uy
`);
}

// ─── Tipos de respuesta del endpoint ─────────────────────────────────────────

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
  status: string;
  escenario?: string;
  empFletera?: string;
  error?: string;
}

interface ImportResponse {
  success: boolean;
  dryRun?: boolean;
  mensaje?: string;
  summary?: ImportSummary;
  detalles?: DetalleUsuario[];
  error?: string;
}

// ─── Lookup del admin por defecto (esRoot='S') ────────────────────────────────

async function lookupRootAdmin(): Promise<{ username: string; userId: number }> {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.usuario.findFirst({
      where: { esRoot: "S", estado: "A" },
      select: { id: true, username: true },
      orderBy: { id: "asc" },
    });

    if (!admin) {
      throw new Error(
        "No se encontró ningún usuario con esRoot='S' en la base de datos.\n" +
          "Especificá IMPORT_ADMIN_USERNAME y IMPORT_ADMIN_USERID en el .env o como variables de entorno."
      );
    }

    return { username: admin.username, userId: admin.id };
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Impresión de resultados ──────────────────────────────────────────────────

function printSummary(summary: ImportSummary, dryRun: boolean): void {
  const mode = dryRun ? " [DRY RUN]" : "";
  console.log(`\n=== SUMMARY${mode} ===`);
  console.log(`  Candidatos SGM numéricos : ${summary.candidatos}`);
  console.log(
    `  Escenario  actualizados : ${summary.escenarioActualizados}  |  skipped: ${summary.escenarioSkipped}`
  );
  console.log(
    `  EmpFletera actualizados : ${summary.empFleteraActualizados}  |  skipped: ${summary.empFleteraSkipped}`
  );
  console.log(`  FWL_Distribuidor encontr.: ${summary.fwlDistribuidorEncontrados}`);
  console.log(`  Distribuidor asignados  : ${summary.distribuidorAsignados}`);
  console.log(`  Errores                 : ${summary.errores}`);
}

function printDetalles(detalles: DetalleUsuario[]): void {
  if (detalles.length === 0) {
    console.log("\n(sin detalles)");
    return;
  }

  console.log("\n=== DETALLES ===");

  // Calcular anchos de columna
  const col = {
    username: Math.max(8, ...detalles.map((d) => d.username.length)),
    status: Math.max(6, ...detalles.map((d) => d.status.length)),
    escenario: Math.max(9, ...detalles.map((d) => (d.escenario ?? "").length)),
    empFletera: Math.max(10, ...detalles.map((d) => (d.empFletera ?? "").length)),
  };

  // Header
  const header = [
    "USERNAME".padEnd(col.username),
    "STATUS".padEnd(col.status),
    "ESCENARIO".padEnd(col.escenario),
    "EMP_FLETERA".padEnd(col.empFletera),
  ].join(" | ");
  const separator = "-".repeat(header.length);

  console.log(header);
  console.log(separator);

  for (const d of detalles) {
    const row = [
      d.username.padEnd(col.username),
      d.status.padEnd(col.status),
      (d.error ? `ERROR: ${d.error}` : (d.escenario ?? "")).padEnd(col.escenario),
      (d.error ? "" : (d.empFletera ?? "")).padEnd(col.empFletera),
    ].join(" | ");
    console.log(row);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validar JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error(
      "ERROR: JWT_SECRET no está seteado.\n" +
        "Asegurate de tener un archivo .env.local (o .env) con JWT_SECRET=<tu-secret>."
    );
    process.exit(1);
  }

  // Determinar URL base
  const baseUrl = args.baseUrl ?? process.env.IMPORT_BASE_URL ?? "http://localhost:4005";
  const endpointPath = "/api/db/admin/import-sgm-preferences";
  const url = new URL(endpointPath, baseUrl);
  if (args.dryRun) {
    url.searchParams.set("dryRun", "true");
  }

  // Determinar admin (username + userId)
  let adminUsername: string;
  let adminUserId: number;

  const envUsername = process.env.IMPORT_ADMIN_USERNAME;
  const envUserId = process.env.IMPORT_ADMIN_USERID;

  if (envUsername && envUserId) {
    const parsedId = parseInt(envUserId, 10);
    if (isNaN(parsedId)) {
      console.error(
        `ERROR: IMPORT_ADMIN_USERID="${envUserId}" no es un número válido.`
      );
      process.exit(1);
    }
    adminUsername = envUsername;
    adminUserId = parsedId;
  } else {
    // Fallback: buscar en PG
    if (!process.env.DATABASE_URL) {
      console.error(
        "ERROR: No se especificó IMPORT_ADMIN_USERNAME/IMPORT_ADMIN_USERID y DATABASE_URL tampoco está seteado.\n" +
          "No es posible hacer el lookup automático del admin."
      );
      process.exit(1);
    }
    console.log("Admin no especificado. Buscando usuario con esRoot='S' en la base de datos...");
    try {
      const admin = await lookupRootAdmin();
      adminUsername = admin.username;
      adminUserId = admin.userId;
      console.log(`  Admin encontrado: ${adminUsername} (id=${adminUserId})`);
    } catch (err) {
      console.error(`ERROR al buscar admin en DB: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // Generar JWT (misma estructura que buildSuccessResponse)
  const token = jwt.sign(
    {
      iss: "security-suite",
      username: adminUsername,
      userId: adminUserId,
      sistema: "",
    },
    jwtSecret,
    { expiresIn: "1h" }
  );

  // Log inicial (sin imprimir el JWT)
  console.log(`\nURL: ${url.toString()}`);
  console.log(`Modo: ${args.dryRun ? "DRY RUN (sin escrituras)" : "REAL (escribe en DB)"}`);
  console.log(`Admin: ${adminUsername} (id=${adminUserId})`);
  console.log("\nEjecutando...\n");

  // Hacer POST
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error(
      `ERROR: No se pudo conectar a ${baseUrl}\n` +
        `Detalle: ${(err as Error).message}\n\n` +
        `Verificá que el servidor esté corriendo en esa URL.`
    );
    process.exit(1);
  }

  // Manejar errores HTTP específicos antes de parsear JSON
  if (res.status === 401) {
    console.error(
      "ERROR 401 — No autorizado.\n" +
        "El JWT generado no fue aceptado por el servidor.\n" +
        "Posibles causas:\n" +
        "  - JWT_SECRET no coincide con el que usa la app.\n" +
        "  - El endpoint requiere un claim adicional."
    );
    process.exit(1);
  }

  if (res.status === 500) {
    let body = "";
    try {
      const json = (await res.json()) as ImportResponse;
      body = json.error ?? JSON.stringify(json);
    } catch {
      body = await res.text();
    }
    console.error(`ERROR 500 — Error interno del servidor.\nDetalle: ${body}`);
    process.exit(1);
  }

  // Parsear respuesta
  let data: ImportResponse;
  try {
    data = (await res.json()) as ImportResponse;
  } catch {
    console.error(`ERROR: La respuesta del servidor no es JSON válido (HTTP ${res.status}).`);
    process.exit(1);
  }

  if (!data.success) {
    console.error(`ERROR: El endpoint retornó success=false.\nMensaje: ${data.error ?? data.mensaje ?? "(sin detalle)"}`);
    process.exit(1);
  }

  // Mostrar resultado
  if (data.mensaje) {
    console.log(data.mensaje);
  }

  if (data.summary) {
    printSummary(data.summary, data.dryRun ?? false);
  }

  if (data.detalles && data.detalles.length > 0) {
    printDetalles(data.detalles);
  }

  console.log("\nFinalizado exitosamente.");
  process.exit(0);
}

main().catch((err: Error) => {
  console.error("ERROR inesperado:", err.message);
  process.exit(1);
});
