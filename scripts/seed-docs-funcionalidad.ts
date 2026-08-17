/**
 * scripts/seed-docs-funcionalidad.ts
 *
 * Siembra (idempotente) la pieza de RBAC que habilita el portal de documentación
 * de APIs ("/docs") en las tres aplicaciones que lo van a tener:
 *
 *   app 1 — SecuritySuite    menú raíz 18   rol Root 57
 *   app 3 — GOYA             menú raíz 10   rol Root 55
 *   app 5 — RiogasTracking   (sin menú en secapi: su menú es código)  rol Root 52
 *
 * Por cada aplicación crea:
 *   - Objeto        key="docs"  tipo=PAGE  path="/docs"  icon="book-open"
 *   - ObjetoAccion  key="view"  (la acción de ver la página)
 *   - Funcionalidad "docs"  (objetoKey=docs, accionKey=view), solo_root='N':
 *     el acceso se controla por el otorgamiento al rol Root de cada app, de modo
 *     que entra tanto es_root='S' (bypass del motor) como quien tenga el rol Root.
 *   - Vínculo funcionalidad ↔ objeto+acción
 *   - rol_funcionalidades: la funcionalidad otorgada al rol Root de esa app
 *
 * El PUNTO DE MENÚ **no** se crea por defecto: hasta que la página /docs exista
 * en cada app, un item de menú sería un link a un 404 (y esta base es la misma
 * que usa producción). Cuando la página esté deployada:
 *
 *   pnpm seed:docs --con-menu            (las tres apps que tienen menú)
 *   pnpm seed:docs --app=3 --con-menu    (solo GOYA)
 *
 * Solo hace INSERTs: si una pieza ya existe, la reusa y no la modifica.
 *
 * Uso:
 *   pnpm seed:docs --dry-run    (muestra qué haría, sin escribir)
 *   pnpm seed:docs
 *   pnpm seed:docs --app=5
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

const OBJETO_KEY = "docs";
const OBJETO_LABEL = "Documentación de APIs";
const OBJETO_PATH = "/docs";
const OBJETO_ICON = "book-open";
const NOMBRE_FUNCIONALIDAD = "docs";
const CREADO_EN = "seed:docs";

/** Una entrada por aplicación destino. menuParentId=null → esa app no usa el menú de secapi. */
type Destino = {
  appId: number;
  nombre: string;
  menuParentId: number | null;
  menuPath: string | null;
  rolId: number;
};

