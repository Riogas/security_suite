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

    // Empresa(s) fletera(s) del usuario (UsuarioPreferencia atributo="EmpFletera").
    // Shapes historicos que coexisten en `valor`:
    //   A) JSON array de objetos:  [{"Nombre":"X","Valor":1}, {"Nombre":"Y","Valor":2}]
    //   B) JSON objeto unico:      {"Nombre":"X","Valor":1}
    //   C) JSON diccionario:       {"NOMBRE X":"16","NOMBRE Y":"66"}  (key=nombre, value=id)
    //   D) Varias filas, cada una con cualquiera de los shapes anteriores.
    //   E) String pelado (legacy crudo).
    // Normalizamos todo a un array uniforme [{Nombre, Valor}, ...] para que el
    // cliente (extractEmpFletera en TrackMovil / security_suite) no tenga que
    // adivinar la forma.
    const prefs = await prisma.usuarioPreferencia.findMany({
      where: { usuarioId: usuario.id, atributo: "EmpFletera" },
      select: { valor: true },
    });

    type EmpFleteraItem = { Nombre: string; Valor: string };
    const items: EmpFleteraItem[] = [];
    const seen = new Set<string>(); // dedup por "Nombre|Valor"
    const pushItem = (nombre: string | undefined, valor: string | number | undefined) => {
      const n = (nombre ?? "").trim();
      if (!n) return;
      const v = valor == null ? "" : String(valor);
      const key = `${n}|${v}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ Nombre: n, Valor: v });
    };
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
        for (const it of parsed) {
          if (typeof it === "string") {
            pushItem(it, undefined);
          } else if (typeof it === "object" && it !== null) {
            const o = it as { Nombre?: string; Valor?: string | number };
            pushItem(o.Nombre, o.Valor);
          }
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        const o = parsed as Record<string, unknown>;
        if (typeof o.Nombre === "string") {
          // Shape B: objeto unico {Nombre, Valor}
          pushItem(o.Nombre, o.Valor as string | number | undefined);
        } else {
          // Shape C: diccionario {nombre: id}
          for (const [k, v] of Object.entries(o)) {
            pushItem(k, v as string | number | undefined);
          }
        }
      } else if (typeof parsed === "string") {
        pushItem(parsed, undefined);
      }
    }
    // Siempre devolvemos array (o null si no hay nada) — shape uniforme.
    const empFletera: EmpFleteraItem[] | null = items.length > 0 ? items : null;

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
