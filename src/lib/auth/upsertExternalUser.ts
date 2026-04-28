import { prisma } from "@/lib/prisma";
import type { Usuario } from "@prisma/client";
import { authLog } from "./logger";
import type { ExternalSource } from "./types";

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
 */
export async function upsertExternalUser(input: UpsertExternalUserInput): Promise<Usuario> {
  const { username, nombre, email, password, desdeSistema } = input;

  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  const nombreDb = parts[0] || username;
  const apellidoDb = parts.slice(1).join(" ") || null;
  const emailDb = email && email.trim() !== "" ? email.trim() : null;

  try {
    const usuario = await prisma.usuario.upsert({
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

    const existing = await prisma.usuario.findUnique({ where: { email: emailDb } });
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

    const usuario = await prisma.usuario.update({
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
