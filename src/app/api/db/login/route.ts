import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "security-suite-secret-key";
const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ||
  "https://sgm.glp.riogas.com.uy/servicios/SecuritySuite";

/**
 * POST /api/db/login
 *
 * Endpoint de autenticación unificado.
 * 1. Busca el usuario en PostgreSQL (tabla usuarios).
 * 2. Si existe y la contraseña coincide → responde OK.
 * 3. Si NO existe localmente → reenvía a GeneXus loginUser.
 *    Si GeneXus responde success → responde OK con los datos de GeneXus.
 *
 * Body esperado: { "UserName": "...", "Password": "...", "Sistema": "..." }
 * Respuesta compatible con el formato de GeneXus loginUser.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { UserName, Password, Sistema } = body;

    if (!UserName || !Password) {
      return NextResponse.json(
        {
          success: false,
          message: "UserName y Password son requeridos",
          token: "",
          user: null,
          expiresIn: "0",
          requireIdentity: false,
          verifiedBy: "",
        },
        { status: 400 }
      );
    }

    const username = UserName.trim();
    const password = Password.trim();
    const sistema = (Sistema || "").trim();

    // ─── 1. Buscar usuario en PostgreSQL ───
    const usuarioLocal = await prisma.usuario.findUnique({
      where: { username },
    });

    if (usuarioLocal) {
      // Usuario encontrado en PostgreSQL → validar password
      // TODO: cuando se implemente bcrypt, usar bcrypt.compare()
      if (usuarioLocal.password !== password) {
        return NextResponse.json(
          {
            success: false,
            message: "Contraseña incorrecta",
            token: "",
            user: null,
            expiresIn: "0",
            requireIdentity: false,
            verifiedBy: "",
          },
          { status: 401 }
        );
      }

      // Verificar que el usuario esté activo
      if (usuarioLocal.estado === "I") {
        return NextResponse.json(
          {
            success: false,
            message: "Usuario inactivo",
            token: "",
            user: null,
            expiresIn: "0",
            requireIdentity: false,
            verifiedBy: "",
          },
          { status: 403 }
        );
      }

      // Generar JWT
      const token = jwt.sign(
        {
          iss: "security-suite",
          username: usuarioLocal.username,
          userId: usuarioLocal.id,
          sistema,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Actualizar fecha_ultimo_login
      await prisma.usuario.update({
        where: { id: usuarioLocal.id },
        data: { fechaUltimoLogin: new Date() },
      });

      const nombreCompleto = [usuarioLocal.nombre, usuarioLocal.apellido]
        .filter(Boolean)
        .join(" ")
        .trim();

      return NextResponse.json({
        success: true,
        message: "",
        token,
        expiresIn: "604800", // 7 días en segundos
        requireIdentity: false,
        verifiedBy: "local-db",
        user: {
          id: String(usuarioLocal.id),
          username: usuarioLocal.username.trim(),
          nombre: nombreCompleto || usuarioLocal.username.trim(),
          email: usuarioLocal.email || "",
          isRoot: usuarioLocal.esRoot || "N",
        },
      });
    }

    // ─── 2. No existe localmente → Reenviar a GeneXus ───
    console.log(
      `[Login] Usuario "${username}" no encontrado en DB local, reenviando a GeneXus...`
    );

    const gxResponse = await fetch(`${BACKEND_BASE_URL}/loginUser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ UserName: username, Password: password, Sistema: sistema }),
    });

    const gxData = await gxResponse.json();

    if (gxData.success) {
      // GeneXus validó OK → devolvemos su respuesta tal cual
      return NextResponse.json({
        ...gxData,
        verifiedBy: "genexus",
      });
    }

    // GeneXus también rechazó
    return NextResponse.json(
      {
        success: false,
        message: gxData.message || "Credenciales inválidas",
        token: "",
        user: null,
        expiresIn: "0",
        requireIdentity: false,
        verifiedBy: "",
      },
      { status: 401 }
    );
  } catch (error) {
    console.error("[Login] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error interno del servidor",
        token: "",
        user: null,
        expiresIn: "0",
        requireIdentity: false,
        verifiedBy: "",
      },
      { status: 500 }
    );
  }
}
