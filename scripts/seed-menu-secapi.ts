/**
 * scripts/seed-menu-secapi.ts
 *
 * Construye (idempotente) el menú propio de SecuritySuite (aplicación 1) con
 * el MISMO patrón que usa GOYA (aplicación 3), para poder apagar GeneXus:
 *
 *   Objeto tipo=MENU (raíz)
 *     └─ ObjetoAccion por cada punto de menú  (label, path, icon, orden)
 *          └─ relacion → Objeto tipo=PAGE destino
 *                          └─ ObjetoAccion key="view"  (la que se permisa)
 *
 *   + una Funcionalidad por pantalla, vinculada a la acción "view"
 *   + un rol "Root" de la app 1 con todas las funcionalidades
 *
 * Hoy la app 1 solo tiene el objeto "solicitudes": todo el resto del menú
 * venía de GeneXus. Este script siembra lo que falta y REUSA lo que ya existe;
 * nunca borra ni pisa filas ajenas.
 *
 * Uso:
 *   pnpm tsx scripts/seed-menu-secapi.ts --dry-run
 *   pnpm tsx scripts/seed-menu-secapi.ts
 *   pnpm tsx scripts/seed-menu-secapi.ts --usuarios=838,845   (asigna el rol Root)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";
import { generarAccionCodigo } from "../src/lib/objetoAccionCode";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const APP_ID = 1;
const MENU_KEY = "dashboard";
const MENU_LABEL = "Menú principal";
const ROL_ROOT = "Root";

const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry-run");

/**
 * Los puntos del menú, EN ORDEN. `orden` es la posición en el sidebar:
 * Inicio arriba de todo, y el resto agrupado de lo más usado a lo más
 * administrativo. Se puede reordenar después desde /dashboard/menu.
 */
const PUNTOS = [
  { key: "inicio",          label: "Inicio",                path: "/dashboard",                 icon: "home",       func: "Inicio" },
  { key: "usuarios",        label: "Usuarios",              path: "/dashboard/usuarios",        icon: "users",      func: "Usuarios" },
  { key: "roles",           label: "Roles",                 path: "/dashboard/roles",           icon: "shield",     func: "Roles" },
  { key: "aplicaciones",    label: "Aplicaciones",          path: "/dashboard/aplicaciones",    icon: "layoutGrid", func: "Aplicaciones" },
  { key: "funcionalidades", label: "Funcionalidades",       path: "/dashboard/funcionalidades", icon: "settings",   func: "Funcionalidades" },
  { key: "acciones",        label: "Acciones",              path: "/dashboard/acciones",        icon: "zap",        func: "Acciones" },
  { key: "objetos",         label: "Objetos",               path: "/dashboard/objetos",         icon: "folder",     func: "Objetos" },
  { key: "menu",            label: "Menús",                 path: "/dashboard/menu",            icon: "list",       func: "Menus" },
  { key: "permisos",        label: "Permisos",              path: "/dashboard/permisos",        icon: "lock",       func: "Permisos" },
  { key: "solicitudes",     label: "Solicitudes de acceso", path: "/dashboard/solicitudes",     icon: "inbox",      func: "Solicitudes" },
] as const;

const creados: string[] = [];
const reusados: string[] = [];

async function objetoPage(p: (typeof PUNTOS)[number]) {
  const existente = await prisma.objeto.findFirst({
    where: { aplicacionId: APP_ID, key: p.key, tipo: "PAGE" },
  });
  if (existente) {
    reusados.push(`PAGE ${p.key} (#${existente.id})`);
    return existente;
  }
  if (DRY) {
    creados.push(`PAGE ${p.key} path=${p.path}`);
    return { id: -1, key: p.key } as any;
  }
  const o = await prisma.objeto.create({
    data: {
      aplicacionId: APP_ID,
      tipo: "PAGE",
      key: p.key,
      label: p.label,
      path: p.path,
      icon: p.icon,
      orden: 0,
      estado: "A",
    },
  });
  creados.push(`PAGE ${p.key} (#${o.id})`);
  return o;
}

