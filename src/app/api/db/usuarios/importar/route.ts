import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";
import { applyAdmsecGroupRoles } from "@/lib/auth/applyAdmsecGroupRoles";
import { assignDespachoOnNewUser } from "@/lib/auth/assignDespachoIfEligible";
import { persistEmpFleteraPreference } from "@/lib/auth/persistEmpFleteraPreference";
import { persistEscenarioPreference } from "@/lib/auth/persistEscenarioPreference";
import { normalizarUsername } from "@/lib/usuarios/comparar";
import { obtenerFuente } from "@/lib/usuarios/sources";
import type { ExternalUser, OrigenExterno } from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
const BATCH_SIZE = 50;

/** ROLID de USUMOBILEROLES que representa Despacho (mismo criterio que auth.js). */
const ROL_DESPACHO_SGM = 6;

type Estado = "creado" | "omitido" | "error";
interface Detalle {
  username: string;
  estado: Estado;
  motivo?: string;
}

async function crearUsuario(
  ext: ExternalUser,
  opts: { conPreferencias: boolean; conRoles: boolean; creadoPor: string; dryRun: boolean },
): Promise<Detalle> {
  const usernameOriginal = ext.username.trim();
  // Se escribe en minúsculas: es la convención de las filas que ya están
  // (el AS400 las guarda en MAYÚSCULAS y la PG en minúsculas).
  const username = usernameOriginal.toLowerCase();

  try {
    // Re-verificar contra PG: la grilla del paso 2 puede tener minutos de
    // antigüedad, y el import NUNCA actualiza (D4).
    const existente = await prisma.usuario.findFirst({
      where: { username: { equals: usernameOriginal, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (existente) {
      return { username: usernameOriginal, estado: "omitido", motivo: `Ya existe como "${existente.username}"` };
    }

    if (ext.email) {
      const conEseMail = await prisma.usuario.findFirst({
        where: { email: { equals: ext.email.trim(), mode: "insensitive" } },
        select: { username: true },
      });
      if (conEseMail) {
        return {
          username: usernameOriginal,
          estado: "omitido",
          motivo: `El email ya lo tiene "${conEseMail.username}"`,
        };
      }
    }

    if (opts.dryRun) return { username: usernameOriginal, estado: "creado", motivo: "dry-run" };

    const partes = (ext.nombre || "").trim().split(/\s+/).filter(Boolean);

    const creado = await prisma.usuario.create({
      data: {
        username,
        // Vacía a propósito: el login rechaza claves vacías antes de comparar
        // (resolveCredentials.ts:631), así que el fallback de clave local
        // queda inutilizable y estos usuarios SOLO entran validando contra su
        // fuente externa.
        password: "",
        email: ext.email?.trim() || null,
        nombre: partes[0] || null,
        apellido: partes.slice(1).join(" ") || null,
        estado: ext.habilitado ? "A" : "I",
        esExterno: "S",
        usuarioExterno: usernameOriginal,
        tipoUsuario: "E",
        desdeSistema: ext.origen,
        creadoPor: opts.creadoPor,
      },
      select: { id: true, username: true, esRoot: true },
    });

    if (opts.conPreferencias && ext.origen === "SGM") {
      await persistEscenarioPreference(creado.id, ext.extras.escenarioId, ext.extras.escenarioNom, true);
      await persistEmpFleteraPreference(creado.id, ext.extras.empFleteraId, ext.extras.empFleteraNom);
    }

    if (opts.conRoles) {
      if (ext.origen === "SGM") {
        await assignDespachoOnNewUser(
          creado.id,
          creado.username,
          (ext.extras.rolesSgm || []).includes(ROL_DESPACHO_SGM),
        );
      } else {
        await applyAdmsecGroupRoles({
          usuario: { id: creado.id, username: creado.username, esRoot: creado.esRoot },
          groups: ext.extras.grupos || [],
        });
      }
    }

    return { username: usernameOriginal, estado: "creado" };
  } catch (error: any) {
    const msg: string = error?.message || String(error);
    const util = msg.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "Error desconocido";
    console.error(`[Importar] Error con "${usernameOriginal}":`, util);
    return { username: usernameOriginal, estado: "error", motivo: util };
  }
}

// =============================================
// POST /api/db/usuarios/importar
// Body: { origen, usernames[], conPreferencias?, conRoles?, dryRun? }
// Solo CREA. Lo que ya existe se omite con su motivo.
// =============================================
export async function POST(req: NextRequest) {
  try {
    const operador = await resolveUsuario(req);
    if (!operador) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const origen = String(body.origen || "").toUpperCase() as OrigenExterno;
    const usernames: string[] = Array.isArray(body.usernames) ? body.usernames : [];
    const conPreferencias = body.conPreferencias !== false;
    const conRoles = body.conRoles !== false;
    const dryRun = body.dryRun === true;

    if (!ORIGENES.includes(origen)) {
      return NextResponse.json({ success: false, error: `Origen inválido: ${origen}` }, { status: 400 });
    }
    if (usernames.length === 0) {
      return NextResponse.json({ success: false, error: "No se seleccionó ningún usuario" }, { status: 400 });
    }

    const pedidos = new Set(usernames.map(normalizarUsername));
    const todos = await obtenerFuente(origen).list({ soloHabilitados: false });
    const aImportar = todos.filter((u) => pedidos.has(normalizarUsername(u.username)));

    const noEncontrados = [...pedidos].filter(
      (p) => !aImportar.some((u) => normalizarUsername(u.username) === p),
    );

    const creadoPor = `import:${operador.username}`.slice(0, 60);
    const detalles: Detalle[] = noEncontrados.map((u) => ({
      username: u,
      estado: "error" as const,
      motivo: "Ya no está en el origen externo",
    }));

    for (let i = 0; i < aImportar.length; i += BATCH_SIZE) {
      const lote = aImportar.slice(i, i + BATCH_SIZE);
      const res = await Promise.all(
        lote.map((u) => crearUsuario(u, { conPreferencias, conRoles, creadoPor, dryRun })),
      );
      detalles.push(...res);
      console.log(`[Importar] ${detalles.length}/${usernames.length} procesados`);
    }

    const creados = detalles.filter((d) => d.estado === "creado").length;
    const omitidos = detalles.filter((d) => d.estado === "omitido").length;
    const errores = detalles.filter((d) => d.estado === "error").length;

    return NextResponse.json({
      success: true,
      dryRun,
      mensaje: dryRun
        ? `Simulación: se crearían ${creados}, se omitirían ${omitidos}, ${errores} con error.`
        : `Importación completada: ${creados} creados, ${omitidos} omitidos, ${errores} errores.`,
      total: usernames.length,
      creados,
      omitidos,
      errores,
      detalles: detalles.filter((d) => d.estado !== "creado").slice(0, 200),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/importar POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
