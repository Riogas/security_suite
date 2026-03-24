// src/app/api/[...proxy]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ||
  "https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite";

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

    // NODE_TLS_REJECT_UNAUTHORIZED=0 se setea en next.config.ts para ignorar certificados autofirmados
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    // Copiar headers de respuesta
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Excluir headers que no deben reenviarse al cliente
      if (
        key !== "content-encoding" &&
        key !== "transfer-encoding" &&
        key !== "connection" &&
        key !== "set-cookie" // No reenviar Set-Cookie del backend para evitar sobreescribir cookies del cliente (ej: token)
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
    console.error("[Proxy] Cause:", error.cause);
    console.error("[Proxy] BACKEND_BASE_URL:", BACKEND_BASE_URL);
    return NextResponse.json(
      {
        error: "Proxy error",
        message: error.message,
        cause: error.cause?.message || error.cause?.code || String(error.cause),
        targetUrl: `${BACKEND_BASE_URL}/${pathSegments.join("/")}`,
      },
      { status: 500 }
    );
  }
}
