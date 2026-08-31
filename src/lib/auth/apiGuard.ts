import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  ACCION_VIEW,
  APROBADOR_ACCION_KEY,
  extractToken,
  resolveUsuario,
  usuarioTieneFuncionalidad,
  type UsuarioAuth,
} from "@/lib/permisos";
import { leerSecretoJwt, verificarJwt } from "@/lib/auth/verificarJwt";
import { patternToRegex, specificity } from "@/lib/routePattern";

// =====================================================================
// Guard de /api/db/*
//
// Antes de esto, de las 64 operaciones bajo /api/db/ solo 10 miraban algo, y
// las 10 lo miraban mal (`decodeJwt` era base64 puro). Quedaban 54 abiertas al
// que llegara al puerto, 30 de ellas de ESCRITURA: crear usuarios, asignar
// roles, borrar aplicaciones.
//
// ── Por qué un helper por ruta y no un middleware ─────────────────────────
// La tentación es meter esto en `src/proxy.ts` (el "middleware" de Next 16) y
// listo. No sirve, por tres motivos concretos de ESTE repo:
//
//   1. `src/proxy.ts` corre en el runtime Edge: no hay `jsonwebtoken` (usa el
//      crypto de Node) ni Prisma. Verificar la firma habría obligado a
//      reimplementar HS256 con WebCrypto — un SEGUNDO criterio de verificación,
//      distinto del de /docs, que es exactamente el problema que se viene a
//      resolver — y resolver el usuario contra Postgres no se puede hacer ahí.
//   2. `src/proxy.ts` hoy FALLA ABIERTO a propósito: su catch devuelve
//      `NextResponse.next()`, y todo su guard está detrás del flag
//      `PERMISOS_ENFORCE`, que en varios ambientes está apagado. Colgar la
//      autenticación de la API de un flag pensado para el rollout del guard de
//      pantallas es pedir que alguien la apague sin darse cuenta.
//   3. La política no es uniforme: `/login` tiene que seguir público, cuatro
//      endpoints los llama el edge de Granel sin usuario (api-key de servicio) y
//      dos exigen root. Eso se declara mejor en una tabla que en un middleware
//      lleno de ifs.
//
// El costo conocido de esta decisión es que una ruta NUEVA nace abierta si nadie
// llama al guard. Por eso `scripts/test-api-guard.ts` recorre
// `src/app/api/db/**/route.ts` y falla si aparece un handler que no invoca
// `requireApiAuth`, o un path sin política declarada acá. La red de contención
// no es la disciplina: es el test.
// =====================================================================

export type NivelAcceso =
  /** Sin credencial. Solo el login: es la puerta de entrada de las 4 apps. */
  | "PUBLICA"
  /** Api-key de servicio (`x-api-key`) O usuario autenticado. */
  | "SERVICIO"
  /** JWT verificado + usuario activo en Postgres. */
  | "AUTENTICADA"
  /**
   * Root de secapi, **o** lo que un root le haya OTORGADO al usuario: la
   * funcionalidad que corresponde al (objeto, acción) declarados en la política,
   * sea por rol o por acceso directo. Es secapi consultando su propio motor de
   * permisos para autorizarse a sí misma, que es el pedido del dueño.
   *
   * El corte respecto de ROOT es "¿delegarlo es delegar root con otro nombre?".
   * Ver el bloque "ADMIN vs ROOT" más abajo.
   */
  | "ADMIN"
  /**
   * Lo anterior + el ROL "Root" de la aplicación SecuritySuite, vigente y
   * activo (`UsuarioAuth.esRootDeSecapi`). Antes era `usuarios.es_root='S'`:
   * un flag global que en producción tenía UN solo usuario de 854, mientras
   * que el rol lo tenía la gente que realmente administra el sistema. Ver el
   * bloque "Root por ROL" en src/lib/permisos.ts.
   *
   * En producción (agosto 2026) son DOS personas: dmedaglia y jgomez. Poner una
   * ruta en este nivel significa literalmente "esto lo pueden hacer ellos dos",
   * y —a diferencia de ADMIN— significa que no se puede delegar.
   */
  | "ROOT";

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface PoliticaBase {
  /** Patrón relativo a `/api/db`, con `:param` por segmento dinámico. */
  patron: string;
  metodos: Metodo[];
  /** Por qué está en ese nivel. Lo lee el que venga a cambiarlo. */
  motivo: string;
}

/**
 * Política de nivel ADMIN: además del nivel declara CONTRA QUÉ se pregunta.
 *
 * `objetoKey` es obligatorio por el tipo, no por convención: una ruta ADMIN sin
 * objeto declarado no se puede evaluar, y lo único peor que no poder evaluarla
 * sería dejarla pasar. Si igual llegara una (JavaScript sin tipos, un refactor
 * a medio hacer), el guard la deniega con 403 y lo loguea.
 */
interface PoliticaAdmin extends PoliticaBase {
  nivel: "ADMIN";
  /** `key` del objeto de la aplicación SecuritySuite que protege esta ruta. */
  objetoKey: string;
  /**
   * Acción a chequear. Si no se declara, se deriva del método HTTP con
   * `accionPorMetodo` (GET→view, POST→create, PUT/PATCH→update, DELETE→delete).
   *
   * Hoy TODAS las políticas ADMIN la declaran, y casi todas declaran `view`.
   * No es pereza: es lo que hay en la base. Ver "Qué acción se chequea".
   */
  accion?: string;
}

interface PoliticaSimple extends PoliticaBase {
  nivel: Exclude<NivelAcceso, "ADMIN">;
}

type Politica = PoliticaSimple | PoliticaAdmin;