const DESTINOS: Destino[] = [
  { appId: 1, nombre: "SecuritySuite", menuParentId: 18, menuPath: "/dashboard/docs", rolId: 57 },
  { appId: 3, nombre: "GOYA", menuParentId: 10, menuPath: "/dashboard/docs", rolId: 55 },
  { appId: 5, nombre: "RiogasTracking", menuParentId: null, menuPath: null, rolId: 52 },
];

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function seedApp(destino: Destino, opts: { dryRun: boolean; conMenu: boolean }) {
  const { dryRun, conMenu } = opts;
  const { appId, rolId } = destino;

  const app = await prisma.aplicacion.findUnique({ where: { id: appId } });
  if (!app) throw new Error(`Aplicación ${appId} no existe.`);

  const rol = await prisma.rol.findFirst({ where: { id: rolId, aplicacionId: appId } });
  if (!rol) throw new Error(`Rol ${rolId} no existe en la aplicación ${appId}.`);

  console.log(
    `\n▶ app ${appId} (${app.nombre}) — rol ${rol.id} (${rol.nombre})${destino.menuParentId ? `, menú raíz ${destino.menuParentId}` : ", sin menú en secapi"}`,
  );

  // 1. Objeto PAGE "docs"
  let objeto = await prisma.objeto.findFirst({
    where: { aplicacionId: appId, key: OBJETO_KEY, tipo: "PAGE" },
  });
  if (!objeto) {
    if (dryRun) {
      console.log("  → crearía Objeto PAGE 'docs'");
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
    console.log("  ✔ Dry-run: sin objeto no se puede seguir simulando el resto de esta app.");
    return;
  }

  // 2. Acción 'view' del objeto
  const codigoView = await generarAccionCodigo(OBJETO_KEY, "view");
  let accionView = await prisma.objetoAccion.findFirst({
    where: { objetoId: objeto.id, key: "view" },
  });
  if (!accionView) {
    if (dryRun) {
      console.log(`  → crearía ObjetoAccion 'view' (codigo ${codigoView})`);
    } else {
      accionView = await prisma.objetoAccion.create({
        data: {
          objetoId: objeto.id,
          key: "view",
          descripcion: "Ver la documentación de APIs",
          codigo: codigoView,
          path: null,
          creadoEn: CREADO_EN,
        },
      });
      console.log(`  ✓ ObjetoAccion 'view' creada (id ${accionView.id}, codigo ${codigoView})`);
    }
  } else {
    console.log(`  • ObjetoAccion 'view' ya existía (id ${accionView.id}, codigo ${accionView.codigo})`);
  }

  // 3. Funcionalidad "docs" — acceso por rol Root (solo_root = N)
  let funcionalidad = await prisma.funcionalidad.findFirst({
    where: { aplicacionId: appId, nombre: NOMBRE_FUNCIONALIDAD },
  });
  if (!funcionalidad) {
    if (dryRun) {
      console.log("  → crearía Funcionalidad 'docs' (solo_root = N, acceso por rol Root)");
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
      console.log(`  ✓ Funcionalidad creada (id ${funcionalidad.id}, solo_root=N)`);
    }
  } else {
    console.log(
      `  • Funcionalidad ya existía (id ${funcionalidad.id}, solo_root=${funcionalidad.soloRoot})`,
    );
  }

  // 4. Vínculo funcionalidad ↔ objeto+acción
  if (funcionalidad && accionView) {
    const vinculo = await prisma.funcionalidadObjetoAccion.findFirst({
      where: {
        funcionalidadId: funcionalidad.id,
        objetoId: objeto.id,
        objetoAccionId: accionView.id,
      },
    });
    if (!vinculo) {
      if (dryRun) {
        console.log("  → crearía vínculo funcionalidad↔view");
      } else {
        await prisma.funcionalidadObjetoAccion.create({
          data: {
            funcionalidadId: funcionalidad.id,
            objetoId: objeto.id,
            objetoAccionId: accionView.id,
          },
        });
        console.log("  ✓ Vínculo funcionalidad↔'view' creado");
      }
    } else {
      console.log("  • Vínculo funcionalidad↔'view' ya existía");
    }
  }

  // 5. Otorgar la funcionalidad al rol Root (fila puntual: NO reemplaza el set del rol)
  if (funcionalidad) {
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
  }

  // 6. Punto de menú — solo con --con-menu y solo si la app usa el menú de secapi
  if (!destino.menuParentId) {
    console.log("  — sin punto de menú: esta app no toma el menú de secapi");
    return;
  }
  if (!conMenu) {
    console.log("  — punto de menú diferido (correr con --con-menu cuando /docs esté deployada)");
    return;
  }

  const menuRaiz = await prisma.objeto.findFirst({
    where: { id: destino.menuParentId, aplicacionId: appId, tipo: "MENU", estado: "A" },
  });
  if (!menuRaiz) {
    throw new Error(
      `Objeto ${destino.menuParentId} no es un MENU activo de la aplicación ${appId}.`,
    );
  }

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
      console.log(`  → crearía punto de menú 'docs' (orden ${orden}, codigo ${codigoMenu})`);
    } else {
      puntoMenu = await prisma.objetoAccion.create({
        data: {
          objetoId: menuRaiz.id,
          key: OBJETO_KEY,
          label: OBJETO_LABEL,
          path: destino.menuPath,
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
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const conMenu = hasFlag("con-menu");
  const soloApp = getArg("app");

  const destinos = soloApp
    ? DESTINOS.filter((d) => d.appId === Number(soloApp))
    : DESTINOS;

  if (destinos.length === 0) {
    throw new Error(`No hay destino configurado para --app=${soloApp} (opciones: 1, 3, 5).`);
  }

  console.log(
    `▶ Seed funcionalidad "${NOMBRE_FUNCIONALIDAD}" (acceso: rol Root) en ${destinos.length} aplicación(es)${dryRun ? " [DRY-RUN]" : ""}${conMenu ? " [CON MENÚ]" : ""}`,
  );

  for (const destino of destinos) {
    await seedApp(destino, { dryRun, conMenu });
  }

  console.log("\n✔ Seed completo.");
}

main()
  .catch((e) => {
    console.error("✖ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
