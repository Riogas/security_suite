import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ||
  "https://sgm.glp.riogas.com.uy/servicios/SecuritySuite";

// Convierte fechas tipo "0000-00-00T00:00:00" o vacías a null
function parseGxDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr.startsWith("0000") || dateStr === "") return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// Sanitiza JSON inválido con trailing commas: [{...},] → [{...}]
function sanitizeJson(str: string): string {
  if (!str) return str;
  return str.replace(/,\s*([}\]])/g, "$1");
}

// Trunca un string al máximo de caracteres permitido por la columna
function trunc(val: string | null | undefined, max: number): string | null {
  if (!val) return null;
  return val.trim().substring(0, max) || null;
}

// Para columnas Char(1): extrae el primer char, o devuelve el default si está vacío
function char1(val: string | null | undefined, defaultVal = "N"): string {
  const v = val?.trim();
  if (!v) return defaultVal;
  return v.charAt(0);
}

// Extrae solo el mensaje útil de un error de Prisma, descartando el stack de Turbopack
function cleanError(error: any): string {
  const msg: string = error?.message || String(error);
  // El mensaje útil de Prisma está en la última línea no vacía
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  // Buscar la línea que contiene el error real (después de la línea del código)
  const useful = lines.find((l) =>
    l.startsWith("The ") ||
    l.startsWith("Unique ") ||
    l.startsWith("Foreign ") ||
    l.startsWith("Invalid ") && !l.includes("TURBOPACK") ||
    l.startsWith("Unknown ") ||
    l.startsWith("null value")
  );
  return useful || lines[lines.length - 1] || "Error desconocido";
}

interface SyncRol {
  AplicacionId: string;
  RolNombre: string;
  RolDescripcion: string;
  RolEstado: string;
  RolNivel: string;
  RolCreadoEn: string;
  RolFchIns: string;
  RolId: string;
}

interface SyncAtributo {
  UserPreferenceAtributo: string;
  UserPreferenceValor: string;
  UserPreferenceId: number;
}

interface SyncUsuario {
  UserExtendedUserName: string;
  UserExtendedPassword: string;
  UserExtendedEmail: string;
  UserExtendedNombre: string;
  UserExtendedApellido: string;
  UserExtendedEstado: string;
  UserExtendedExterno: string;
  UserExtendedUserExterno: string;
  UserExtendedTipoUser: string;
  UserExtendedModPerm: string;
  UserExtendedCambioPass: string;
  UserExtendedDesdeSistema: string;
  UserExtendedCreadoPor: string;
  UserExtendedFchIns: string;
  UserExtendedFchBaja: string;
  UserExtendedFchUltLog: string;
  UserExtendedFchUltBloq: string;
  UserExtendedEsRoot: string;
  UserExtendedObservacion: string;
  UserExtendedObservacion2: string;
  UserExtendedTelefono: string;
  Roles: SyncRol[];
  Atributos: SyncAtributo[];
}

// Cache de roles para evitar N queries por el mismo rol
const rolCache = new Map<string, number>();

async function findOrCreateRol(rol: SyncRol): Promise<number | null> {
  const aplicacionId = parseInt(rol.AplicacionId);
  if (isNaN(aplicacionId) || !rol.RolNombre?.trim()) return null;

  const nombre = trunc(rol.RolNombre, 60) ?? rol.RolNombre;
  const cacheKey = `${aplicacionId}:${nombre}`;
  if (rolCache.has(cacheKey)) return rolCache.get(cacheKey)!;

  // Crear la aplicación si no existe (usa el ID que viene de GeneXus)
  await prisma.aplicacion.upsert({
    where: { id: aplicacionId },
    update: {},
    create: { id: aplicacionId, nombre: `Aplicacion-${aplicacionId}`, estado: "A" },
  });

  // Upsert del rol: buscar primero, si no existe crear; si falla por unique, buscar de nuevo
  let rolDb = await prisma.rol.findFirst({ where: { aplicacionId, nombre } });

  if (!rolDb) {
    try {
      rolDb = await prisma.rol.create({
        data: {
          aplicacionId,
          nombre,
          descripcion: trunc(rol.RolDescripcion, 120),
          estado: char1(rol.RolEstado, "A"),
          nivel: parseInt(rol.RolNivel) || 0,
          creadoEn: trunc(rol.RolCreadoEn, 60),
        },
      });
    } catch (e: any) {
      // Unique constraint violation (P2002): ya fue creado por otro hilo → buscar el existente
      if (e?.code === "P2002") {
        rolDb = await prisma.rol.findFirst({ where: { aplicacionId, nombre } });
      } else {
        throw e;
      }
    }
  }

  if (!rolDb) return null;

  rolCache.set(cacheKey, rolDb.id);
  return rolDb.id;
}