// ─── Qué acción se chequea ──────────────────────────────────────────────────
//
// La tentación es mapear el método HTTP a la acción y listo: GET→view,
// POST→create, PUT→update, DELETE→delete. El mapeo está implementado
// (`accionPorMetodo`) y es el default. Lo que pasa es que HOY no describe la
// base.
//
// El andamiaje que hay sembrado (agosto 2026, `scripts/seed-menu-secapi.ts`) es
// un objeto PAGE por pantalla con UNA sola `objeto_accion`, `view`, y UNA
// funcionalidad colgada de esa acción, uno a uno:
//
//   objeto 20 'usuarios' ↔ funcionalidad 51 'Usuarios'    (vía la acción view)
//   objeto 21 'roles'    ↔ funcionalidad 52 'Roles'
//   … y así las once
//
// No existen filas `create`, `update` ni `delete`. Como el motor es fail-closed
// con la acción inexistente, dejar que el método mande convertiría cada
// escritura ADMIN en algo que NADIE puede tener otorgado —ni siquiera pidiéndolo—
// y root volvería a ser el único que administra. O sea: el modelo del dueño
// ("los demás acceden a lo que un root les otorgue") no arrancaría nunca.
//
// Por eso cada política ADMIN declara `accion: "view"` explícitamente: la
// unidad de otorgamiento que existe en la base es LA PANTALLA, no la operación.
// Otorgar "Usuarios" es otorgar administrar usuarios. Sigue siendo mucho más
// estrecho que hoy (AUTENTICADA = los 854), y lo que de verdad escala privilegio
// no está acá: está en ROOT.
//
// El día que se siembren las acciones finas, el cambio es sacar el `accion` de
// la política que corresponda, una por una, y el default del método toma el
// lugar. Nada más.

/** Acción por defecto para un método HTTP. Devuelve "" si el método no mapea. */
export function accionPorMetodo(metodo: string): string {
  switch (metodo.toUpperCase()) {
    case "GET":
      return ACCION_VIEW;
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      // Sin acción no se puede preguntar, y no poder preguntar es denegar.
      return "";
  }
}

/** Acción efectiva de una política ADMIN para un método concreto. */
export function accionDePolitica(politica: PoliticaAdmin, metodo: string): string {
  return (politica.accion ?? accionPorMetodo(metodo)).trim();
}

/** Prefijo que cubre este guard. Todo lo de acá abajo necesita una política. */
export const PREFIJO_API_DB = "/api/db";