/** Acción "view" del PAGE: es la que se permisa por rol. */
async function accionView(objetoId: number, objetoKey: string) {
  const existente = await prisma.objetoAccion.findFirst({
    where: { objetoId, key: "view" },
  });
  if (existente) {
    reusados.push(`accion view de ${objetoKey}`);
    return existente;
  }
  const codigo = await generarAccionCodigo(objetoKey, "view");
  if (DRY) {
    creados.push(`accion view de ${objetoKey} (codigo ${codigo})`);
    return { id: -1, codigo } as any;
  }
  const a = await prisma.objetoAccion.create({
    data: { objetoId, key: "view", codigo, orden: 0 },
  });
  creados.push(`accion view de ${objetoKey} (codigo ${codigo})`);
  return a;
}

/** Punto de menú: ObjetoAccion colgada del MENU raíz, con relacion al PAGE. */
async function puntoDeMenu(
  menuId: number,
  p: (typeof PUNTOS)[number],
  targetId: number,
  orden: number,
) {
  const existente = await prisma.objetoAccion.findFirst({
    where: { objetoId: menuId, key: p.key },
  });
  if (existente) {
    // El punto ya existe: solo corregimos label/orden/icon/path si cambiaron,
    // que es justo lo que pidió el usuario (Inicio arriba, renombrado).
    const cambios: any = {};
    if (existente.label !== p.label) cambios.label = p.label;
    if (existente.path !== p.path) cambios.path = p.path;
    if (existente.icon !== p.icon) cambios.icon = p.icon;
    if (existente.orden !== orden) cambios.orden = orden;
    if (existente.relacion !== targetId) cambios.relacion = targetId;
    if (Object.keys(cambios).length === 0) {
      reusados.push(`punto ${p.key} (sin cambios)`);
      return existente;
    }
    if (DRY) {
      creados.push(`punto ${p.key} → ACTUALIZAR ${JSON.stringify(cambios)}`);
      return existente;
    }
    const upd = await prisma.objetoAccion.update({
      where: { id: existente.id },
      data: cambios,
    });
    creados.push(`punto ${p.key} actualizado ${JSON.stringify(cambios)}`);
    return upd;
  }
  const codigo = await generarAccionCodigo(MENU_KEY, p.key);
  if (DRY) {
    creados.push(`punto ${p.key} orden=${orden} → objeto #${targetId}`);
    return { id: -1 } as any;
  }
  const a = await prisma.objetoAccion.create({
    data: {
      objetoId: menuId,
      key: p.key,
      label: p.label,
      path: p.path,
      icon: p.icon,
      orden,
      codigo,
      relacion: targetId,
    },
  });
  creados.push(`punto ${p.key} orden=${orden} (#${a.id})`);
  return a;
}

