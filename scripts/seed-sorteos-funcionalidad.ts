/**
 * scripts/seed-sorteos-funcionalidad.ts
 *
 * Siembra (idempotente) la pieza de RBAC que habilita la pantalla de Sorteos
 * de la aplicación GOYA (id 3):
 *   - Objeto        key="sorteos"  tipo=PAGE  path="/sorteos"  icon="gift"
 *   - ObjetoAccion  key="view"     (sin path, es la acción de ver la página)
 *   - ObjetoAccion  key="detalle"  path="/sorteos/:id"
 *   - Punto de menú: ObjetoAccion key="sorteos" bajo el MENU raíz (Objeto 10),
 *     label "Sorteos", path "/dashboard/sorteos", relacion → objeto sorteos
 *   - Funcionalidad "Sorteos" (objetoKey=sorteos, accionKey=view) vinculada a
 *     AMBAS acciones del objeto
 *   - rol_funcionalidades: la funcionalidad otorgada al rol Root de GOYA (55)
 *
 * Los códigos de cada ObjetoAccion se generan con generarAccionCodigo(), la
 * misma función que usa el form de objetos, para que coincidan con los que
 * produciría la UI.
 *
 * Solo hace INSERTs: si una pieza ya existe, la reusa y no la modifica.
 *
 * Uso:
 *   pnpm seed:sorteos
 *   pnpm seed:sorteos --app=3 --menu-parent=10 --rol=55
 *   pnpm seed:sorteos --dry-run     (muestra qué haría, sin escribir)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";
import { generarAccionCodigo } from "../src/lib/objetoAccionCode";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");
// Cargamos ambos: .env.local puede tener overrides, pero DATABASE_URL vive en .env
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const OBJETO_KEY = "sorteos";
const OBJETO_LABEL = "Sorteos";
const OBJETO_PATH = "/sorteos";
const OBJETO_ICON = "gift";
const NOMBRE_FUNCIONALIDAD = "Sorteos";
const CREADO_EN = "seed:sorteos";

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const appId = Number(getArg("app") ?? 3); // GOYA
  const menuParentId = Number(getArg("menu-parent") ?? 10); // MENU raíz de GOYA
  const rolId = Number(getArg("rol") ?? 55); // Root de GOYA
  const dryRun = hasFlag("dry-run");

  const app = await prisma.aplicacion.findUnique({ where: { id: appId } });
  if (!app) throw new Error(`Aplicación ${appId} no existe.`);

  const menuRaiz = await prisma.objeto.findFirst({
    where: { id: menuParentId, aplicacionId: appId, tipo: "MENU", estado: "A" },
  });
  if (!menuRaiz) {
    throw new Error(
      `Objeto ${menuParentId} no es un MENU activo de la aplicación ${appId}.`,
    );
  }

  const rol = await prisma.rol.findFirst({ where: { id: rolId, aplicacionId: appId } });
  if (!rol) throw new Error(`Rol ${rolId} no existe en la aplicación ${appId}.`);

  console.log(
    `▶ Seed "${NOMBRE_FUNCIONALIDAD}" — app ${appId} (${app.nombre}), menú raíz ${menuRaiz.id} (${menuRaiz.key}), rol ${rol.id} (${rol.nombre})${dryRun ? " [DRY-RUN]" : ""}`,
  );

  // 1. Objeto PAGE "sorteos"
  let objeto = await prisma.objeto.findFirst({
    where: { aplicacionId: appId, key: OBJETO_KEY, tipo: "PAGE" },
  });
  if (!objeto) {
    if (dryRun) {
      console.log("  → crearía Objeto PAGE 'sorteos'");
    } else {
      objeto = await prisma.objeto.create({
        data: {
          aplicacionId: appId,
          tipo: "PAGE",
          key: OBJETO_KEY,
          label: OBJETO_LABEL,
          path: OBJETO_PATH,
          icon: OBJETO_ICON,
          estado: "A",
          esPublico: "N",
          creadoEn: CREADO_EN,
        },
      });
      console.log(`  ✓ Objeto creado (id ${objeto.id})`);
    }
  } else {
    console.log(`  • Objeto ya existía (id ${objeto.id})`);
  }
  if (!objeto) {
    console.log("✔ Dry-run: sin objeto no se puede seguir simulando el resto.");
    return;
  }

  // 2. Acciones del objeto: view (la página) y detalle (/sorteos/:id)
  const accionesSpec = [
    { key: "view", descripcion: "Ver sorteos", path: null as string | null },
    { key: "detalle", descripcion: "Ver detalle de sorteo", path: "/sorteos/:id" },
  ];
  const acciones: { key: string; id: number; codigo: string }[] = [];
  for (const spec of accionesSpec) {
    let accion = await prisma.objetoAccion.findFirst({
      where: { objetoId: objeto.id, key: spec.key },
    });
    const codigo = await generarAccionCodigo(OBJETO_KEY, spec.key);
    if (!accion) {
      if (dryRun) {
        console.log(`  → crearía ObjetoAccion '${spec.key}' (codigo ${codigo})`);
        continue;
      }
      accion = await prisma.objetoAccion.create({
        data: {
          objetoId: objeto.id,
          key: spec.key,
          descripcion: spec.descripcion,
          codigo,
          path: spec.path,
          creadoEn: CREADO_EN,
        },
      });
      console.log(`  ✓ ObjetoAccion '${spec.key}' creada (id ${accion.id}, codigo ${codigo})`);
    } else {
      console.log(`  • ObjetoAccion '${spec.key}' ya existía (id ${accion.id}, codigo ${accion.codigo})`);
    }
    acciones.push({ key: spec.key, id: accion.id, codigo: accion.codigo ?? codigo });
  }

  // 3. Punto de menú bajo el MENU raíz
  let puntoMenu = await prisma.objetoAccion.findFirst({
    where: { objetoId: menuRaiz.id, key: OBJETO_KEY },
  });
  if (!puntoMenu) {
    const hermanos = await prisma.objetoAccion.findMany({
      where: { objetoId: menuRaiz.id },
      select: { orden: true },
    });
    const orden = hermanos.reduce((max, h) => Math.max(max, h.orden), -1) + 1;
    const codigoMenu = await generarAccionCodigo(menuRaiz.key, OBJETO_KEY);
    if (dryRun) {
      console.log(`  → crearía punto de menú 'sorteos' (orden ${orden}, codigo ${codigoMenu})`);
    } else {
      puntoMenu = await prisma.objetoAccion.create({
        data: {
          objetoId: menuRaiz.id,
          key: OBJETO_KEY,
          label: OBJETO_LABEL,
          path: "/dashboard/sorteos",
          icon: OBJETO_ICON,
          codigo: codigoMenu,
          relacion: objeto.id,
          orden,
          creadoEn: CREADO_EN,
        },
      });
      console.log(`  ✓ Punto de menú creado (id ${puntoMenu.id}, orden ${orden}, codigo ${codigoMenu})`);
    }
  } else {
    console.log(`  • Punto de menú ya existía (id ${puntoMenu.id}, orden ${puntoMenu.orden})`);
  }

  // 4. Funcionalidad "Sorteos"
  let funcionalidad = await prisma.funcionalidad.findFirst({
    where: { aplicacionId: appId, nombre: NOMBRE_FUNCIONALIDAD },
  });
  if (!funcionalidad) {
    if (dryRun) {
      console.log("  → crearía Funcionalidad 'Sorteos'");
    } else {
      funcionalidad = await prisma.funcionalidad.create({
        data: {
          aplicacionId: appId,
          nombre: NOMBRE_FUNCIONALIDAD,
          estado: "A",
          esPublico: "N",
          soloRoot: "N",
          objetoKey: OBJETO_KEY,
          accionKey: "view",
        },
      });
      console.log(`  ✓ Funcionalidad creada (id ${funcionalidad.id})`);
    }
  } else {
    console.log(`  • Funcionalidad ya existía (id ${funcionalidad.id})`);
  }
  if (!funcionalidad) {
    console.log("✔ Dry-run terminado.");
    return;
  }

  // 5. Vínculos funcionalidad ↔ objeto+acción (view y detalle)
  for (const accion of acciones) {
    const vinculo = await prisma.funcionalidadObjetoAccion.findFirst({
      where: {
        funcionalidadId: funcionalidad.id,
        objetoId: objeto.id,
        objetoAccionId: accion.id,
      },
    });
    if (!vinculo) {
      if (dryRun) {
        console.log(`  → crearía vínculo funcionalidad↔${accion.key}`);
        continue;
      }
      await prisma.funcionalidadObjetoAccion.create({
        data: {
          funcionalidadId: funcionalidad.id,
          objetoId: objeto.id,
          objetoAccionId: accion.id,
        },
      });
      console.log(`  ✓ Vínculo funcionalidad↔'${accion.key}' creado`);
    } else {
      console.log(`  • Vínculo funcionalidad↔'${accion.key}' ya existía`);
    }
  }

  // 6. Otorgar la funcionalidad al rol (fila puntual: NO reemplaza el set del rol)
  const yaOtorgada = await prisma.rolFuncionalidad.findUnique({
    where: { rolId_funcionalidadId: { rolId: rol.id, funcionalidadId: funcionalidad.id } },
  });
  if (!yaOtorgada) {
    if (dryRun) {
      console.log(`  → otorgaría la funcionalidad al rol ${rol.nombre} (${rol.id})`);
    } else {
      await prisma.rolFuncionalidad.create({
        data: { rolId: rol.id, funcionalidadId: funcionalidad.id },
      });
      console.log(`  ✓ Funcionalidad otorgada al rol ${rol.nombre} (id ${rol.id})`);
    }
  } else {
    console.log(`  • El rol ${rol.nombre} (id ${rol.id}) ya tenía la funcionalidad`);
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
