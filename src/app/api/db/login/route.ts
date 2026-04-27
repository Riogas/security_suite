import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

/**
 * POST /api/db/login
 *
 * Flujo de autenticación (3 niveles):
 *
 * 1. Busca usuario en PostgreSQL local (tabla usuarios).
 *    a. Si es_externo = 'N' → valida password localmente.
 *    b. Si es_externo = 'S' → valida password contra el sistema externo
 *       indicado en desde_sistema ('SGM' → AS400, 'LDAP' → Active Directory).
 *       Si el externo no responde → fallback a la clave local.
 *
 * 2. Si el usuario NO existe en PostgreSQL:
 *    a. Intenta AS400 (GXICAGEO.USUMOBILE, clave encriptada con GeneXus Encrypt64).
 *       Si la clave está mal (usuario encontrado pero contraseña incorrecta) → 401 sin ir a LDAP.
 *    b. Si el usuario no existe en AS400 o el AS400 está caído → intenta LDAP.
 *    c. Al validar → crea el usuario en PostgreSQL y asigna rol Despacho si corresponde.
 *
 * Body: { UserName, Password, Sistema? }
 * Respuesta: { success, token, user: { id, username, nombre, email, isRoot }, verifiedBy }
 */

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";
const AS400_API_URL = process.env.AS400_API_URL || "";
const DESPACHO_ROL_ID = parseInt(process.env.DESPACHO_ROL_ID || "49", 10);

// ─── Llamadas a AS400 API ─────────────────────────────────────────────────────

