import { prisma } from "@/lib/prisma";
import type { Usuario } from "@prisma/client";
import { authLog } from "./logger";
import type { ExternalSource } from "./types";

/**
 * Lo unico que este modulo necesita de Prisma. Existe para poder probar la rama
 * de conflicto de email sin una base: es la rama que decide si una fila cambia
 * de dueno, y es exactamente la que no se puede dejar sin test.
 */
export interface ClienteUpsert {
  usuario: {
    upsert: (args: any) => Promise<Usuario>;
    findUnique: (args: any) => Promise<Usuario | null>;
    update: (args: any) => Promise<Usuario>;
  };
  usuarioRol: { count: (args: any) => Promise<number> };
}

interface UpsertExternalUserInput {
  username: string;
  nombre: string;
  email: string;
  password: string;
  desdeSistema: ExternalSource; // 'SGM' | 'GSIST' | 'LDAP'
}

/**
 * Crea o actualiza un usuario externo en PostgreSQL después de un login exitoso
 * contra una fuente externa (SGM, GSIST o LDAP).
 *
 * Estrategia:
 *  1. Intenta upsert por username (case-sensitive — el campo es @unique).
 *  2. Si falla por conflicto de email (P2002 en columna email), re-vincula la
 *     fila existente al nuevo username (caso típico: usuario migrado de un sistema
 *     viejo con otro username, ej. CI).
 *
 * El re-vínculo NO se hace si la fila existente está inactiva o si tiene roles
 * asignados: en los dos casos corta el login y lo deja en el log para que lo
 * mire una persona. El motivo del segundo está explicado abajo, en el punto
 * donde se chequea — en resumen, el re-vínculo cambia de dueño la fila, y desde
 * que root es un rol eso alcanzaría para quedarse con la cuenta de un root.
 */
export async function upsertExternalUser(
  input: UpsertExternalUserInput,
  cliente: ClienteUpsert = prisma as unknown as ClienteUpsert,
): Promise<Usuario> {
  const { username, nombre, email, password, desdeSistema } = input;

  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  const nombreDb = parts[0] || username;
  const apellidoDb = parts.slice(1).join(" ") || null;
  const emailDb = email && email.trim() !== "" ? email.trim() : null;

  try {
    const usuario = await cliente.usuario.upsert({
      where: { username },
      create: {
        username,
        password,
        email: emailDb,
        nombre: nombreDb,
        apellido: apellidoDb,
        estado: "A",
        esExterno: "S",
        usuarioExterno: username,
        tipoUsuario: "E",
        desdeSistema,
        creadoPor: "auto-migration",
      },
      update: {
        // Actualizamos solo los campos que reflejan estado externo.
        // No tocamos nombre/apellido/email si ya estaban — los preserva el operador.
        password,
        esExterno: "S",
        desdeSistema,
        usuarioExterno: username,
      },
    });
    authLog.info("upsertExternalUser ok", { username, desdeSistema, id: usuario.id });
    return usuario;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const target = (err as { meta?: { target?: string[] } })?.meta?.target ?? [];
    const isEmailConflict = code === "P2002" && target.includes("email") && !!emailDb;
    if (!isEmailConflict) throw err;

    const existing = await cliente.usuario.findUnique({ where: { email: emailDb } });
    if (!existing) throw err;

    if (existing.estado === "I") {
      authLog.warn("upsertExternalUser email conflict on inactive user", {
        username,
        emailConflict: emailDb,
        existingId: existing.id,
        existingUsername: existing.username,
      });
      throw err;
    }

    /*
     * NO se re-vincula sobre una fila que tenga roles asignados.
     *
     * El re-vínculo le escribe a la fila existente el username y la clave del
     * usuario que viene de la fuente externa, y NO toca `usuario_roles`. O sea
     * que la fila —con sus roles— cambia de dueño. Mientras root era la columna
     * `es_root` eso ya era feo; desde que root ES una fila de `usuario_roles`,
     * quien controle una cuenta de AD cuyo mail coincida con el de un root de
     * secapi se queda con la fila del root, roles incluidos, con solo loguearse.
     *
     * La condición es "tiene roles" y no "es root" a propósito: cualquier fila
     * con roles representa a alguien con permisos concedidos a mano, y fusionar
     * dos identidades sin que lo mire una persona no es aceptable ahí. El caso
     * legítimo para el que se escribió esto —alguien cargado a mano que después
     * empieza a entrar por AD y quiere conservar su identidad— casi nunca tiene
     * roles, así que sigue funcionando igual.
     *
     * Se corta el login con el mismo error que el resto de los conflictos, y se
     * loguea en nivel error: si esto aparece, o es un ataque o son dos personas
     * pisadas en la base, y las dos cosas las tiene que resolver alguien.
     */
    const rolesDeLaFila = await cliente.usuarioRol.count({
      where: { usuarioId: existing.id },
    });
    if (rolesDeLaFila > 0) {
      authLog.error("upsertExternalUser email conflict on user WITH roles", {
        username,
        emailConflict: emailDb,
        existingId: existing.id,
        existingUsername: existing.username,
        roles: rolesDeLaFila,
        detalle:
          "no se re-vincula: la fila tiene roles asignados y el re-vínculo la pondría a nombre del usuario externo",
      });
      throw err;
    }

    const usuario = await cliente.usuario.update({
      where: { id: existing.id },
      data: {
        username,
        password,
        esExterno: "S",
        usuarioExterno: username,
        tipoUsuario: "E",
        desdeSistema,
        nombre: existing.nombre || nombreDb,
        apellido: existing.apellido || apellidoDb,
      },
    });
    authLog.info("upsertExternalUser re-linked by email", {
      username,
      previousUsername: existing.username,
      desdeSistema,
      id: usuario.id,
    });
    return usuario;
  }
}
