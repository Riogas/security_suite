import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ✅ Rutas públicas (sin necesidad de login o permiso)
const PUBLIC_PATHS = ['/', '/login', '/no-autorizado'];

// ✅ URL de la API de permisos (backend)
const PERMISOS_API_URL = process.env.PERMISOS_API_URL || "http://localhost:8082/permisos";

// 🧪 Tag para logs
const TAG = '🛡️ [Middleware]';

// ✅ Lógica para consultar la API de permisos
async function apiCheckPermisoEdge(ruta: string, token: string): Promise<boolean> {
  const apiTag = `${TAG}[PermisoAPI]`;
  try {
    console.log(`${apiTag} ▶️ Consultando permisos para ruta: ${ruta}`);

    const resp = await fetch(PERMISOS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ruta }),
    });

    if (!resp.ok) {
      console.warn(`${apiTag} ⚠️ Respuesta no OK (${resp.status}) desde el backend`);
      return false;
    }

    const json = await resp.json();
    console.log(`${apiTag} ✅ Respuesta de permiso:`, json);

    return !!json.permitido;
  } catch (err) {
    console.error(`${apiTag} ❌ Error consultando permisos:`, err);
    return false;
  }
}

// ✅ Middleware principal
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const reqTag = `${TAG}[${pathname}]`;

  console.log(`${reqTag} 📥 Iniciando evaluación de ruta...`);

  // 1. Si es pública, continuar sin controles
  if (PUBLIC_PATHS.includes(pathname)) {
    console.log(`${reqTag} 🔓 Ruta pública, permitiendo acceso directo`);
    return NextResponse.next();
  }

  // 2. Validar si hay token JWT en cookies
  const token = request.cookies.get('token')?.value;
  if (!token) {
    console.warn(`${reqTag} 🔐 Sin token en cookies. Redirigiendo a /login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  console.log(`${reqTag} 🔑 Token presente. Validando permisos para la ruta...`);

  // 3. Verificar permisos llamando a la API
  const tienePermiso = await apiCheckPermisoEdge(pathname, token);

  if (!tienePermiso) {
    console.warn(`${reqTag} ❌ Acceso denegado por permisos. Redirigiendo a /no-autorizado`);
    return NextResponse.redirect(new URL('/no-autorizado', request.url));
  }

  // 4. Permiso concedido, permitir el acceso
  console.log(`${reqTag} ✅ Acceso permitido. Continuando...`);
  return NextResponse.next();
}

// ✅ Configuración: aplicar solo a rutas no estáticas ni de API
export const config = {
  matcher: [
    '/((?!api|_next|static|favicon.ico).*)',
  ],
};
