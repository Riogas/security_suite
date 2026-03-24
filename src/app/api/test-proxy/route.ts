// src/app/api/test-proxy/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const backendUrl = process.env.BACKEND_BASE_URL || "NOT_SET";
  
  return NextResponse.json({
    message: "Proxy test endpoint",
    backendUrl,
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
      PERMISOS_API_URL: process.env.PERMISOS_API_URL,
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const backendUrl = process.env.BACKEND_BASE_URL || "https://sgm.glp.riogas.com.uy/servicios/SecuritySuite";
    const targetUrl = `${backendUrl}/loginUser`;
    
    console.log("[Test Proxy] Intentando conectar a:", targetUrl);
    console.log("[Test Proxy] Body:", body);
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    console.log("[Test Proxy] Response status:", response.status);
    const data = await response.text();
    console.log("[Test Proxy] Response data:", data);
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "X-Backend-Url": targetUrl,
        "X-Backend-Status": response.status.toString(),
      },
    });
  } catch (error: any) {
    console.error("[Test Proxy] Error:", error);
    return NextResponse.json(
      {
        error: "Proxy error",
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
