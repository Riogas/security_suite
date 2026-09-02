import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/apiGuard";
import { normalizarUsername } from "@/lib/usuarios/comparar";
import { BATCH_SIZE, crearUsuario, type Detalle } from "@/lib/usuarios/importar";
import { obtenerFuente } from "@/lib/usuarios/sources";
import type { OrigenExterno } from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
/** Tope de usernames por request: la cantidad de escrituras la define el servidor, no el cliente. */
const MAX_USERNAMES = 2000;

// =============================================
// POST /api/db/usuarios/importar
// Body: { origen, usernames[], conPreferencias?, conRoles?, dryRun? }
// Solo CREA. Lo que ya existe se omite con su motivo.
// =============================================
export async function POST(req: NextRequest) {
  // Guard de /api/db, nivel ADMIN sobre el objeto `usuarios`
  // (src/lib/auth/apiGuard.ts): firma HS256 verificada, vencimiento, secreto
  // real (no el default del código), usuario activo en PG, y root de secapi O
  // la funcionalidad de administrar usuarios otorgada por un root. Fail-closed:
  // sin secreto configurado deniega con 503 en vez de dejar pasar.
  //
  // Bajó de ROOT a ADMIN junto con el resto de la administración de usuarios:
  // dar de alta gente no otorga privilegios, y los usuarios importados nacen
  // sin roles. La única excepción está más abajo (`conRoles` →
  // `assignDespachoOnNewUser`) y el rol que asigna es UNO fijo, tomado de
  // `DESPACHO_ROL_ID`, sobre un usuario recién creado y sin roles: no lo elige
  // el que llama, así que no sirve para escalar.
  //
  // Antes acá se llamaba a `requireRoot` (el gate de /docs) y encima se
  // rechequeaba la columna `es_root`, porque requireRoot también deja pasar a
  // quien tenga la funcionalidad `docs` — que sirve para VER el portal de
  // documentación y nada tiene que ver con crear usuarios. El nivel del guard
  // ya dice lo que hay que decir, así que ese doble chequeo sobra.
  const guard = await requireApiAuth(req);
  if (!guard.ok) return guard.respuesta;

  try {
    // Usuario ya verificado y resuelto por el guard: no hace falta una segunda
    // llamada a resolveUsuario. En nivel ROOT nunca viene null; el `??` es para
    // el tipo.
    const operador = guard.usuario;
    if (!operador) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const origen = String(body.origen || "").toUpperCase() as OrigenExterno;
    const usernamesRaw: unknown[] = Array.isArray(body.usernames) ? body.usernames : [];
    // Opt-in explícito: `!== false` es fail-open sobre un switch que otorga
    // privilegios (assignDespachoOnNewUser, único camino que queda detrás de
    // este flag — ver el comentario junto a su llamada más abajo). Un campo
    // omitido, un typo, o un body malformado ya no habilitan roles por default.
    const conRoles = body.conRoles === true;
    // conPreferencias sigue con default true a propósito: no otorga
    // privilegios, y apagarlo por omisión degradaría importaciones en silencio.
    const conPreferencias = body.conPreferencias !== false;
    const dryRun = body.dryRun === true;

    if (!ORIGENES.includes(origen)) {
      return NextResponse.json({ success: false, error: `Origen inválido: ${origen}` }, { status: 400 });
    }
    if (usernamesRaw.length > MAX_USERNAMES) {
      return NextResponse.json(
        {
          success: false,
          error: `Se enviaron ${usernamesRaw.length} usernames; el máximo por importación es ${MAX_USERNAMES}`,
        },
        { status: 400 },
      );
    }
    // Descarta lo que no sea string o quede vacío tras trim: un elemento
    // no-string rompía normalizarUsername (.trim de un número) y devolvía 500
    // en vez de 400; un string vacío podía aparearse con una fila de origen
    // en blanco y llegar a crear un username: "".
    const usernames: string[] = usernamesRaw
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter(Boolean);
    if (usernames.length === 0) {
      return NextResponse.json({ success: false, error: "No se seleccionó ningún usuario" }, { status: 400 });
    }

    // Mapa normalizado→original: para reportar `noEncontrados` con el
    // username tal como lo mandó el cliente (el que el operador vio y
    // seleccionó en la grilla), no con la clave interna en MAYÚSCULAS que usa
    // `pedidos` para matchear. El primero gana: es solo para mostrar, no para
    // matchear, y con un request bien armado no hay colisiones.
    const originalPorNormalizado = new Map<string, string>();
    for (const u of usernames) {
      const norm = normalizarUsername(u);
      if (!originalPorNormalizado.has(norm)) originalPorNormalizado.set(norm, u);
    }

    const pedidos = new Set(usernames.map(normalizarUsername));
    const todos = await obtenerFuente(origen).list({ soloHabilitados: false });
    const aImportar = todos.filter((u) => pedidos.has(normalizarUsername(u.username)));

    const noEncontrados = [...pedidos].filter(
      (p) => !aImportar.some((u) => normalizarUsername(u.username) === p),
    );

    const creadoPor = `import:${operador.username}`.slice(0, 60);
    // "omitido", no "error": el usuario no está roto, ya no está en el origen
    // (lo borraron/deshabilitaron ahí entre que se armó la grilla y se
    // confirmó). Contarlo como error mezclaba dos cosas muy distintas en el
    // panel de una corrida de 426.
    const detalles: Detalle[] = noEncontrados.map((p) => ({
      username: originalPorNormalizado.get(p) ?? p,
      estado: "omitido" as const,
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
      // En dry-run, "creado" es justo lo que el operador necesita ver antes de
      // escribir de verdad (qué se crearía) — filtrarlo lo dejaba con puros
      // contadores, sin lista, antes de una corrida real de 426 filas sobre
      // una base compartida con producción. En una corrida real se sigue
      // filtrando: lo que salió bien no necesita ocupar el panel de detalles.
      detalles: (dryRun ? detalles : detalles.filter((d) => d.estado !== "creado")).slice(0, 200),
    });
  } catch (error: any) {
    console.error("[API /db/usuarios/importar POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
