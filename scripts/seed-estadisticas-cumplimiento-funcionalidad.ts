/**
 * scripts/seed-estadisticas-cumplimiento-funcionalidad.ts
 *
 * Siembra (idempotente) la funcionalidad de RBAC "Estadisticas Cumplimiento"
 * para la aplicación RiogasTracking (id 5 = DESPACHO_APLICACION_ID).
 *
 * Sigue el patrón de las funcionalidades hermanas de estadísticas ya existentes
 * (Estadist.GlobalxEF / xMovil / xZona), que son funcionalidades "planas"
 * (objetoKey/accionKey = null) porque el panel de visualización todavía no
 * tiene una ruta propia en trackmovil. Cuando el panel exista, se puede cablear
 * objetoKey='dashboard' + accionKey=<código de ruta XXXX-XXXX> vía la UI.
 *
 * Uso:
 *   pnpm seed:estadisticas-cumplimiento
 *   pnpm seed:estadisticas-cumplimiento --app=5
 *   pnpm seed:estadisticas-cumplimiento --grant-root                 (otorga a todos los es_root='S')
 *   pnpm seed:estadisticas-cumplimiento --grant-user=jgomez,otro     (otorga a usuarios puntuales)
 *   pnpm seed:estadisticas-cumplimiento --grant-role=48              (otorga al/los rol(es) por id, coma-separados)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");
// Cargamos ambos: .env.local puede tener overrides, pero DATABASE_URL vive en .env
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const NOMBRE_FUNCIONALIDAD = "Estadisticas Cumplimiento";

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const appId = Number(
    getArg("app") ??
      process.env.DESPACHO_APLICACION_ID ??
      5, // RiogasTracking
  );
  if (!appId) {
    throw new Error("No se pudo resolver la aplicación. Pasá --app=<id> (RiogasTracking = 5).");
  }

  const app = await prisma.aplicacion.findUnique({ where: { id: appId } });
  if (!app) throw new Error(`Aplicación ${appId} no existe.`);
  console.log(`▶ Seed de funcionalidad "${NOMBRE_FUNCIONALIDAD}" en aplicación ${appId} (${app.nombre})`);

  // Funcionalidad plana (mismo patrón que Estadist.GlobalxEF/xMovil/xZona)
  let funcionalidad = await prisma.funcionalidad.findFirst({
    where: { aplicacionId: appId, nombre: NOMBRE_FUNCIONALIDAD },
  });
  if (!funcionalidad) {
    funcionalidad = await prisma.funcionalidad.create({
      data: {
        aplicacionId: appId,
        nombre: NOMBRE_FUNCIONALIDAD,
        estado: "A",
        esPublico: "N",
        soloRoot: "N",
        // objetoKey / accionKey quedan null a propósito (aún no hay ruta del panel)
      },
    });
    console.log(`  ✓ Funcionalidad creada (id ${funcionalidad.id})`);
  } else {
    console.log(`  • Funcionalidad ya existía (id ${funcionalidad.id})`);
  }

  // (opcional) Otorgar a usuarios root
  if (hasFlag("grant-root")) {
    const roots = await prisma.usuario.findMany({
      where: { esRoot: "S", estado: "A" },
      select: { id: true, username: true },
    });
    for (const r of roots) {
      await prisma.acceso.upsert({
        where: { funcionalidadId_usuarioId: { funcionalidadId: funcionalidad.id, usuarioId: r.id } },
        update: { efecto: "grant", creadoEn: "seed" },
        create: { funcionalidadId: funcionalidad.id, usuarioId: r.id, efecto: "grant", creadoEn: "seed" },
      });
    }
    console.log(`  ✓ Funcionalidad otorgada a ${roots.length} usuario(s) root`);
  }

  // (opcional) Otorgar a usuarios puntuales por username
  const grantUserArg = getArg("grant-user");
  if (grantUserArg) {
    const usernames = grantUserArg.split(",").map((u) => u.trim()).filter(Boolean);
    for (const uname of usernames) {
      const u = await prisma.usuario.findFirst({
        where: { username: { equals: uname, mode: "insensitive" }, estado: "A" },
        select: { id: true, username: true },
      });
      if (!u) {
        console.warn(`  ⚠ Usuario "${uname}" no encontrado o inactivo — omitido`);
        continue;
      }
      await prisma.acceso.upsert({
        where: { funcionalidadId_usuarioId: { funcionalidadId: funcionalidad.id, usuarioId: u.id } },
        update: { efecto: "grant", creadoEn: "seed" },
        create: { funcionalidadId: funcionalidad.id, usuarioId: u.id, efecto: "grant", creadoEn: "seed" },
      });
      console.log(`  ✓ Funcionalidad otorgada a usuario ${u.username}`);
    }
  }

  // (opcional) Otorgar a rol(es) por id
  const grantRoleArg = getArg("grant-role");
  if (grantRoleArg) {
    const roleIds = grantRoleArg.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
    for (const rolId of roleIds) {
      const rol = await prisma.rol.findFirst({ where: { id: rolId, aplicacionId: appId } });
      if (!rol) {
        console.warn(`  ⚠ Rol ${rolId} no encontrado en la app ${appId} — omitido`);
        continue;
      }
      await prisma.rolFuncionalidad.upsert({
        where: { rolId_funcionalidadId: { rolId, funcionalidadId: funcionalidad.id } },
        update: {},
        create: { rolId, funcionalidadId: funcionalidad.id },
      });
      console.log(`  ✓ Funcionalidad otorgada al rol ${rol.nombre} (id ${rolId})`);
    }
  }

  console.log("✔ Seed completo.");
}

main()
  .catch((e) => {
    console.error("✖ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
