import type { AuthDoc, EndpointDoc, ParametroDoc } from "@/lib/docs/catalogo";

// =====================================================================
// Los ejemplos copiables del visor: curl, fetch y VB6.
//
// Se arman **en el cliente**, contra `window.location.origin`: el ejemplo que
// alguien copia tiene que apuntar al ambiente en el que está parado. Un host
// hardcodeado (o peor, una IP) se copia igual y falla en el otro ambiente, o
// —lo caro— funciona contra producción sin que nadie lo haya querido.
//
// El mismo criterio vale para los ejemplos escritos a mano en
// `docs/api/anotaciones.yaml`: se escriben con el marcador `{{ORIGEN}}` y
// `conOrigen()` lo reemplaza al pintarlos.
// =====================================================================

/** Hosts que aparecían escritos a mano y que se reescriben al origen real. */
const HOSTS_A_REEMPLAZAR = [
  "{{ORIGEN}}",
  "http://localhost:4005",
  "https://secapi.riogas.com.uy",
];

/** Reemplaza el marcador y los hosts viejos por el origen del ambiente actual. */
export function conOrigen(codigo: string, origen: string): string {
  let salida = codigo;
  for (const host of HOSTS_A_REEMPLAZAR) salida = salida.split(host).join(origen);
  return salida;
}

/** Un valor de muestra para un parámetro, para que el ejemplo se pueda pegar. */
export function valorDeMuestra(p: ParametroDoc): string {
  if (p.ejemplo) return p.ejemplo;
  if (p.tipo.startsWith("integer") || p.tipo.startsWith("number")) return "1";
  if (p.tipo.startsWith("boolean")) return "true";
  if (p.nombre.toLowerCase().endsWith("id")) return "1";
  return `<${p.nombre}>`;
}

/**
 * `/api/db/usuarios/{id}` + `{ id: "7" }` → `/api/db/usuarios/7`.
 * Lo que no tenga valor queda como está, para que se vea qué falta completar.
 */
export function sustituirParametros(ruta: string, valores: Record<string, string>): string {
  return ruta.replace(/\{([^}]+)\}/g, (original, nombre: string) => {
    const valor = valores[nombre];
    return valor === undefined || valor === "" ? original : encodeURIComponent(valor);
  });
}

export function armarQueryString(valores: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== "") params.append(clave, valor);
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export interface DatosEjemplo {
  metodo: string;
  /** Path ya sustituido y con la query pegada. */
  path: string;
  origen: string;
  auth: AuthDoc;
  /** Cuerpo JSON como texto, si lo hay. */
  cuerpo?: string;
}

/** El header de autenticación que corresponde, o null si el endpoint no pide. */
function headerDeAuth(auth: AuthDoc): { nombre: string; valor: string } | null {
  if (auth.modo === "jwt") return { nombre: "Authorization", valor: "Bearer $TOKEN" };
  if (auth.modo === "api-key") return { nombre: "x-api-key", valor: "$API_KEY" };
  if (auth.modo === "passthrough")
    return { nombre: "Authorization", valor: "Bearer $TOKEN" };
  return null;
}

/** Genera un ejemplo a partir del endpoint y de lo que el usuario haya cargado. */
export function datosDeEndpoint(
  endpoint: EndpointDoc,
  origen: string,
  path: string,
  cuerpo?: string,
): DatosEjemplo {
  return { metodo: endpoint.metodo, path, origen, auth: endpoint.auth, cuerpo };
}

// ─── curl ───────────────────────────────────────────────────────────────────

