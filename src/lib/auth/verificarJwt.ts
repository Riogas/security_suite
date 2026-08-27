import { createHash } from "crypto";
import jwt from "jsonwebtoken";

// =====================================================================
// Verificación real del JWT del ecosistema RíoGas.
//
// Esto vivía adentro de `src/lib/docs/root-guard.ts`, que fue el primer lugar
// del repo donde se verificó una firma en serio. Se extrajo acá sin cambiarle
// el criterio porque ahora lo necesitan tres consumidores:
//
//   - el gate de /docs            (src/lib/docs/root-guard.ts)
//   - el guard de /api/db/*       (src/lib/auth/apiGuard.ts)
//   - la resolución de usuario    (src/lib/permisos.ts → resolveUsuario)
//
// Todo lo que decide "quién sos" en esta app tiene que pasar por acá. Si
// mañana aparece un cuarto consumidor, que importe este módulo en vez de
// escribir su propio `atob`: así fue como se llegó a tener 54 endpoints
// abiertos.
// =====================================================================

/** `src/lib/auth/responses.ts` firma con HS256; no se acepta otra cosa. */
const ALGORITMOS: jwt.Algorithm[] = ["HS256"];

/**
 * SHA-256 del secreto que quedó como *default en el código* para firmar los JWT
 * (el `process.env.JWT_SECRET || "..."` de `src/lib/auth/responses.ts`).
 *
 * Se compara por digest a propósito: el valor no se vuelve a escribir en claro
 * en ningún archivo nuevo, y menos en los que el portal /docs publica.
 * `scripts/test-docs-root-guard.ts` lee el literal del código y verifica que
 * este digest le siga correspondiendo, así que si alguien cambia el default el
 * test falla en vez de que el chequeo quede mudo.
 */
const DIGEST_SECRETO_DE_COMPROMISO =
  "d93d4f2b67f66f09182e7035b51c853cd2ab6f77b96a495f432fe983b7246ddf";

/**
 * Largo mínimo del secreto. Verificar HS256 contra un secreto corto no prueba
 * nada: se rompe offline a partir de cualquier token capturado, y con el
 * secreto en la mano se firma un token de root a mano — que es exactamente el
 * ataque que esto viene a cerrar.
 */
export const LARGO_MINIMO_SECRETO = 32;

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

// ─── Secreto de firma ───────────────────────────────────────────────────────

export type EstadoSecreto = { ok: true; secreto: string } | { ok: false; motivo: string };

/**
 * El secreto con el que se verifica la firma, o el motivo por el que no sirve.
 *
 * Se lee en cada request (no al importar el módulo) para que un cambio de
 * ambiente no exija reiniciar el proceso para volver a evaluarse.
 */
export function leerSecretoJwt(): EstadoSecreto {
  const secreto = (process.env.JWT_SECRET ?? "").trim();

  if (secreto === "") {
    return { ok: false, motivo: "JWT_SECRET no está seteada" };
  }
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    return {
      ok: false,
      motivo: `JWT_SECRET tiene ${secreto.length} caracteres: se exigen al menos ${LARGO_MINIMO_SECRETO}`,
    };
  }
  if (sha256(secreto) === DIGEST_SECRETO_DE_COMPROMISO) {
    return {
      ok: false,
      motivo:
        "JWT_SECRET tiene el valor que quedó como default en el código: es un secreto conocido y verificar la firma con él no prueba nada",
    };
  }
  return { ok: true, secreto };
}

// ─── Firma y vencimiento ────────────────────────────────────────────────────

function esHexPuro(s: string): boolean {
  return s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s);
}

/**
 * El ecosistema tiene DOS emisores que firman con el MISMO valor de secreto
 * pero derivan bytes distintos de él:
 *
 *   - GeneXus (el login de la UI de secapi, `/loginUser`): la librería
 *     `GeneXusJWT` hace `Hex.decode(secreto)` antes de firmar HS256 — o sea,
 *     con un secreto de 64 hex usa 32 bytes.
 *   - secapi `/api/db/login` (lo usan Goya, TrackMovil y el edge de Granel):
 *     `jwt.sign(secreto)` toma el string como UTF-8 — 64 bytes.
 *
 * Un guard que probara una sola derivación dejaría afuera a la mitad de los
 * usuarios según por dónde entraron. Probar las dos NO amplía la superficie:
 * las dos claves salen del mismo secreto, que el atacante sigue sin tener.
 */
function clavesCandidatas(secreto: string): Array<string | Buffer> {
  const claves: Array<string | Buffer> = [secreto];
  if (esHexPuro(secreto)) claves.push(Buffer.from(secreto, "hex"));
  return claves;
}

/** Payload del JWT ya verificado. Se tipa laxo: los emisores no coinciden en las claims. */
export type PayloadJwt = Record<string, unknown>;

export type ResultadoVerificacion =
  | { ok: true; payload: PayloadJwt }
  | { ok: false; codigo: "TOKEN_INVALIDO" | "TOKEN_VENCIDO" | "ERROR_VERIFICACION" };

/**
 * Verifica firma y vencimiento contra las dos derivaciones del secreto.
 *
 * `TokenExpiredError` extiende `JsonWebTokenError`, así que se chequea primero.
 * Cualquier otro error es fail-closed (`ERROR_VERIFICACION`), no un pase libre.
 */
export function verificarJwt(token: string, secreto: string): ResultadoVerificacion {
  let vencido = false;
  for (const clave of clavesCandidatas(secreto)) {
    try {
      const payload = jwt.verify(token, clave, { algorithms: ALGORITMOS });
      // `jwt.verify` devuelve string cuando el payload no es JSON. Un token así
      // no nombra a ningún usuario: no sirve para autenticar.
      if (typeof payload === "string") return { ok: false, codigo: "TOKEN_INVALIDO" };
      return { ok: true, payload: payload as PayloadJwt };
    } catch (error) {
      // TokenExpiredError solo se tira DESPUÉS de que la firma cerró: si aparece,
      // esta clave era la correcta y el token venció (no seguimos probando).
      if (error instanceof jwt.TokenExpiredError) {
        vencido = true;
        continue;
      }
      // Firma que no cierra con ESTA clave: puede cerrar con la otra derivación.
      if (error instanceof jwt.JsonWebTokenError) continue;
      // Cualquier otra cosa (p. ej. token que no es string) no depende de la
      // clave: es un error de verdad y corta acá.
      console.error("[auth/verificarJwt] error inesperado verificando el JWT", error);
      return { ok: false, codigo: "ERROR_VERIFICACION" };
    }
  }
  return { ok: false, codigo: vencido ? "TOKEN_VENCIDO" : "TOKEN_INVALIDO" };
}

/**
 * Atajo para quien no necesita distinguir el motivo: devuelve el payload
 * verificado o `null`. Fail-closed ante secreto mal configurado — sin secreto
 * real no hay forma de saber si el token es legítimo, así que no lo es.
 */
export function verificarJwtConSecretoDelAmbiente(token: string): PayloadJwt | null {
  const secreto = leerSecretoJwt();
  if (!secreto.ok) {
    console.error(
      `[auth/verificarJwt] ${secreto.motivo}. Ningún token se puede autenticar hasta configurarla (ver docs/api/README.md).`,
    );
    return null;
  }
  const resultado = verificarJwt(token, secreto.secreto);
  return resultado.ok ? resultado.payload : null;
}