async function main() {
  console.log(DRY ? "== DRY RUN (no escribe nada) ==\n" : "== SEED menú SecuritySuite ==\n");

  // 1) MENU raíz
  let menu = await prisma.objeto.findFirst({
    where: { aplicacionId: APP_ID, tipo: "MENU", key: MENU_KEY },
  });
  if (menu) {
    reusados.push(`MENU raíz (#${menu.id})`);
  } else if (DRY) {
    creados.push(`MENU raíz key=${MENU_KEY}`);
    menu = { id: -1 } as any;
  } else {
    menu = await prisma.objeto.create({
      data: {
        aplicacionId: APP_ID,
        tipo: "MENU",
        key: MENU_KEY,
        label: MENU_LABEL,
        path: "/dashboard",
        icon: "home",
        orden: 0,
        estado: "A",
      },
    });
    creados.push(`MENU raíz (#${menu!.id})`);
  }

  // 2) Un PAGE + su acción view + el punto de menú, por cada entrada
  const funcionalidades: { id: number; nombre: string }[] = [];
  for (let i = 0; i < PUNTOS.length; i++) {
    const p = PUNTOS[i];
    const page = await objetoPage(p);
    const view = await accionView(page.id, p.key);
    await puntoDeMenu(menu!.id, p, page.id, i);

    // 3) Funcionalidad de la pantalla
    let func = await prisma.funcionalidad.findFirst({
      where: { aplicacionId: APP_ID, nombre: p.func },
    });
    if (func) {
      reusados.push(`funcionalidad ${p.func} (#${func.id})`);
    } else if (DRY) {
      creados.push(`funcionalidad ${p.func}`);
      func = { id: -1, nombre: p.func } as any;
    } else {
      func = await prisma.funcionalidad.create({
        // Funcionalidad no tiene `descripcion` (a diferencia de Rol).
        data: {
          aplicacionId: APP_ID,
          nombre: p.func,
          objetoKey: p.key,
          accionKey: "view",
          estado: "A",
        },
      });
      creados.push(`funcionalidad ${p.func} (#${func!.id})`);
    }
    funcionalidades.push({ id: func!.id, nombre: p.func });

    // 4) Vínculo funcionalidad → (objeto, acción view)
    if (!DRY && func!.id > 0 && page.id > 0 && view.id > 0) {
      const ya = await prisma.funcionalidadObjetoAccion.findFirst({
        where: { funcionalidadId: func!.id, objetoId: page.id, objetoAccionId: view.id },
      });
      if (!ya) {
        await prisma.funcionalidadObjetoAccion.create({
          data: { funcionalidadId: func!.id, objetoId: page.id, objetoAccionId: view.id },
        });
        creados.push(`vínculo ${p.func} → ${p.key}.view`);
      } else {
        reusados.push(`vínculo ${p.func} → ${p.key}.view`);
      }
    }
  }

  // 5) Rol Root de la app 1 con todas las funcionalidades
  let rol = await prisma.rol.findFirst({
    where: { aplicacionId: APP_ID, nombre: ROL_ROOT },
  });
  if (rol) {
    reusados.push(`rol ${ROL_ROOT} (#${rol.id})`);
  } else if (DRY) {
    creados.push(`rol ${ROL_ROOT} de la app ${APP_ID}`);
    rol = { id: -1 } as any;
  } else {
    rol = await prisma.rol.create({
      data: {
        aplicacionId: APP_ID,
        nombre: ROL_ROOT,
        descripcion: "Acceso total a SecuritySuite",
        estado: "A",
      },
    });
    creados.push(`rol ${ROL_ROOT} (#${rol!.id})`);
  }

  if (!DRY && rol!.id > 0) {
    for (const f of funcionalidades) {
      if (f.id <= 0) continue;
      const ya = await prisma.rolFuncionalidad.findFirst({
        where: { rolId: rol!.id, funcionalidadId: f.id },
      });
      if (!ya) {
        await prisma.rolFuncionalidad.create({
          data: { rolId: rol!.id, funcionalidadId: f.id },
        });
        creados.push(`rol Root += ${f.nombre}`);
      }
    }
  }

  // 6) Asignación del rol a usuarios (opcional, --usuarios=838,845)
  const usuarios = (arg("usuarios") ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  for (const uid of usuarios) {
    if (DRY || rol!.id <= 0) {
      creados.push(`usuario ${uid} += rol Root`);
      continue;
    }
    const ya = await prisma.usuarioRol.findFirst({
      where: { usuarioId: uid, rolId: rol!.id },
    });
    if (!ya) {
      await prisma.usuarioRol.create({
        data: { usuarioId: uid, rolId: rol!.id, fechaDesde: new Date() },
      });
      creados.push(`usuario ${uid} += rol Root`);
    } else {
      reusados.push(`usuario ${uid} ya tenía el rol Root`);
    }
  }

  console.log("CREADO / ACTUALIZADO:");
  creados.forEach((c) => console.log("  +", c));
  if (!creados.length) console.log("  (nada: ya estaba todo)");
  console.log("\nREUSADO:");
  reusados.forEach((r) => console.log("  =", r));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