export function ejemploCurl(d: DatosEjemplo): string {
  const lineas: string[] = [];
  const url = `${d.origen}${d.path}`;
  lineas.push(d.metodo === "GET" ? `curl "${url}"` : `curl -X ${d.metodo} "${url}"`);

  if (d.cuerpo) lineas.push(`  -H "Content-Type: application/json"`);
  const auth = headerDeAuth(d.auth);
  if (auth) lineas.push(`  -H "${auth.nombre}: ${auth.valor}"`);
  if (d.cuerpo) lineas.push(`  -d '${d.cuerpo.replace(/'/g, `'\\''`)}'`);

  return lineas.join(" \\\n");
}

// ─── fetch (JS) ─────────────────────────────────────────────────────────────

export function ejemploFetch(d: DatosEjemplo): string {
  const headers: string[] = [];
  if (d.cuerpo) headers.push(`    "Content-Type": "application/json",`);
  const auth = headerDeAuth(d.auth);
  if (auth) {
    headers.push(
      auth.nombre === "Authorization"
        ? "    Authorization: `Bearer ${token}`,"
        : `    "${auth.nombre}": apiKey,`,
    );
  }

  const opciones: string[] = [`  method: "${d.metodo}",`];
  if (headers.length > 0) opciones.push(`  headers: {`, ...headers, `  },`);
  if (d.cuerpo) {
    const indentado = d.cuerpo
      .split("\n")
      .map((l, i) => (i === 0 ? l : `  ${l}`))
      .join("\n");
    opciones.push(`  body: JSON.stringify(${indentado}),`);
  }

  return [
    `const respuesta = await fetch("${d.origen}${d.path}", {`,
    ...opciones,
    `});`,
    ``,
    `if (!respuesta.ok) throw new Error(\`\${respuesta.status} \${respuesta.statusText}\`);`,
    `const datos = await respuesta.json();`,
  ].join("\n");
}

// ─── VB6 ────────────────────────────────────────────────────────────────────

/** En VB6 las comillas dentro de un literal se duplican. */
function literalVb(texto: string): string {
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * `MSXML2.ServerXMLHTTP.6.0` y no `XMLHTTP`: es el que anda desde un servicio y
 * el que ya usa el resto de la integración VB6 de RíoGas. Llamada sincrónica
 * (`False`), que es como se consume desde los formularios.
 */
export function ejemploVb6(d: DatosEjemplo): string {
  const lineas: string[] = [
    `Dim http As Object`,
    `Dim sUrl As String`,
    ...(d.cuerpo ? [`Dim sBody As String`] : []),
    ``,
    `sUrl = ${literalVb(`${d.origen}${d.path}`)}`,
  ];

  if (d.cuerpo) {
    // El cuerpo se manda en una línea: VB6 no tiene literales multilínea y el
    // `& _` por cada salto ensucia el ejemplo más de lo que ayuda.
    const enUnaLinea = d.cuerpo.replace(/\s*\n\s*/g, " ");
    lineas.push(`sBody = ${literalVb(enUnaLinea)}`);
  }

  lineas.push(
    ``,
    `Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")`,
    `http.Open ${literalVb(d.metodo)}, sUrl, False`,
  );

  if (d.cuerpo) lineas.push(`http.setRequestHeader "Content-Type", "application/json"`);
  const auth = headerDeAuth(d.auth);
  if (auth) {
    lineas.push(
      auth.nombre === "Authorization"
        ? `http.setRequestHeader "Authorization", "Bearer " & sToken`
        : `http.setRequestHeader "${auth.nombre}", sApiKey`,
    );
  }

  lineas.push(
    d.cuerpo ? `http.send sBody` : `http.send`,
    ``,
    `If http.Status = 200 Then`,
    `    Debug.Print http.responseText`,
    `Else`,
    `    MsgBox "Error " & http.Status & ": " & http.responseText`,
    `End If`,
    ``,
    `Set http = Nothing`,
  );

  return lineas.join("\n");
}

/** ¿Alguno de los consumidores anotados es VB6? Entonces va el ejemplo VB6. */
export function tieneConsumidorVb6(endpoint: EndpointDoc): boolean {
  return endpoint.consumidores.some((c) => /\bvb\s?6\b|visual\s*basic/i.test(c));
}
