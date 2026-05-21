import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/db/usuarios/por-username?username=X
// Devuelve los datos del usuario (tabla `usuarios`) que coincida con el
// username pasado. Match exacto (la columna username es UNIQUE).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = (searchParams.get("username") || "").trim();

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro "username" es requerido. Ej: ?username=jperez',
        },
        { status: 400 },
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        nombre: true,
        apellido: true,
        estado: true,
        fechaCreacion: true,
        fechaBaja: true,
        fechaUltimoLogin: true,
        esExterno: true,
        usuarioExterno: true,
        tipoUsuario: true,
        modificaPermisos: true,
        cambioPassword: true,
        intentosFallidos: true,
        fechaUltimoBloqueo: true,
        telefono: true,
        creadoPor: true,
        desdeSistema: true,
        esRoot: true,
        fechaUltimoPermiso: true,
        observacion: true,
        observacion2: true,
      },
    });

    if (!usuario) {
      return NextResponse.json(
        { success: false, error: "usuario no encontrado" },
        { status: 404 },
      );
    }

    // Empresa(s) fletera(s) del usuario (UsuarioPreferencia atributo="EmpFletera")
    // Puede venir en dos shapes históricos que coexisten:
    //   - Una sola fila con un JSON array: [{"Nombre":"X","Valor":1}, ...]
    //   - Varias filas (una por empresa), cada una con su propio JSON o string
    // Combinamos ambos casos en un array plano para que el cliente
    // (extractEmpFletera en TrackMovil / security_suite) muestre todas.
    const prefs = await prisma.usuarioPreferencia.findMany({
      where: { usuarioId: usuario.id, atributo: "EmpFletera" },
      select: { valor: true },
    });

    let empFletera: unknown = null;
    if (prefs.length > 0) {
      const items: unknown[] = [];
      for (const p of prefs) {
        const raw = p.valor;
        if (raw == null || raw === "") continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        if (Array.isArray(parsed)) {
          items.push(...parsed);
        } else {
          items.push(parsed);
        }
      }
      if (items.length === 1) {
        empFletera = items[0];
      } else if (items.length > 1) {
        empFletera = items;
      }
    }

    return NextResponse.json({
      success: true,
      item: { ...usuario, empFletera },
    });
  } catch (error) {
    console.error("[API/db/usuarios/por-username GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener usuario" },
      { status: 500 },
    );
  }
}
