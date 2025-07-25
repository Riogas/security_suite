import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas públicas que no requieren permisos
const PUBLIC_PATHS = ['/', '/login', '/no-autorizado']


const PERMISOS_API_URL = process.env.PERMISOS_API_URL || "http://localhost:8082/permisos";

// 👇 Solo para el middleware (usa fetch, no Axios)
async function apiCheckPermisoEdge(ruta: string, token: string): Promise<boolean> {
  try {
    const resp = await fetch(PERMISOS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ruta }),
    });
    if (!resp.ok) return false;
    const json = await resp.json();
    return !!json.permitido;
  } catch (err) {
    console.error("Error checando permiso (Edge):", err);
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Permitir rutas públicas sin chequear
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // 2. Leer el JWT de la cookie
  const token = request.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3. Consultar permisos
  const permitido = await apiCheckPermisoEdge(pathname, token);
  if (!permitido) {
    return NextResponse.redirect(new URL('/no-autorizado', request.url));
  }

  // 4. Permiso OK, deja pasar
  return NextResponse.next();
}

// Aplica a todas las rutas menos las que son apis o estáticos
export const config = {
  matcher: [
    '/((?!api|_next|static|favicon.ico).*)',
  ],
};