async function procesarUsuario(
  syncUser: SyncUsuario,
): Promise<{ status: "creado" | "actualizado" | "error"; username: string; error?: string }> {
  const username = syncUser.UserExtendedUserName?.trim();
  if (!username) return { status: "error", username: "(vacío)", error: "Username vacío" };

  try {
    // 1. UPSERT usuario
    // Char(1) fields: usar char1() para garantizar máx 1 caracter
    // VarChar fields: truncar al límite del schema
    const userData = {
      password: trunc(syncUser.UserExtendedPassword, 255) || "",
      email: trunc(syncUser.UserExtendedEmail, 120),
      nombre: trunc(syncUser.UserExtendedNombre, 60),
      apellido: trunc(syncUser.UserExtendedApellido, 60),
      estado: syncUser.UserExtendedEstado === "A" ? "A" : "I",
      esExterno: char1(syncUser.UserExtendedExterno, "N"),
      usuarioExterno: trunc(syncUser.UserExtendedUserExterno, 60),
      tipoUsuario: char1(syncUser.UserExtendedTipoUser, "L"),
      modificaPermisos: char1(syncUser.UserExtendedModPerm, "N"),
      cambioPassword: char1(syncUser.UserExtendedCambioPass, "N"),
      // desdeSistema viene como "SGM", "N", etc. → Char(1): "S" si vino de sistema, "N" si no
      desdeSistema: syncUser.UserExtendedDesdeSistema?.trim() ? "S" : "N",
      creadoPor: trunc(syncUser.UserExtendedCreadoPor, 60),
      esRoot: char1(syncUser.UserExtendedEsRoot, "N"),
      telefono: trunc(syncUser.UserExtendedTelefono, 40),
      observacion: syncUser.UserExtendedObservacion?.trim() || null,
      observacion2: syncUser.UserExtendedObservacion2?.trim() || null,
      fechaBaja: parseGxDate(syncUser.UserExtendedFchBaja),
      fechaUltimoLogin: parseGxDate(syncUser.UserExtendedFchUltLog),
      fechaUltimoBloqueo: parseGxDate(syncUser.UserExtendedFchUltBloq),
    };

    const existing = await prisma.usuario.findUnique({ where: { username } });

    let usuarioId: number;
    let wasCreated = false;

    if (existing) {
      await prisma.usuario.update({ where: { username }, data: userData });
      usuarioId = existing.id;
    } else {
      const created = await prisma.usuario.create({
        data: { username, ...userData },
      });
      usuarioId = created.id;
      wasCreated = true;
    }

    // 2. Procesar Roles
    if (syncUser.Roles?.length > 0) {
      const rolIds: number[] = [];
      for (const rol of syncUser.Roles) {
        const rolId = await findOrCreateRol(rol);
        if (rolId) rolIds.push(rolId);
      }

      if (rolIds.length > 0) {
        // Agregar roles nuevos sin borrar los existentes (skipDuplicates)
        await prisma.usuarioRol.createMany({
          data: rolIds.map((rolId) => ({ usuarioId, rolId })),
          skipDuplicates: true,
        });
      }
    }

    // 3. Procesar Atributos
    if (syncUser.Atributos?.length > 0) {
      for (const atributo of syncUser.Atributos) {
        const nombreAtributo = atributo.UserPreferenceAtributo?.trim();
        if (!nombreAtributo) continue;

        const valorSanitizado = sanitizeJson(atributo.UserPreferenceValor || "");

        // UPSERT: actualizar si ya existe, crear si no
        const existingPref = await prisma.usuarioPreferencia.findFirst({
          where: { usuarioId, atributo: nombreAtributo },
        });

        if (existingPref) {
          await prisma.usuarioPreferencia.update({
            where: { id: existingPref.id },
            data: { valor: valorSanitizado || null },
          });
        } else {
          await prisma.usuarioPreferencia.create({
            data: { usuarioId, atributo: nombreAtributo, valor: valorSanitizado || null },
          });
        }
      }
    }

    return { status: wasCreated ? "creado" : "actualizado", username };
  } catch (error: any) {
    const msg = cleanError(error);
    console.error(`[Sync] Error procesando usuario "${username}":`, msg);
    return { status: "error", username, error: msg };
  }
}