async function callAS400Auth(username: string, password: string): Promise<{ success: boolean; message?: string; user?: any } | null> {
  if (!AS400_API_URL) return null;
  try {
    console.log(`[AS400 Auth] Autenticando usuario: ${username}`);
    const res = await fetch(`${AS400_API_URL}/api/auth/as400`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout o servicio caído
  }
}

async function callLDAPAuth(username: string, password: string): Promise<{ success: boolean; user?: any } | null> {
  if (!AS400_API_URL) return null;
  try {
    const res = await fetch(`${AS400_API_URL}/api/auth/ldap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout o servicio caído
  }
}

// ─── Migración de usuario externo a PostgreSQL ────────────────────────────────

async function migrateExternalUser(opts: {
  username: string;
  nombre: string;
  email: string;
  password: string;
  desdeSistema: "SGM" | "LDAP";
  assignDespacho: boolean;
}) {
  const { username, nombre, email, password, desdeSistema, assignDespacho } = opts;

  const parts = nombre.trim().split(/\s+/);
  const nombreDb = parts[0] || username;
  const apellidoDb = parts.slice(1).join(" ") || null;
  const emailDb = email || null;

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
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
    });
    console.log(`✅ [Login] Usuario ${username} migrado desde ${desdeSistema}. Despacho: ${assignDespacho}`);
  } catch (err) {
    // P2002 = unique constraint. Puede dispararse por email (usuario migrado de un sistema viejo
    // con otro username, ej. CI). Buscamos por email y re-vinculamos esa fila al nuevo username.
    const code = (err as { code?: string })?.code;
    const target = (err as { meta?: { target?: string[] } })?.meta?.target ?? [];
    const isEmailConflict = code === "P2002" && target.includes("email") && !!emailDb;

    if (!isEmailConflict) throw err;

    const existing = await prisma.usuario.findUnique({ where: { email: emailDb } });
    if (!existing) throw err;

    if (existing.estado === "I") {
      console.log(`❌ [Login] Email ${emailDb} pertenece a usuario inactivo id=${existing.id} (${existing.username}). No se re-vincula.`);
      throw err;
    }

    usuario = await prisma.usuario.update({
      where: { id: existing.id },
      data: {
        username,
        password,
        esExterno: "S",
        usuarioExterno: username,
        tipoUsuario: "E",
        desdeSistema,
        // Preservamos nombre/apellido si ya estaban completos; si no, usamos los del LDAP/SGM.
        nombre: existing.nombre || nombreDb,
        apellido: existing.apellido || apellidoDb,
      },
    });
    console.log(`🔁 [Login] Usuario re-vinculado: id=${existing.id} username "${existing.username}" → "${username}" (email=${emailDb}, origen=${desdeSistema})`);
  }

  if (assignDespacho) {
    // Solo asignamos Despacho si no tiene roles previos (no pisamos asignaciones manuales del re-vinculado).
    const rolesCount = await prisma.usuarioRol.count({ where: { usuarioId: usuario.id } });
    if (rolesCount === 0) {
      await prisma.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID } },
        create: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID },
        update: {},
      }).catch((err: Error) => {
        console.error(`⚠️ [Login] No se pudo asignar rol Despacho (rolId=${DESPACHO_ROL_ID}):`, err.message);
      });
    } else {
      console.log(`ℹ️ [Login] ${username} ya tenía ${rolesCount} rol(es), no se asigna Despacho.`);
    }
  }

  return usuario;
}

// ─── Asignación condicional de rol Despacho a usuario LDAP existente (Escenario B) ─────

async function assignDespachoIfEligible(opts: {
  usuario: { id: number; desdeSistema: string | null; esExterno: string | null; username: string };
  ldapResult: { success: boolean; user?: any } | null;
}): Promise<void> {
  const { usuario, ldapResult } = opts;

  if (!ldapResult || !ldapResult.success) return;
  if (usuario.desdeSistema?.trim() !== "LDAP") return;
  if (usuario.esExterno?.trim() !== "S") return;
  if (!ldapResult.user?.isDespacho) return;

  const rolesCount = await prisma.usuarioRol.count({ where: { usuarioId: usuario.id } });
  if (rolesCount > 0) return;

  await prisma.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID } },
    create: { usuarioId: usuario.id, rolId: DESPACHO_ROL_ID },
    update: {},
  }).then(() => {
    console.log(`✅ [Login] Rol Despacho asignado a ${usuario.username} (existente LDAP, sin roles, grupo 52)`);
  }).catch((err: Error) => {
    console.error(`⚠️ [Login] No se pudo asignar rol Despacho a ${usuario.username} (rolId=${DESPACHO_ROL_ID}):`, err.message);
  });
}

// ─── Respuesta de éxito ───────────────────────────────────────────────────────

async function buildSuccessResponse(usuario: any, sistema: string, verifiedBy: string) {
  const [, roles, preferencias, accesos] = await Promise.all([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { fechaUltimoLogin: new Date() },
    }),
    prisma.usuarioRol.findMany({
      where: { usuarioId: usuario.id },
      include: {
        rol: {
          include: {
            funcionalidades: { select: { funcionalidadId: true } },
          },
        },
      },
    }),
    prisma.usuarioPreferencia.findMany({
      where: { usuarioId: usuario.id },
      select: { atributo: true, valor: true },
    }),
    prisma.acceso.findMany({
      where: { usuarioId: usuario.id },
      select: { funcionalidadId: true, efecto: true },
    }),
  ]);

  const token = jwt.sign(
    { iss: "security-suite", username: usuario.username, userId: usuario.id, sistema },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(" ").trim() || usuario.username;

  return NextResponse.json({
    success: true,
    message: "",
    token,
    expiresIn: "604800",
    requireIdentity: false,
    verifiedBy,
    user: {
      id: String(usuario.id),
      username: usuario.username.trim(),
      nombre,
      email: usuario.email || "",
      isRoot: usuario.esRoot || "N",
    },
    roles: roles.map(ur => ({
      rolId: ur.rolId,
      rolNombre: ur.rol.nombre,
      aplicacionId: ur.rol.aplicacionId,
      funcionalidades: ur.rol.funcionalidades.map(rf => rf.funcionalidadId),
    })),
    preferencias: preferencias.map(p => ({ atributo: p.atributo, valor: p.valor })),
    accesos: accesos.map(a => ({ funcionalidadId: a.funcionalidadId, efecto: a.efecto })),
  });
}

function unauthorized(message = "Credenciales inválidas") {
  return NextResponse.json(
    { success: false, message, token: "", user: null, expiresIn: "0", requireIdentity: false, verifiedBy: "" },
    { status: 401 }
  );
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { UserName, Password, Sistema } = body;

    if (!UserName || !Password) {
      return NextResponse.json(
        { success: false, message: "UserName y Password son requeridos", token: "", user: null, expiresIn: "0", requireIdentity: false, verifiedBy: "" },
        { status: 400 }
      );
    }

    const username = UserName.trim();
    const password = Password.trim();
    const sistema = (Sistema || "").trim();

    console.log(`[Login] Intento: ${username}`);

    // ── Nivel 1: usuario en PostgreSQL local ──────────────────────────────────
    const usuarioLocal = await prisma.usuario.findUnique({ where: { username } });

    if (usuarioLocal) {
      console.log(`[Login] ${username} en DB local — estado=${usuarioLocal.estado} esExterno=${usuarioLocal.esExterno} desdeSistema=${usuarioLocal.desdeSistema}`);
      if (usuarioLocal.estado === "I") {
        return NextResponse.json(
          { success: false, message: "Usuario inactivo", token: "", user: null, expiresIn: "0", requireIdentity: false, verifiedBy: "" },
          { status: 403 }
        );
      }

      if (usuarioLocal.esExterno === "S") {
        // Usuario externo: validar contra sistema de origen; fallback a clave local si está caído
        const origen = usuarioLocal.desdeSistema as "SGM" | "LDAP";
        let externalOk = false;
        let externalDown = false;

        const result = origen === "SGM"
          ? await callAS400Auth(username, password)
          : await callLDAPAuth(username, password);

        if (result === null) {
          externalDown = true;
          console.warn(`⚠️ [Login] ${origen} no disponible — fallback a clave local para ${username}`);
        } else {
          externalOk = result.success;
        }

        if (externalDown) {
          if (usuarioLocal.password !== password) return unauthorized();
        } else if (!externalOk) {
          return unauthorized();
        }

        // Escenario B: solo si LDAP autenticó OK (no fallback) y el origen es LDAP
        if (!externalDown && origen === "LDAP") {
          await assignDespachoIfEligible({ usuario: usuarioLocal, ldapResult: result });
        }

        return buildSuccessResponse(usuarioLocal, sistema, externalDown ? "local-fallback" : origen.toLowerCase());
      }

      // Usuario local normal
      if (usuarioLocal.password !== password) return unauthorized();
      return buildSuccessResponse(usuarioLocal, sistema, "local-db");
    }

    // ── Nivel 2: no existe → buscar en AS400 ─────────────────────────────────
    console.log(`[Login] ${username} no en DB local. Probando AS400...`);
    const as400Result = await callAS400Auth(username, password);

    if (as400Result?.success) {
      const nuevo = await migrateExternalUser({
        username,
        nombre: as400Result.user.nombre || username,
        email: as400Result.user.email || "",
        password,
        desdeSistema: "SGM",
        assignDespacho: !!as400Result.user.hasRoleDespacho,
      });
      return buildSuccessResponse(nuevo, sistema, "sgm");
    }

    // Si AS400 encontró el usuario pero la clave era incorrecta → 401 directo (no ir a LDAP)
    const as400WrongPassword = as400Result !== null && !as400Result.success && as400Result.message !== "Usuario no encontrado";
    if (as400WrongPassword) {
      return unauthorized();
    }

    // ── Nivel 3: no existe en AS400 (o AS400 caído) → buscar en LDAP ─────────
    const as400Down = as400Result === null;
    console.log(`[Login] ${username} no en AS400${as400Down ? " (caído)" : ""}. Probando LDAP...`);
    const ldapResult = await callLDAPAuth(username, password);

    if (ldapResult?.success) {
      const nuevo = await migrateExternalUser({
        username,
        nombre: ldapResult.user.nombre || username,
        email: ldapResult.user.email || "",
        password,
        desdeSistema: "LDAP",
        assignDespacho: !!ldapResult.user.isDespacho,
      });
      return buildSuccessResponse(nuevo, sistema, "ldap");
    }

    if (ldapResult === null) {
      console.warn(`⚠️ [Login] LDAP también caído. Sin acceso para ${username}`);
    }

    return unauthorized();
  } catch (error) {
    console.error("[Login] Error:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor", token: "", user: null, expiresIn: "0", requireIdentity: false, verifiedBy: "" },
      { status: 500 }
    );
  }
}
