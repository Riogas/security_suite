// src/app/api/[...proxy]/route.ts
import { NextRequest, NextResponse } from "next/server";
import https from "https";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ||
  "https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite";

// Agente HTTPS que ignora certificados autofirmados
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy } = await params;
  return proxyRequest(request, proxy);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy } = await params;
  return proxyRequest(request, proxy);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy } = await params;
  return proxyRequest(request, proxy);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy } = await params;
  return proxyRequest(request, proxy);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy } = await params;
  return proxyRequest(request, proxy);
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  try {
    const path = pathSegments.join("/");
    const targetUrl = `${BACKEND_BASE_URL}/${path}`;
    
    console.log(`[Proxy] ${request.method} ${targetUrl}`);

    // Copiar headers
    const headers: HeadersInit = {};
    request.headers.forEach((value, key) => {
      // Excluir headers que no deben reenviarse
      if (
        !key.startsWith("x-") &&
        key !== "host" &&
        key !== "connection" &&
        key !== "content-length"
      ) {
        headers[key] = value;
      }
    });

    // Obtener body si existe
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = await request.text();
      } catch {
        // No body
      }
    }

    // Hacer la petición con el agente que ignora SSL
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // @ts-expect-error - agent no está en los tipos pero funciona en Node.js
      agent: targetUrl.startsWith("https") ? httpsAgent : undefined,
    });

    // Copiar headers de respuesta
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Excluir algunos headers
      if (
        key !== "content-encoding" &&
        key !== "transfer-encoding" &&
        key !== "connection"
      ) {
        responseHeaders.set(key, value);
      }
    });

    // Obtener el body de la respuesta
    const responseBody = await response.text();

    console.log(`[Proxy] Response ${response.status} - ${responseBody.length} bytes`);

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[Proxy] Error:", error.message);
    return NextResponse.json(
      {
        error: "Proxy error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
