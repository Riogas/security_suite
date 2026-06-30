/**
 * scripts/seed-solicitudes-funcionalidad.ts
 *
 * Siembra (idempotente) la pieza de RBAC que habilita el panel de aprobación
 * de solicitudes de acceso:
 *   - Objeto  key="solicitudes"  tipo=PAGE   path="/solicitudes"
 *   - ObjetoAccion key="approve"
 *   - Funcionalidad "Solicitudes" vinculada al objeto+acción
 *
 * Luego, quien tenga esa funcionalidad (vía rol o acceso directo) podrá ver el
 * panel y aprobar/rechazar. Root siempre puede, aunque no la tenga.
 *
 * Uso:
 *   pnpm seed:solicitudes
 *   pnpm seed:solicitudes --app=3
 *   pnpm seed:solicitudes --grant-root          (otorga a todos los es_root='S')
 *   pnpm seed:solicitudes --grant-user=jgomez   (otorga a usuarios puntuales, coma-separados)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const appId = Number(
    getArg("app") ??
      process.env.NEXT_PUBLIC_APLICACION_ID ??
      process.env.APLICACION_ID ??
      0,
  );
  if (!appId) {
    throw new Error(
      "No se pudo resolver la aplicación. Pasá --app=<id> o seteá NEXT_PUBLIC_APLICACION_ID.",
    );
  }

  console.log(`▶ Seed de funcionalidad aprobadora para aplicación ${appId}`);

  // 1. Objeto "solicitudes"
  let objeto = await prisma.objeto.findFirst({
    where: { aplicacionId: appId, key: "solicitudes", tipo: "PAGE" },
  });
  if (!objeto) {
    objeto = await prisma.objeto.create({
      data: {
        aplicacionId: appId,
        tipo: "PAGE",
        key: "solicitudes",
        label: "Solicitudes de acceso",
        path: "/dashboard/solicitudes",
        estado: "A",
        esPublico: "N",
        orden: 7,
        creadoEn: "seed",
      },
    });
    console.log(`  ✓ Objeto creado (id ${objeto.id})`);
  } else {
    console.log(`  • Objeto ya existía (id ${objeto.id})`);
  }

  // 2. ObjetoAccion "approve"
  let accion = await prisma.objetoAccion.findFirst({
    where: { objetoId: objeto.id, key: "approve" },
  });
  if (!accion) {
    accion = await prisma.objetoAccion.create({
      data: {
        objetoId: objeto.id,
        key: "approve",
        descripcion: "Aprobar/rechazar solicitudes de acceso",
        creadoEn: "seed",
      },
    });
    console.log(`  ✓ ObjetoAccion creada (id ${accion.id})`);
  } else {
    console.log(`  • ObjetoAccion ya existía (id ${accion.id})`);
  }

  // 3. Funcionalidad "Solicitudes"
  let funcionalidad = await prisma.funcionalidad.findFirst({
    where: { aplicacionId: appId, nombre: "Solicitudes" },
  });
  if (!funcionalidad) {
    funcionalidad = await prisma.funcionalidad.create({
      data: {
        aplicacionId: appId,
        nombre: "Solicitudes",
        estado: "A",
        esPublico: "N",
        soloRoot: "N",
        objetoKey: "solicitudes",
        accionKey: "approve",
      },
    });
    console.log(`  ✓ Funcionalidad creada (id ${funcionalidad.id})`);
  } else {
    console.log(`  • Funcionalidad ya existía (id ${funcionalidad.id})`);
  }

  // 4. Vínculo funcionalidad ↔ objeto+acción
  const vinculo = await prisma.funcionalidadObjetoAccion.findFirst({
    where: {
      funcionalidadId: funcionalidad.id,
      objetoId: objeto.id,
      objetoAccionId: accion.id,
    },
  });
  if (!vinculo) {
    await prisma.funcionalidadObjetoAccion.create({
      data: {
        funcionalidadId: funcionalidad.id,
        objetoId: objeto.id,
        objetoAccionId: accion.id,
      },
    });
    console.log("  ✓ Vínculo funcionalidad↔objeto creado");
  } else {
    console.log("  • Vínculo ya existía");
  }

  // 5. (opcional) Otorgar a usuarios root
  if (hasFlag("grant-root")) {
    const roots = await prisma.usuario.findMany({
      where: { esRoot: "S", estado: "A" },
      select: { id: true, username: true },
    });
    for (const r of roots) {
      await prisma.acceso.upsert({
        where: {
          funcionalidadId_usuarioId: {
            funcionalidadId: funcionalidad.id,
            usuarioId: r.id,
          },
        },
        update: { efecto: "grant", creadoEn: "seed" },
        create: {
          funcionalidadId: funcionalidad.id,
          usuarioId: r.id,
          efecto: "grant",
          creadoEn: "seed",
        },
      });
    }
    console.log(`  ✓ Funcionalidad otorgada a ${roots.length} usuario(s) root`);
  }

  // 6. (opcional) Otorgar a usuarios puntuales por username
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
        where: {
          funcionalidadId_usuarioId: { funcionalidadId: funcionalidad.id, usuarioId: u.id },
        },
        update: { efecto: "grant", creadoEn: "seed" },
        create: { funcionalidadId: funcionalidad.id, usuarioId: u.id, efecto: "grant", creadoEn: "seed" },
      });
      console.log(`  ✓ Funcionalidad otorgada a ${u.username}`);
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