// ─── Tabla de políticas ─────────────────────────────────────────────────────
//
// Fuente única de verdad. Lo que no está declarado acá se DENIEGA (ver
// `nivelDeRuta`), así que agregar una ruta sin pensar la política no la deja
// abierta: la deja rota, que es el error correcto.
export const POLITICAS: readonly Politica[] = [
  // ── Público ───────────────────────────────────────────────────────────────
  {
    patron: "/login",
    metodos: ["POST"],
    nivel: "PUBLICA",
    motivo:
      "Único endpoint que NO puede pedir credencial: es el login de secapi, Goya, TrackMovil y el edge de Granel. No hay otro público en toda la app (no existe recuperación de clave ni registro).",
  },

  // ── Servicio: lo que el edge de Granel llama sin usuario ───────────────────
  //
  // El edge (Express, loopback contra http://127.0.0.1:3001) no tiene sesión de
  // nadie: consulta secapi ANTES de saber quién se está logueando. Estos cuatro
  // son los únicos que la api-key abre; con la key en la mano no se llega a
  // ningún otro endpoint (`SERVICIO_FUERA_DE_ALCANCE`).
  {
    patron: "/usuarios/por-username",
    metodos: ["GET"],
    nivel: "SERVICIO",
    motivo:
      "Primer paso del login dual de Granel (edge/src/docs/secapi.js:68 existeEnSecapi): decide si el gestor se valida contra secapi o contra GeneXus. Si esto devuelve != 200, existeEnSecapi retorna null y el login cae en silencio al camino equivocado: todo gestor que solo exista en secapi recibe 'credenciales inválidas' sin ningún error visible.",
  },
  {
    patron: "/roles",
    metodos: ["GET"],
    nivel: "SERVICIO",
    motivo:
      "Grilla tipo-x-rol del panel de root de Granel (listarRolesGranel, aplicacionId=6). Sin esto la pantalla de configuración tira 'secapi roles HTTP 401'.",
  },
  {
    patron: "/roles/:id/atributos",
    metodos: ["GET", "PUT"],
    nivel: "SERVICIO",
    motivo:
      "Lectura y escritura del atributo GranelTiposDoc por rol (atributosDeRol / guardarTiposDeRol, este último desde configRouter.js:269). Es la ÚNICA escritura que la api-key habilita, y por eso el POST del mismo path queda en AUTENTICADA: ese lo usa el front de secapi, no Granel.",
  },

  // ── ADMIN vs ROOT: dónde está el corte ────────────────────────────────────
  //
  // El dueño describió el modelo así: root accede a todo secapi; los demás
  // acceden a lo que un root les OTORGUE asignándoles funcionalidades. Eso deja
  // dos niveles, y la pregunta que los separa es una sola:
  //
  //     ¿delegar esta operación es delegar root con otro nombre?
  //
  // Si la respuesta es sí, la operación NO es delegable y se queda en ROOT.
  // Los dos ejemplos que lo dejan claro:
  //
  //   - Otorgar "editar roles" permite editarse el rol Root a uno mismo y
  //     asignárselo. El rol se identifica por NOMBRE, así que hasta crear uno
  //     llamado 'root' alcanza.
  //   - Otorgar "editar funcionalidades" permite poner una en `es_publico='S'`
  //     y abrírsela de una a los 854 usuarios.
  //
  // El principio de fondo: que alguien sea root tiene que quedar escrito como
  // ROL, en `usuario_roles`, donde se ve y se audita — no escondido adentro de
  // una funcionalidad que alguien otorgó una tarde.
  //
  // Lo que SÍ es delegable son las pantallas del panel: la grilla de usuarios,
  // la ficha de un rol, el catálogo de acciones, el árbol de menú en modo
  // lectura, aprobar solicitudes. Eso pasa a ADMIN, que es "root O la
  // funcionalidad que un root me otorgó".
  //
  // NO se puede gatear con `usuarios.modifica_permisos`: en producción está en
  // 'N' para los 854 usuarios, así que gatear con eso deja a TODO EL MUNDO
  // afuera, root incluido.

  // ── Root ──────────────────────────────────────────────────────────────────
  //
  // TODO lo que puede alterar QUIÉN TIENE QUÉ. Es la contrapartida obligatoria
  // de que root sea un ROL: el privilegio vive en `usuario_roles`, o sea en una
  // tabla de datos que estos endpoints escriben. Mientras estuvieron en
  // AUTENTICADA, un solo request de cualquiera de los 854 usuarios se otorgaba
  // root de todo:
  //
  //   PUT  /api/db/usuarios/<yo>/roles  { "roles":[{"rolId":57}] }
  //   POST /api/db/roles  { "aplicacionId":1, "nombre":"root" }   (+ el PUT de arriba)
  //
  // El segundo funciona porque el rol se identifica por NOMBRE: fabricar un rol
  // llamado "Root" es fabricar el privilegio. Por eso no alcanza con cerrar la
  // asignación: hay que cerrar también todo lo que puede crear, renombrar,
  // clonar o recablear un rol.
  //
  // Este bloque NO baja a ADMIN. Ninguna de estas se otorga con una
  // funcionalidad, ni siquiera "una chiquita": son las llaves del modelo.
  {
    patron: "/usuarios/:id/roles",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "LA puerta de la escalada: reemplaza la asignación completa de roles de CUALQUIER usuario, y desde que root es un rol, asignarse el rol Root de secapi ES hacerse root de todo. Estaba en AUTENTICADA y el handler no miraba ni quién llamaba ni que el :id fuera el propio. El GET sigue en AUTENTICADA (ver más abajo): leer qué roles tiene alguien no otorga nada.",
  },
  {
    patron: "/usuarios/:id/accesos",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Concesiones DIRECTAS de funcionalidad por usuario (tabla `accesos`, grant/deny). Es la otra mitad del motor de permisos: lo que no se consigue por rol se consigue por acá, funcionalidad por funcionalidad y sobre cualquier usuario. Misma familia que asignar roles.",
  },
  {
    patron: "/accesos",
    metodos: ["POST", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Exactamente lo mismo que /usuarios/:id/accesos PUT pero de a un acceso y en otro path. Cerrar uno solo de los dos no cierra nada. El GET queda en AUTENTICADA: listar accesos es lectura.",
  },
  {
    patron: "/roles",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Crear un rol llamado 'Root' en la aplicación 1 ES crear el privilegio de root, porque el rol se identifica por nombre. El `unique(aplicacion, nombre)` no protege: `esRolRoot` normaliza a minúsculas y con trim, así que 'root', 'ROOT' y ' Root ' son tres filas distintas para Postgres y las tres son root para el código. El GET del mismo path sigue en SERVICIO (lo lee el edge de Granel).",
  },
  {
    patron: "/roles/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "El PUT puede RENOMBRAR un rol cualquiera a 'Root' (misma escalada que el POST) y además reemplaza el set de funcionalidades del rol, o sea lo que el rol otorga a todos los que lo tienen. El DELETE lo pasa a estado 'I', y un rol inactivo deja de dar root: es el camino para dejar el sistema sin administrador. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/roles/:id/clonar",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "El clon se crea con el NOMBRE que manda el body y en la aplicación del rol original: clonar cualquier rol de la aplicación 1 llamándolo 'Root' es la misma fabricación de privilegio que POST /roles, por otra puerta. No estaba en ninguno de los dos informes de revisión.",
  },
  {
    patron: "/funcionalidades",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Una funcionalidad con `es_publico='S'` hace que el motor conteste GRANTED (razón PUBLIC_FUNCIONALIDAD) a TODO el mundo para los objetos que tenga colgados. Es otorgar acceso sin pasar por roles ni por accesos.",
  },
  {
    patron: "/funcionalidades/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Ídem: el PUT puede prender `es_publico` sobre una funcionalidad EXISTENTE (la que ya cuelga de las pantallas sensibles) y mover su vigencia; el DELETE la desactiva y corta el acceso de todos los que la tenían. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/funcionalidades/:id/acciones",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Reescribe `funcionalidad_objeto_acciones`, que es LA tabla que el motor consulta para saber qué funcionalidad protege qué pantalla. Recablear esto cambia lo que otorga cada rol sin tocar ningún rol.",
  },
  {
    patron: "/objetos",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Un objeto con `es_publico='S'` da GRANTED (razón PUBLIC_OBJECT) a todo el mundo antes de mirar funcionalidades, roles o accesos. Es el cortocircuito más corto del motor.",
  },
  {
    patron: "/objetos/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Ídem sobre objetos existentes, y además reescribe sus `objeto_acciones` (key, codigo y `path`), que es contra lo que matchea el motor. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/aplicaciones",
    metodos: ["POST"],
    nivel: "ROOT",
    motivo:
      "Alta de aplicaciones. Va con el resto del ABM del modelo de autorización: una aplicación es el contenedor de roles, funcionalidades y objetos.",
  },
  {
    patron: "/aplicaciones/:id",
    metodos: ["PUT", "DELETE"],
    nivel: "ROOT",
    motivo:
      "Las dos pueden poner una aplicación en estado 'I', y una aplicación inactiva ya no otorga root (ver `aplicacionesRootDe`): dar de baja la aplicación 1 deja al sistema SIN NINGÚN root, sin tocar un solo rol. Recuperación: scripts/bootstrap-root.ts. El GET queda en AUTENTICADA.",
  },
  {
    patron: "/menu/builder",
    metodos: ["PUT"],
    nivel: "ROOT",
    motivo:
      "Reescribe el árbol entero: crea y ACTUALIZA `objetos` y `objeto_acciones` de la aplicación, incluidos el `path` y el `codigo` contra los que matchea el motor de permisos. Repuntar una acción ya otorgada a otra pantalla es otorgar esa pantalla. El GET queda en AUTENTICADA.",
  },

  // ── ADMIN: root, o lo que un root otorgue ─────────────────────────────────
  //
  // Acá es donde secapi consulta su propio motor. Cada entrada declara el
  // `objetoKey` de la pantalla y la acción; el guard pregunta
  // `usuarioTieneFuncionalidad(usuario, objetoKey, accion)`, que resuelve
  // objeto → objeto_accion → funcionalidades activas y vigentes → ¿el usuario
  // tiene alguna, por rol o por acceso directo?
  //
  // Antes de esto, TODO este bloque estaba en AUTENTICADA: alcanzaba con tener
  // sesión de CUALQUIERA de las cuatro aplicaciones para leer y escribir el
  // panel de seguridad entero. Un chofer de TrackMovil con su sesión normal
  // listaba los 854 usuarios con sus mails y cédulas.
  //
  // Ninguna de estas rutas la consume otra aplicación: se verificó barriendo los
  // tres repos (goya, trackmovil, granel-app). Lo que ellos llaman es
  // /permisos, /login, /menu, /solicitudes, /usuarios/yo,
  // /usuarios/por-empresa-fletera, /usuarios/:id/permite-login,
  // /usuarios/por-username, GET /roles y GET|PUT /roles/:id/atributos — todo eso
  // quedó en AUTENTICADA/SERVICIO/PÚBLICA a propósito y NO se toca. Cerrar el
  // panel no los roza.
  //
  // Tres de estas BAJARON de ROOT, y es deliberado: son administración de
  // usuarios, no de privilegios. Delegar "Usuarios" no permite asignar roles ni
  // accesos (siguen en ROOT), así que un admin de usuarios no se puede hacer
  // root. Las tres son `DELETE /usuarios/:id`, `POST /usuarios/importar` y
  // `POST /admin/import-sgm-preferences`; las dos primeras conservan además la
  // red de `verificarQueQuedaRoot`, que impide dejar el sistema sin
  // administrador.
  {
    patron: "/usuarios",
    metodos: ["GET", "POST"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Grilla y alta de usuarios del panel. La grilla devuelve nombre, mail, teléfono y sistema de origen de los 854: es el listado de personal de la empresa, no una pantalla neutra. El alta no otorga root (`esRoot` dejó de autorizar y el handler rechaza crearlo en 'S').",
  },
  {
    patron: "/usuarios/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Ficha de usuario: ver, editar y dar de baja. El PUT no puede elevar a root (`esRoot` dejó de autorizar) y sus campos sensibles —estado, clave ajena, modifica_permisos— los sigue exigiendo el handler a nivel root. El DELETE bajó de ROOT: es baja lógica de una persona, no un privilegio; `verificarQueQuedaRoot` sigue impidiendo que deje al sistema sin administrador.",
  },
  {
    patron: "/usuarios/:id/roles",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Lectura de los roles asignados a un usuario (ficha y modal del panel). Solo GET: el PUT del mismo path se queda en ROOT porque asignarse el rol Root ES hacerse root.",
  },
  {
    patron: "/usuarios/:id/accesos",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Lectura de los accesos directos de un usuario. Solo GET: el PUT del mismo path se queda en ROOT (otorga funcionalidades sin pasar por roles).",
  },
  {
    patron: "/usuarios/externos",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Enumera los usuarios de SGM/LDAP/GSIST: nombres, mails y CÉDULAS de toda la empresa, incluida gente que no usa secapi. Es el endpoint más sensible del bloque y estaba abierto a cualquier sesión de cualquiera de las cuatro aplicaciones.",
  },
  {
    patron: "/usuarios/importar",
    metodos: ["POST"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Crea usuarios en masa desde SGM/LDAP/GSIST. Bajó de ROOT: dar de alta gente es administrar usuarios, y el alta no otorga privilegios (los usuarios importados nacen sin roles). Ojo: el handler tenía su propio `requireRoot`; si vuelve a aparecer, este nivel deja de significar nada.",
  },
  {
    patron: "/admin/import-sgm-preferences",
    metodos: ["POST"],
    nivel: "ADMIN",
    objetoKey: "usuarios",
    accion: ACCION_VIEW,
    motivo:
      "Barrido masivo que reescribe preferencias sobre toda la base. Bajó de ROOT junto con el resto de la administración de usuarios. Antes de todo esto solo exigía que la cookie `token` EXISTIERA — ni firma ni vencimiento — así que alcanzaba con mandar `Cookie: token=x`.",
  },
  {
    patron: "/roles/:id",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "roles",
    accion: ACCION_VIEW,
    motivo:
      "Ficha de un rol. Solo lectura: el PUT y el DELETE del mismo path se quedan en ROOT (renombrar un rol a 'Root' es otorgarse root).",
  },
  {
    patron: "/roles/:id/atributos",
    metodos: ["POST"],
    nivel: "ADMIN",
    objetoKey: "roles",
    accion: ACCION_VIEW,
    motivo:
      "Alta de un atributo suelto de rol, solo desde el front de secapi (api.ts:1907). El GET y el PUT del MISMO path siguen en SERVICIO porque los llama el edge de Granel: por eso el POST se declara aparte y NO entra en el alcance de la api-key.",
  },
  {
    patron: "/aplicaciones",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "CATÁLOGO, no administración: son seis nombres de aplicación que llenan un combo. Lo piden OCHO pantallas del panel al montar (roles, objetos, funcionalidades, permisos, el builder de menú y los tres formularios), así que dejarlo en ADMIN `aplicaciones:view` obligaba a otorgar DOS funcionalidades para que una sola pantalla funcione: quien recibía 'Roles' abría la pantalla y le fallaba la carga. Y no esconde nada: los mismos nombres ya le llegan a cualquier sesión por GET /menu. La ficha, el alta, la edición y la baja SÍ quedan cerradas: administrar aplicaciones es otra cosa que leer cómo se llaman.",
  },
  {
    patron: "/aplicaciones/:id",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "aplicaciones",
    accion: ACCION_VIEW,
    motivo:
      "Ficha de una aplicación. Solo lectura: el PUT y el DELETE se quedan en ROOT (dar de baja la aplicación 1 deja al sistema sin root).",
  },
  {
    patron: "/aplicaciones/:id/roles",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "aplicaciones",
    accion: ACCION_VIEW,
    motivo: "Roles de una aplicación, para los selectores del panel.",
  },
  {
    patron: "/funcionalidades",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "funcionalidades",
    accion: ACCION_VIEW,
    motivo: "Grilla de funcionalidades del panel. Solo lectura: el alta se queda en ROOT.",
  },
  {
    patron: "/funcionalidades/:id",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "funcionalidades",
    accion: ACCION_VIEW,
    motivo:
      "Ficha de una funcionalidad. Solo lectura: el PUT y el DELETE se quedan en ROOT (`es_publico='S'` otorga la pantalla a todo el mundo).",
  },
  {
    patron: "/funcionalidades/:id/acciones",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "funcionalidades",
    accion: ACCION_VIEW,
    motivo:
      "Lectura del vínculo funcionalidad ↔ objeto/acción. Solo GET: el PUT se queda en ROOT porque reescribe la tabla que el motor consulta para saber qué protege qué.",
  },
  {
    patron: "/acciones",
    metodos: ["GET", "POST"],
    nivel: "ADMIN",
    objetoKey: "acciones",
    accion: ACCION_VIEW,
    motivo:
      "ABM del catálogo `acciones`. Es el único ABM completo que NO está en ROOT, y por una razón concreta: esta tabla (y su vínculo `funcionalidad_acciones`) no la lee el motor de permisos — el motor trabaja contra `objeto_acciones` y `funcionalidad_objeto_acciones`, que son otras. Tocar esto no otorga ni quita acceso a nada.",
  },
  {
    patron: "/acciones/:id",
    metodos: ["GET", "PUT", "DELETE"],
    nivel: "ADMIN",
    objetoKey: "acciones",
    accion: ACCION_VIEW,
    motivo: "Ídem: catálogo descriptivo que el motor no consulta. Ver el motivo de /acciones.",
  },
  {
    patron: "/objetos",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "objetos",
    accion: ACCION_VIEW,
    motivo: "Grilla de objetos (pantallas y puntos de menú). Solo lectura: el alta se queda en ROOT.",
  },
  {
    patron: "/objetos/:id",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "objetos",
    accion: ACCION_VIEW,
    motivo:
      "Ficha de un objeto. Solo lectura: el PUT y el DELETE se quedan en ROOT (`es_publico='S'` y el recableado de `objeto_acciones` otorgan acceso).",
  },
  {
    patron: "/menu/builder",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "menu",
    accion: ACCION_VIEW,
    motivo:
      "Lectura del árbol para el editor. Solo GET: el PUT se queda en ROOT (reescribe `objetos` y `objeto_acciones`, incluido el `path` contra el que matchea el motor). OJO: `GET /menu` —el menú del usuario, que llama Goya— es OTRA ruta y sigue en AUTENTICADA.",
  },
  {
    patron: "/accesos",
    metodos: ["GET"],
    nivel: "ADMIN",
    objetoKey: "permisos",
    accion: ACCION_VIEW,
    motivo:
      "Listado de accesos directos: quién tiene otorgada cada funcionalidad en todo el ecosistema. Es la pantalla /dashboard/permisos, y de ahí sale su objetoKey. Solo GET: el POST y el DELETE se quedan en ROOT.",
  },
  {
    patron: "/solicitudes/:id/aprobar",
    metodos: ["POST"],
    nivel: "ADMIN",
    objetoKey: "solicitudes",
    accion: APROBADOR_ACCION_KEY,
    motivo:
      "Aprobar una solicitud otorga un acceso: es la única escritura sobre `accesos` que NO es de root, y tiene que serlo — el flujo existe justamente para que un aprobador que no es root apruebe. La única política ADMIN con acción propia (`approve`, la que ya usaba `usuarioPuedeAprobar`) porque es la única que existe sembrada además de `view`. Lo que se puede otorgar por esta vía está acotado en el handler; ver `funcionalidadConfierePrivilegio`.",
  },
  {
    patron: "/solicitudes/:id/rechazar",
    metodos: ["POST"],
    nivel: "ADMIN",
    objetoKey: "solicitudes",
    accion: APROBADOR_ACCION_KEY,
    motivo:
      "Ídem aprobar. Rechazar no otorga nada, pero decide sobre la solicitud de otro: es la misma pantalla y el mismo permiso.",
  },

  // ── Autenticadas: lo que NO se puede cerrar ───────────────────────────────
  //
  // Este bloque es la línea roja del cambio, y conviene decir por qué existe
  // en vez de tratarlo como "lo que sobró".
  //
  // La distinción que lo ordena: poder preguntar QUÉ TENGO PERMITIDO no es un
  // privilegio; poder cambiar QUÉ TIENE PERMITIDO OTRO, sí. Todo lo de acá
  // abajo es de la primera clase —o es el servicio compartido que consumen Goya,
  // TrackMovil y el edge de Granel— y por eso se queda en "usuario con sesión
  // válida".
  //
  // Si alguna de estas sube de nivel, se rompe Goya o TrackMovil. No es una
  // hipótesis: son las rutas que aparecen en el barrido de los tres repos.
  {
    patron: "/permisos",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Gate de CADA pantalla de Goya, TrackMovil y del propio panel de secapi. Las tres ya mandan el Bearer del usuario. Es el endpoint más caliente del ecosistema: si corta de más, todos terminan en /no-autorizado.",
  },
  {
    patron: "/menu",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "Fallaba ABIERTO: sin token (o con token inválido) devolvía el árbol de menú COMPLETO. Goya lo llama con el Bearer solo `if (token)` (menuApp/route.ts:30), así que quien no tenga cookie pasa de ver todo el menú a ver 401. Es el cambio de comportamiento buscado, no un daño colateral.",
  },
  {
    patron: "/usuarios/yo",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo:
      "'¿Quién soy y soy root?' resuelto del token. Nivel AUTENTICADA y NO ROOT a propósito: preguntar si sos root no puede exigir ser root — con ROOT el no-root recibiría 403 y la UI no podría distinguir 'no sos root' de 'se cayó algo'. Existe porque el panel venía leyendo `user.isRoot` de localStorage, que sale del login de GeneXus (USEREXTENDED) y en producción está INVERTIDO respecto de secapi.",
  },
  {
    patron: "/usuarios/:id/atributos",
    metodos: ["GET", "PUT", "POST"],
    nivel: "AUTENTICADA",
    motivo: "Preferencias por usuario (escenario, empresa fletera) del panel de secapi.",
  },
  {
    patron: "/usuarios/:id/permite-login",
    metodos: ["POST"],
    nivel: "AUTENTICADA",
    motivo:
      "Lo llama TrackMovil (/admin/usuarios-empresa) forwardeando el Authorization del navegador; el token ya viajaba, secapi no lo miraba.",
  },
  {
    patron: "/usuarios/por-empresa-fletera",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Pantalla /admin/usuarios-empresa de TrackMovil; ya forwardea el Authorization.",
  },
  {
    patron: "/solicitudes",
    metodos: ["GET", "POST"],
    nivel: "AUTENTICADA",
    motivo:
      "El POST es el autoservicio: lo dispara el botón de /no-autorizado de Goya y TrackMovil, así que PEDIR acceso no puede exigir tener acceso. El GET (panel de aprobación) sigue gateado por el handler con `usuarioPuedeAprobar`, que ahora resuelve por el mismo motor que el nivel ADMIN; queda en AUTENTICADA para que el no-aprobador reciba el 403 explicativo del handler y no un 403 del guard.",
  },
  {
    patron: "/solicitudes/mias",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Solicitudes del propio usuario.",
  },
  {
    patron: "/usuario-preferencias/sugerencias",
    metodos: ["GET"],
    nivel: "AUTENTICADA",
    motivo: "Sugerencias de atributos ya usados, para el autocompletado del panel.",
  },
];

// ─── Resolución de la política ──────────────────────────────────────────────

/**
 * Políticas ordenadas de más específica a menos, para que `/usuarios/externos`
 * gane sobre `/usuarios/:id` — igual que el router de Next, que resuelve el
 * segmento literal antes que el dinámico.
 */
const POLITICAS_ORDENADAS = POLITICAS.map((p) => ({
  ...p,
  regex: patternToRegex(p.patron),
  peso: specificity(p.patron),
})).sort((a, b) => b.peso - a.peso);

/** `/api/db/usuarios/12` → `/usuarios/12`. Devuelve null si no cae bajo el prefijo. */
export function rutaRelativa(pathname: string): string | null {
  const limpio = pathname.replace(/\/+$/, "") || "/";
  if (limpio === PREFIJO_API_DB) return "/";
  if (!limpio.startsWith(PREFIJO_API_DB + "/")) return null;
  return limpio.slice(PREFIJO_API_DB.length);
}

/**
 * Política declarada para (path, método), o `null` si no hay ninguna.
 *
 * `null` NO significa "abierta": significa que nadie decidió, y el guard
 * deniega. Es la diferencia entre olvidarse y dejar entrar.
 */
export function politicaDeRuta(pathname: string, metodo: string): Politica | null {
  const relativa = rutaRelativa(pathname);
  if (relativa === null) return null;

  const m = metodo.toUpperCase();
  for (const p of POLITICAS_ORDENADAS) {
    if (!p.regex.test(relativa)) continue;
    if (!p.metodos.includes(m as Metodo)) continue;
    return p;
  }
  return null;
}

/**
 * Nivel declarado para (path, método), o `null`. Envoltorio de
 * `politicaDeRuta` para los que solo necesitan el nivel — el guard de la UI
 * (`scripts/test-ui-gates-root.ts`) y los tests de la tabla.
 */
export function nivelDeRuta(pathname: string, metodo: string): NivelAcceso | null {
  return politicaDeRuta(pathname, metodo)?.nivel ?? null;
}

/**
 * Objeto y acción contra los que se evalúa una ruta ADMIN, o `null` si la ruta
 * no es ADMIN. Lo usa el test estático de la UI para saber con qué `objetoKey`
 * tiene que estar gateada cada pantalla.
 */
export function alcanceAdminDeRuta(
  pathname: string,
  metodo: string,
): { objetoKey: string; accion: string } | null {
  const politica = politicaDeRuta(pathname, metodo);
  if (!politica || politica.nivel !== "ADMIN") return null;
  return { objetoKey: politica.objetoKey, accion: accionDePolitica(politica, metodo) };
}

/**
 * Las `objetoKey` que usa la tabla, sin repetir. Es la lista contra la que la UI
 * declara sus pantallas: si alguien agrega una política ADMIN con un objeto
 * nuevo, aparece acá solo y el tipo del hook lo acepta sin tocar nada.
 */
export const OBJETO_KEYS_ADMIN: readonly string[] = [
  ...new Set(POLITICAS.filter((p) => p.nivel === "ADMIN").map((p) => p.objetoKey)),
].sort();

// ─── Api-key de servicio ────────────────────────────────────────────────────

/**
 * Largo mínimo de la api-key. Mismo criterio que JWT_SECRET: una key corta se
 * adivina, y esta abre el login de Granel.
 */
export const LARGO_MINIMO_CLAVE_SERVICIO = 32;

/**
 * Header de la api-key. El MISMO que ya usa el repo para salir contra el
 * as400-api (`src/lib/usuarios/sources/as400Users.ts`): una sola convención en
 * la casa, no dos. La diferencia es el sentido — `USERS_API_KEY` es SALIENTE
 * (secapi → as400-api) y `SECAPI_SERVICE_KEY` es ENTRANTE (Granel → secapi).
 * Son dos secretos distintos y no hay que mezclarlos.
 */
export const HEADER_API_KEY = "x-api-key";

/**
 * Keys aceptadas, de `SECAPI_SERVICE_KEY`. Se admite lista separada por comas
 * para poder ROTAR sin coordinar el reinicio de secapi y el de Granel en el
 * mismo segundo: se agrega la nueva, se despliega Granel, se saca la vieja.
 *
 * Se lee en cada request (no al importar el módulo) por lo mismo que
 * `leerSecretoJwt`: un cambio de ambiente no debería exigir reiniciar para
 * volver a evaluarse.
 */
function clavesDeServicio(): string[] {
  return (process.env.SECAPI_SERVICE_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= LARGO_MINIMO_CLAVE_SERVICIO);
}

/** Comparación en tiempo constante: comparar keys con `===` filtra el prefijo. */
function igualSinTiming(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** ¿Vino una api-key de servicio válida? `null` = no vino ninguna. */
export function claveDeServicioValida(req: NextRequest): boolean | null {
  const presentada = req.headers.get(HEADER_API_KEY)?.trim();
  if (!presentada) return null;

  const aceptadas = clavesDeServicio();
  if (aceptadas.length === 0) {
    console.error(
      "[apiGuard] llegó una x-api-key pero SECAPI_SERVICE_KEY no está seteada (o es más corta que " +
        `${LARGO_MINIMO_CLAVE_SERVICIO} caracteres): se rechaza.`,
    );
    return false;
  }
  return aceptadas.some((k) => igualSinTiming(k, presentada));
}

// ─── Resultado del guard ────────────────────────────────────────────────────

export type CodigoApiAuth =
  | "SIN_POLITICA" // 403 — ruta/método sin política declarada: fail-closed
  | "SIN_TOKEN" // 401 — ni Authorization, ni cookie `token`, ni api-key válida
  | "TOKEN_INVALIDO" // 401 — firma que no cierra, o malformado
  | "TOKEN_VENCIDO" // 401 — firma válida, `exp` pasado
  | "USUARIO_NO_ENCONTRADO" // 401 — el token nombra a alguien que no está activo
  | "NO_ROOT" // 403 — sesión válida sin el rol Root de SecuritySuite
  | "NO_ADMIN" // 403 — ni root ni la funcionalidad de esa pantalla otorgada
  | "ADMIN_SIN_OBJETO" // 403 — política ADMIN sin `objetoKey`: bug de configuración
  | "SERVICIO_FUERA_DE_ALCANCE" // 403 — api-key válida en un endpoint que no le toca
  | "SECRETO_NO_CONFIGURADO" // 503 — JWT_SECRET ausente, corta o con el default del código
  | "ERROR_GUARD"; // 503 — fail-closed: no se pudo decidir

export type ResultadoApiAuth =
  | {
      ok: true;
      nivel: NivelAcceso;
      /** null en PUBLICA y en SERVICIO resuelto por api-key. */
      usuario: UsuarioAuth | null;
      /** true si entró con la api-key de servicio y no con una sesión de usuario. */
      viaServicio: boolean;
    }
  | { ok: false; status: number; code: CodigoApiAuth; respuesta: NextResponse };

/**
 * Mensaje para el consumidor. NUNCA se devuelve el `code` en el body: son
 * nombres internos (mismo criterio que `mensajeDenegacion` de
 * /usuarios/importar). El code viaja en el header `x-auth-guard`, que es lo que
 * mira el que está debuggeando un 401, no el usuario que ve el cartel.
 */
function mensajeDe(code: CodigoApiAuth): string {
  switch (code) {
    case "SIN_TOKEN":
      return "Falta la credencial de acceso";
    case "TOKEN_INVALIDO":
    case "TOKEN_VENCIDO":
    case "USUARIO_NO_ENCONTRADO":
      return "Tu sesión no es válida, volvé a iniciar sesión";
    case "NO_ROOT":
      return "Esta operación requiere ser root";
    case "NO_ADMIN":
      // A diferencia de NO_ROOT, esto SÍ se puede resolver: hay a quién pedirle.
      return "No tenés permiso para administrar esta parte de SecuritySuite. Pedísela a un administrador.";
    case "SIN_POLITICA":
    case "ADMIN_SIN_OBJETO":
    case "SERVICIO_FUERA_DE_ALCANCE":
      return "No tenés acceso a este recurso";
    case "SECRETO_NO_CONFIGURADO":
    case "ERROR_GUARD":
      return "El servidor no está configurado para autorizar esta operación; avisá a sistemas";
  }
}

function denegar(status: number, code: CodigoApiAuth): ResultadoApiAuth {
  const respuesta = NextResponse.json(
    { success: false, error: mensajeDe(code) },
    { status, headers: { "x-auth-guard": code } },
  );
  return { ok: false, status, code, respuesta };
}

// ─── El guard ───────────────────────────────────────────────────────────────

export interface DependenciasApiGuard {
  /** Resuelve el usuario del JWT. Por defecto, el helper de @/lib/permisos. */
  resolveUsuario: (req: NextRequest) => Promise<UsuarioAuth | null>;
  /**
   * El motor de permisos de secapi aplicado a secapi: ¿este usuario tiene
   * otorgada la funcionalidad de (objetoKey, accion)? Por defecto,
   * `usuarioTieneFuncionalidad` de @/lib/permisos, que es el MISMO código que
   * responde `POST /api/db/permisos` para Goya y TrackMovil.
   */
  tieneFuncionalidad: (
    usuario: UsuarioAuth,
    objetoKey: string,
    accion: string,
  ) => Promise<boolean>;
}

const dependenciasReales: DependenciasApiGuard = {
  resolveUsuario,
  tieneFuncionalidad: (usuario, objetoKey, accion) =>
    usuarioTieneFuncionalidad(usuario, objetoKey, accion),
};

/**
 * Construye el guard con sus dependencias. La app usa la instancia por defecto
 * (`requireApiAuth`); los tests crean una con un `resolveUsuario` falso, sin
 * base de datos de por medio.
 */
export function crearGuardApi(deps: DependenciasApiGuard = dependenciasReales) {
  /**
   * Gate de un route handler de /api/db. Va como PRIMERA línea del handler:
   *
   *     const gate = await requireApiAuth(request);
   *     if (!gate.ok) return gate.respuesta;
   *
   * El orden es el mismo que el del guard de /docs, y no es casual:
   *   1. ¿Hay política para esta ruta+método? Si no, se deniega.
   *   2. ¿Es pública? Entonces no se mira nada más.
   *   3. Api-key de servicio, y solo donde corresponde.
   *   4. ¿Vino token?
   *   5. ¿El secreto sirve? Si no, 503: mala configuración no es pase libre.
   *   6. Firma y vencimiento (local, sin tocar la base).
   *   7. Recién ahí, el usuario contra Postgres.
   */
  async function requireApiAuth(req: NextRequest): Promise<ResultadoApiAuth> {
    const pathname = req.nextUrl.pathname;
    const politica = politicaDeRuta(pathname, req.method);
    const nivel = politica?.nivel ?? null;

    if (politica === null || nivel === null) {
      // Ruta nueva sin política, o método que la tabla no contempla. Se deniega
      // y se loguea fuerte: es un bug de configuración, no un ataque.
      console.error(
        `[apiGuard] ${req.method} ${pathname} no tiene política declarada en POLITICAS ` +
          "(src/lib/auth/apiGuard.ts). Se deniega por fail-closed.",
      );
      return denegar(403, "SIN_POLITICA");
    }

    if (nivel === "PUBLICA") {
      return { ok: true, nivel, usuario: null, viaServicio: false };
    }

    // La api-key se mira antes que el JWT porque el llamador server-to-server no
    // tiene sesión de nadie y no va a traer token nunca.
    const conClave = claveDeServicioValida(req);
    if (conClave === true) {
      // La api-key NUNCA alcanza un endpoint ADMIN: no representa a una
      // persona, así que no hay a quién preguntarle qué tiene otorgado. Cae en
      // el mismo `!== "SERVICIO"` que el resto, y queda dicho para que nadie
      // intente "arreglarlo" agregando una excepción.
      if (nivel !== "SERVICIO") {
        // La key es válida pero este endpoint no está en su alcance. Es el punto
        // de todo: que la credencial de Granel no sea una llave maestra.
        console.warn(
          `[apiGuard] api-key de servicio válida usada en ${req.method} ${pathname}, ` +
            "que no es de nivel SERVICIO. Se deniega.",
        );
        return denegar(403, "SERVICIO_FUERA_DE_ALCANCE");
      }
      return { ok: true, nivel, usuario: null, viaServicio: true };
    }
    if (conClave === false) {
      console.warn(`[apiGuard] api-key inválida en ${req.method} ${pathname}`);
      // No se corta acá: puede venir además un Bearer legítimo. Si no viene,
      // igual termina en SIN_TOKEN.
    }

    let token: string | null;
    try {
      token = extractToken(req);
    } catch {
      return denegar(401, "TOKEN_INVALIDO");
    }
    if (!token || !token.trim()) return denegar(401, "SIN_TOKEN");

    const secreto = leerSecretoJwt();
    if (!secreto.ok) {
      console.error(
        `[apiGuard] ${secreto.motivo}. /api/db queda cerrado hasta configurarla (ver docs/api/README.md).`,
      );
      return denegar(503, "SECRETO_NO_CONFIGURADO");
    }

    const verificado = verificarJwt(token, secreto.secreto);
    if (!verificado.ok) {
      if (verificado.codigo === "ERROR_VERIFICACION") return denegar(503, "ERROR_GUARD");
      return denegar(401, verificado.codigo);
    }

    let usuario: UsuarioAuth | null;
    try {
      usuario = await deps.resolveUsuario(req);
    } catch (error) {
      // Fail-closed. Nada de "si la base no contesta, dejalo pasar".
      console.error("[apiGuard] error resolviendo el usuario", error);
      return denegar(503, "ERROR_GUARD");
    }

    // 401 y no 403: el token es válido pero no corresponde a un usuario activo.
    // Para el front eso significa "volvé a loguearte", y eso lo dispara el 401.
    if (!usuario) return denegar(401, "USUARIO_NO_ENCONTRADO");

    // Root = rol "Root" de SecuritySuite (no la columna `usuarios.es_root`).
    // El cálculo vive en `resolveUsuario`; acá solo se lee el resultado.
    if (nivel === "ROOT" && !usuario.esRootDeSecapi) return denegar(403, "NO_ROOT");

    if (politica.nivel === "ADMIN" && !usuario.esRootDeSecapi) {
      // Root no llega hasta acá: pasa por el `if` de arriba sin tocar la base.
      // Es lo que garantiza que una instalación sin funcionalidades sembradas
      // siga teniendo quién la administre.
      const objetoKey = politica.objetoKey?.trim();
      const accion = accionDePolitica(politica, req.method);

      if (!objetoKey || !accion) {
        // El tipo `PoliticaAdmin` hace esto imposible desde TypeScript; queda
        // igual porque una política mal armada tiene que ser un 403 ruidoso y
        // no un pase libre. `accion` vacía = método que `accionPorMetodo` no
        // sabe mapear (HEAD, OPTIONS…).
        console.error(
          `[apiGuard] ${req.method} ${pathname} es de nivel ADMIN pero no declara ` +
            `objetoKey (${String(politica.objetoKey)}) o no mapea a una acción ` +
            `(${String(accion)}). Se deniega por fail-closed.`,
        );
        return denegar(403, "ADMIN_SIN_OBJETO");
      }

      let habilitado: boolean;
      try {
        habilitado = await deps.tieneFuncionalidad(usuario, objetoKey, accion);
      } catch (error) {
        // Mismo criterio que con `resolveUsuario`: si no se pudo preguntar, no
        // se deja pasar. "La base no contesta" no es "tenés permiso".
        console.error(
          `[apiGuard] error evaluando el permiso ADMIN de ${req.method} ${pathname} ` +
            `(objeto="${objetoKey}" accion="${accion}")`,
          error,
        );
        return denegar(503, "ERROR_GUARD");
      }

      if (!habilitado) return denegar(403, "NO_ADMIN");
    }

    return { ok: true, nivel, usuario, viaServicio: false };
  }

  return { requireApiAuth };
}

export const requireApiAuth = crearGuardApi().requireApiAuth;
