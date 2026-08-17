import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUsuario } from "@/lib/permisos";
import { compararUsuarios, resumir } from "@/lib/usuarios/comparar";
import { obtenerFuente, obtenerTodasLasFuentes } from "@/lib/usuarios/sources";
import type {
  EstadoComparacion,
  ExternalUser,
  ExternalUserComparado,
  OrigenExterno,
} from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
const ESTADOS: EstadoComparacion[] = ["NUEVO", "MIGRADO", "DIFIERE", "CONFLICTO"];

function coincideFiltro(u: ExternalUserComparado, filtro: string): boolean {
  if (!filtro) return true;
  const f = filtro.toLowerCase();
  return (
    u.username.toLowerCase().includes(f) ||
    (u.nombre || "").toLowerCase().includes(f) ||
    (u.email || "").toLowerCase().includes(f)
  );
}

// =============================================
// GET /api/db/usuarios/externos
// Lista los usuarios de los orígenes externos, cruzados contra PostgreSQL.
// Query: origen, filtro, estadoComparacion, incluirDeshabilitados, page, pageSize
// =============================================
export async function GET(req: NextRequest) {
  try {
    const usuario = await resolveUsuario(req);
    if (!usuario) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const origenParam = (searchParams.get("origen") || "todos").toUpperCase();
    const filtro = (searchParams.get("filtro") || "").trim();
    const estadoParam = (searchParams.get("estadoComparacion") || "todos").toUpperCase();
    const incluirDeshabilitados = searchParams.get("incluirDeshabilitados") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "25")));

    const fuentes =
      origenParam === "TODOS"
        ? obtenerTodasLasFuentes()
        : ORIGENES.includes(origenParam as OrigenExterno)
          ? [obtenerFuente(origenParam as OrigenExterno)]
          : [];

    if (fuentes.length === 0) {
      return NextResponse.json({ success: false, error: `Origen inválido: ${origenParam}` }, { status: 400 });
    }

    // Traer los externos y los locales en paralelo. Los locales son ~850 filas
    // con 7 columnas: una query, sin joins.
    const [resultados, locales] = await Promise.all([
      Promise.all(
        fuentes.map(async (f) => {
          try {
            const users = await f.list({ soloHabilitados: !incluirDeshabilitados });
            return { origen: f.key, ok: true, reason: null as string | null, users };
          } catch (e) {
            console.error(`[externos] fuente ${f.key} falló:`, (e as Error).message);
            return { origen: f.key, ok: false, reason: (e as Error).message, users: [] as ExternalUser[] };
          }
        }),
      ),
      prisma.usuario.findMany({
        select: {
          id: true,
          username: true,
          nombre: true,
          apellido: true,
          email: true,
          estado: true,
          desdeSistema: true,
        },
      }),
    ]);

    const externos = resultados.flatMap((r) => r.users);
    const comparados = compararUsuarios(externos, locales);

    // El resumen aplica el filtro de TEXTO (si no, el botón y los chips
    // prometerían importar usuarios que el filtro de la grilla ya descartó),
    // pero ignora estadoComparacion: si el resumen también respetara el
    // estado, los propios chips que filtran por estado se recalcularían al
    // clickearlos y quedarían en cero.
    const filtrados = comparados.filter((u) => coincideFiltro(u, filtro));
    const resumen = resumir(filtrados);

    let visibles = filtrados;
    if (ESTADOS.includes(estadoParam as EstadoComparacion)) {
      visibles = visibles.filter((u) => u.estadoComparacion === estadoParam);
    }
    visibles.sort((a, b) => a.username.localeCompare(b.username));

    const total = visibles.length;
    const items = visibles.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      resumen,
      fuentes: resultados.map((r) => ({ origen: r.origen, ok: r.ok, reason: r.reason })),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/externos GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
