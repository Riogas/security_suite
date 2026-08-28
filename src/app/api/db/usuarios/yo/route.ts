import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/apiGuard";

// =====================================================================
// GET /api/db/usuarios/yo
//
// "¿Quién soy y de qué soy root?", resuelto del token contra Postgres.
//
// Por qué existe: el panel decidía si mostrar el botón de "Importación masiva"
// con `user.isRoot` de localStorage, y ese valor NO sale de esta base — sale
// del login del panel, que va por el passthrough a GeneXus y devuelve
// SERVICIOS.USEREXTENDED.USEREXTENDEDESROOT. En producción esos dos campos
// están INVERTIDOS: a dmedaglia (root acá) el botón le salía bloqueado, y a
// quien GeneXus marcaba root le salía habilitado aunque el endpoint lo fuera a
// rechazar con 403. Preguntándole a secapi, la UI y el guard usan el MISMO
// criterio: el rol "Root" (ver src/lib/permisos.ts).
//
// Nivel AUTENTICADA en POLITICAS, no ROOT: preguntar si sos root no puede
// exigir ser root. Con nivel ROOT, el no-root recibiría 403 y el front no
// podría distinguir "no sos root" de "algo se rompió".
//
// No devuelve la ficha del usuario (para eso está GET /api/db/usuarios/:id):
// solo identidad y root, que es lo único que hace falta para gatear la UI.
// =====================================================================
export async function GET(request: NextRequest) {
  const guard = await requireApiAuth(request);
  if (!guard.ok) return guard.respuesta;

  // En nivel AUTENTICADA el guard nunca deja pasar sin usuario; el chequeo es
  // para el tipo, y de paso para que nadie afloje la política sin darse cuenta.
  const usuario = guard.usuario;
  if (!usuario) {
    return NextResponse.json(
      { success: false, error: "Tu sesión no es válida, volvé a iniciar sesión" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    usuario: {
      id: usuario.id,
      username: usuario.username,
      // Root de la herramienta de seguridad: es el que habilita las operaciones
      // de administración del panel (importación masiva, /docs, nivel ROOT).
      esRootDeSecapi: usuario.esRootDeSecapi,
      // Aplicaciones donde tiene el rol Root. Sirve para gatear pantallas de
      // otras aplicaciones sin volver a preguntar.
      aplicacionesRoot: usuario.aplicacionesRoot,
      // Alias char 'S'/'N' del anterior, con la forma que ya usa el resto del
      // ecosistema (`user.isRoot`). Mismo dato, no la columna `es_root`.
      isRoot: usuario.esRootDeSecapi ? "S" : "N",
    },
  });
}
