import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRoot } from "@/lib/docs/root-guard";
import { assignDespachoOnNewUser } from "@/lib/auth/assignDespachoIfEligible";
import { persistEmpFleteraPreference } from "@/lib/auth/persistEmpFleteraPreference";
import { persistEscenarioPreference } from "@/lib/auth/persistEscenarioPreference";
import { normalizarUsername } from "@/lib/usuarios/comparar";
import { obtenerFuente } from "@/lib/usuarios/sources";
import type { ExternalUser, OrigenExterno } from "@/lib/usuarios/tipos";

const ORIGENES: OrigenExterno[] = ["SGM", "LDAP", "GSIST"];
// Bajado de 50 a 10: el pool de conexiones de Prisma (~9-17 por default) no
// aguanta 50 crearUsuario en paralelo, cada uno con 2-8 round-trips propios;
// contra el volumen real (349 usuarios de ADMSEC) eso revienta con
// P2024 "Timed out fetching a new connection", indistinguible de un dato
// malo del origen porque cae en el mismo `estado: "error"` por usuario.
const BATCH_SIZE = 10;
/** Tope de usernames por request: la cantidad de escrituras la define el servidor, no el cliente. */
const MAX_USERNAMES = 2000;

/** ROLID de USUMOBILEROLES que representa Despacho (mismo criterio que auth.js). */
const ROL_DESPACHO_SGM = 6;

type Estado = "creado" | "omitido" | "error";
interface Detalle {
  username: string;
  estado: Estado;
  motivo?: string;
}

/**
 * Traduce el `code` de `requireRoot` a un mensaje en español que un operador
 * entienda. NUNCA se devuelve `guard.code` crudo: son nombres internos del
 * guard (p.ej. "SECRETO_NO_CONFIGURADO") pensados para logs, no para un toast.
 * Ver los códigos posibles en `src/lib/docs/root-guard.ts` (`CodigoDenegacion`).
 */
function mensajeDenegacion(codigo: string): string {
  switch (codigo) {
    case "SIN_TOKEN":
    case "TOKEN_INVALIDO":
    case "TOKEN_VENCIDO":
    case "USUARIO_NO_ENCONTRADO":
      return "Tu sesión no es válida, volvé a iniciar sesión";
    case "NO_ROOT":
      // Mismo texto que el chequeo de esRoot de más abajo: para el operador
      // es el mismo motivo, aunque acá lo decide `requireRoot` (sin es_root
      // ni la funcionalidad `docs`) y allá esta ruta con `esRoot !== 'S'`.
      return "La importación de usuarios requiere ser root";
    case "SECRETO_NO_CONFIGURADO":
    case "ERROR_GUARD":
      return "El servidor no está configurado para autorizar esta operación; avisá a sistemas";
    default:
      return "No se pudo autorizar la operación";
  }
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
        // Truncado a los límites reales de columna (nombre/apellido
        // VarChar(60), email VarChar(120) — prisma/schema.prisma:31-33). Sin
        // esto, un nombre completo largo que SGM manda en una sola columna
        // (p.ej. "MARIA DE LOS ANGELES RODRIGUEZ FERNANDEZ DA SILVA", 43
        // caracteres de apellido) revienta el create de Prisma; el catch de
        // abajo lo atrapa y ese usuario sale como estado:"error" en medio de
        // un lote de 92, indistinguible de un dato malo del origen. Mismo
        // patrón que `backfillDatosLdap` (resolveCredentials.ts:394,397,403).
        email: ext.email?.trim().slice(0, 120) || null,
        nombre: (partes[0] || "").slice(0, 60) || null,
        apellido: partes.slice(1).join(" ").slice(0, 60) || null,
        estado: ext.habilitado ? "A" : "I",
        esExterno: "S",
        usuarioExterno: usernameOriginal,
        tipoUsuario: "E",
        desdeSistema: ext.origen,
        creadoPor: opts.creadoPor,
      },
      select: { id: true, username: true },
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
      }
      // Para LDAP/GSIST NO se asignan roles acá. `applyAdmsecGroupRoles` mapea
      // grupos de ADMSEC a roles de RiogasTracking (aplicación 5) y puede
      // setear `esRoot='S'` (flag global del usuario, no de una aplicación
      // puntual): usarlo en el import invadía otra aplicación y otorgaba root
      // a cualquiera del grupo 1 de ADMSEC. Los grupos de ADMSEC se van a
      // reflejar como roles de la aplicación "Gestión de Sistemas" (id 2) en
      // un trabajo aparte; hasta entonces el import no otorga roles para
      // estos orígenes. El login (`resolveCredentials.ts`) sigue usando
      // `applyAdmsecGroupRoles` sin cambios: es otra decisión, no se toca acá.
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
    // Gate real: `resolveUsuario` decodifica el JWT sin verificar firma ni
    // vencimiento (`decodeJwt` es base64 puro), y este endpoint no pasa por
    // `src/proxy.ts` (su matcher excluye `/api`). `requireRoot` es la
    // primitiva que sí hace `jwt.verify` contra JWT_SECRET, exige que el
    // secreto sea real (no el default del código) y es fail-closed: sin
    // secreto configurado, deniega con 503 en vez de dejar pasar.
    // Ya trae `usuario.username`, así que no hace falta resolverlo aparte.
    const guard = await requireRoot(req);
    if (!guard.ok) {
      // Nunca `guard.code` crudo (ver `mensajeDenegacion`): filtró hasta acá
      // porque este endpoint no pasaba por `src/proxy.ts`, y códigos como
      // "SECRETO_NO_CONFIGURADO" no le sirven a quien ve el toast.
      return NextResponse.json({ success: false, error: mensajeDenegacion(guard.code) }, { status: guard.status });
    }
    // requireRoot también deja pasar a quien tenga la funcionalidad `docs`
    // otorgada (pensada para VER el portal de documentación de APIs), y ese
    // permiso no tiene nada que ver con crear usuarios ni con otorgar Root.
    // Este endpoint exige es_root='S' explícitamente, encima del guard.
    if (guard.usuario.esRoot !== "S") {
      return NextResponse.json(
        { success: false, error: "La importación de usuarios requiere ser root" },
        { status: 403 },
      );
    }
    // Username ya verificado por requireRoot (jwt.verify + resolución contra
    // PG): no hace falta una segunda llamada a resolveUsuario.
    const operador = guard.usuario;

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
