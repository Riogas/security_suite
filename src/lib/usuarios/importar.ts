import prisma from "@/lib/prisma";
import { assignDespachoOnNewUser } from "@/lib/auth/assignDespachoIfEligible";
import { persistEmpFleteraPreference } from "@/lib/auth/persistEmpFleteraPreference";
import { persistEscenarioPreference } from "@/lib/auth/persistEscenarioPreference";
import { buscarColisionesDeIdentidad } from "@/lib/permisos";
import type { ExternalUser } from "@/lib/usuarios/tipos";

// Alta de un usuario externo en PG. Vivía adentro del handler de
// `POST /api/db/usuarios/importar`; está acá para que el job horario de sync
// contra ADMSEC la reuse en vez de escribir un alta paralela que se desincronice
// de la del wizard. Se movió sin tocarle el comportamiento, y los tests de
// caracterización (`scripts/test-importar-crear-usuario.ts`) están para eso.

// Bajado de 50 a 10: el pool de conexiones de Prisma (~9-17 por default) no
// aguanta 50 crearUsuario en paralelo, cada uno con 2-8 round-trips propios;
// contra el volumen real (349 usuarios de ADMSEC) eso revienta con
// P2024 "Timed out fetching a new connection", indistinguible de un dato
// malo del origen porque cae en el mismo `estado: "error"` por usuario.
export const BATCH_SIZE = 10;

/** ROLID de USUMOBILEROLES que representa Despacho (mismo criterio que auth.js). */
const ROL_DESPACHO_SGM = 6;

export type Estado = "creado" | "omitido" | "error";
export interface Detalle {
  username: string;
  estado: Estado;
  motivo?: string;
}

/**
 * Lo único que esta función necesita de Prisma. Existe para poder testearla sin
 * base: dev y prod apuntan a la MISMA Postgres de producción, así que un test
 * que escriba no es una opción. Mismo patrón que `upsertExternalUser`.
 */
export type ClienteCrearUsuario = Pick<typeof prisma, "usuario">;

export async function crearUsuario(
  ext: ExternalUser,
  opts: { conPreferencias: boolean; conRoles: boolean; creadoPor: string; dryRun: boolean },
  cliente: ClienteCrearUsuario = prisma,
): Promise<Detalle> {
  const usernameOriginal = ext.username.trim();
  // Se escribe en minúsculas: es la convención de las filas que ya están
  // (el AS400 las guarda en MAYÚSCULAS y la PG en minúsculas).
  const username = usernameOriginal.toLowerCase();

  try {
    // Re-verificar contra PG: la grilla del paso 2 puede tener minutos de
    // antigüedad, y el import NUNCA actualiza (D4).
    const existente = await cliente.usuario.findFirst({
      where: { username: { equals: usernameOriginal, mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (existente) {
      return { username: usernameOriginal, estado: "omitido", motivo: `Ya existe como "${existente.username}"` };
    }

    if (ext.email) {
      const conEseMail = await cliente.usuario.findFirst({
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

    // Colisión CRUZADA username↔email, que los dos chequeos de arriba no ven:
    // ellos comparan username contra username y email contra email. El que
    // rompe la autenticación es el cruce — `resolveUsuario` busca el sujeto del
    // token con `OR: [username ci, email ci]`, así que importar a alguien cuyo
    // username sea el EMAIL de otro usuario deja ese token matcheando dos filas.
    // Ver el bloque "Identidad no ambigua" en src/lib/permisos.ts.
    const colisiones = await buscarColisionesDeIdentidad(cliente, {
      username,
      email: ext.email,
    });
    if (colisiones.length > 0) {
      return {
        username: usernameOriginal,
        estado: "omitido",
        motivo: `Choca con la identidad de "${colisiones[0].username}" (el usuario de uno es el mail del otro)`,
      };
    }

    if (opts.dryRun) return { username: usernameOriginal, estado: "creado", motivo: "dry-run" };

    const partes = (ext.nombre || "").trim().split(/\s+/).filter(Boolean);

    const creado = await cliente.usuario.create({
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
      // grupos de ADMSEC a roles de RiogasTracking (aplicación 5), incluido el
      // rol Root: usarlo en el import invade otra aplicación y le da root de
      // TrackMovil a cualquiera del grupo 1 de ADMSEC. Los grupos se van a
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