// POST /api/db/usuarios/sync
// Body: { UserName?: string, Desde?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { UserName = "", Desde = "SGM" } = body;

    // Usar el JWT del usuario logueado (cookie "token")
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No autenticado. Iniciá sesión primero." },
        { status: 401 },
      );
    }

    // Llamar al servicio externo syncUser
    const syncUrl = `${BACKEND_BASE_URL}/syncUser`;
    console.log(`[Sync] Llamando a ${syncUrl} - UserName: "${UserName}", Desde: "${Desde}"`);

    const syncRes = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ UserName, Desde }),
    });

    if (!syncRes.ok) {
      const text = await syncRes.text();
      console.error("[Sync] Error del servicio externo:", syncRes.status, text);
      return NextResponse.json(
        { success: false, error: `Servicio externo respondió ${syncRes.status}: ${text}` },
        { status: 502 },
      );
    }

    const syncData = await syncRes.json();
    const usuarios: SyncUsuario[] = syncData?.sdtUsuario || syncData?.SdtUsuario || [];

    if (usuarios.length === 0) {
      return NextResponse.json({
        success: true,
        mensaje: syncData?.mensaje || "Sin usuarios para procesar",
        procesados: 0,
        creados: 0,
        actualizados: 0,
        errores: 0,
        detallesErrores: [],
      });
    }

    console.log(`[Sync] Procesando ${usuarios.length} usuarios...`);

    // Limpiar cache de roles para este run
    rolCache.clear();

    // Pre-sembrar cache de roles secuencialmente ANTES de procesar usuarios en paralelo.
    // Evita que el Promise.all cree el mismo rol N veces (race condition).
    const rolesUnicos = new Map<string, SyncRol>();
    for (const u of usuarios) {
      for (const r of u.Roles ?? []) {
        const key = `${r.AplicacionId}:${r.RolNombre?.trim()}`;
        if (!rolesUnicos.has(key)) rolesUnicos.set(key, r);
      }
    }
    for (const [, rol] of rolesUnicos) {
      await findOrCreateRol(rol);
    }
    console.log(`[Sync] Cache de roles pre-sembrado: ${rolCache.size} roles únicos.`);

    // Procesar en batches de 50
    const BATCH_SIZE = 50;
    let creados = 0;
    let actualizados = 0;
    let errores = 0;
    const detallesErrores: { username: string; error: string }[] = [];

    for (let i = 0; i < usuarios.length; i += BATCH_SIZE) {
      const batch = usuarios.slice(i, i + BATCH_SIZE);
      const resultados = await Promise.all(batch.map((u) => procesarUsuario(u)));

      for (const res of resultados) {
        if (res.status === "creado") creados++;
        else if (res.status === "actualizado") actualizados++;
        else {
          errores++;
          if (res.error) detallesErrores.push({ username: res.username, error: res.error });
        }
      }

      console.log(`[Sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${creados + actualizados + errores}/${usuarios.length} procesados`);
    }

    const mensaje = `Sincronización completada: ${creados} creados, ${actualizados} actualizados, ${errores} errores de ${usuarios.length} usuarios.`;
    console.log(`[Sync] ${mensaje}`);

    return NextResponse.json({
      success: true,
      mensaje,
      total: usuarios.length,
      creados,
      actualizados,
      errores,
      detallesErrores: detallesErrores.slice(0, 50), // máx 50 errores en respuesta
    });
  } catch (error: any) {
    console.error("[Sync] Error general:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
