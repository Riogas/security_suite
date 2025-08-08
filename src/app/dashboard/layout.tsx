"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Navbar } from "@/components/dashboard/Navbar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
import Link from "next/link";
import Cookies from "js-cookie";
import { motion, AnimatePresence } from "framer-motion";
import { Orbit } from "lucide-react";



const PUBLIC_PATHS = ["/", "/login", "/no-autorizado"];
const PERMISOS_API_URL = process.env.NEXT_PUBLIC_PERMISOS_API_URL || "http://localhost:8082/permisos";
const TAG = "🛡️ [DashboardGuard]";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const [verificando, setVerificando] = useState(true); // ⏳ Nuevo estado de espera

  // Breadcrumb
  const pathSegments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment, index, array) => {
      const href = "/" + array.slice(0, index + 1).join("/");
      return {
        label: segment.charAt(0).toUpperCase() + segment.slice(1),
        href,
      };
    });

  // 🔐 Lógica de protección de ruta
  useEffect(() => {
    const checkPermiso = async () => {
      const guardTag = `${TAG}[${pathname}]`;

      // 1. Si es ruta pública, salir
      if (PUBLIC_PATHS.includes(pathname)) {
        console.log(`${guardTag} 🔓 Ruta pública, sin verificación`);
        setVerificando(false);
        return;
      }

      // 2. Leer token de cookies
      const token = Cookies.get("token");
      if (!token) {
        console.warn(`${guardTag} 🔐 No hay token, redirigiendo a /login`);
        router.push("/login");
        return;
      }

      // 3. Validar permiso vía API
      try {
        console.log(`${guardTag} 🔎 Validando permiso con token y ruta`);

        const resp = await fetch(PERMISOS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ruta: pathname }),
        });

        if (!resp.ok) {
          console.warn(`${guardTag} ⚠️ Respuesta no OK (${resp.status}), redirigiendo a /no-autorizado`);
          router.push("/no-autorizado");
          return;
        }

        const json = await resp.json();
        const permitido = !!json.permitido;

        if (!permitido) {
          console.warn(`${guardTag} ❌ Acceso denegado, redirigiendo a /no-autorizado`);
          router.push("/no-autorizado");
        } else {
          console.log(`${guardTag} ✅ Acceso concedido`);
          setVerificando(false); // ⏳ Ya puede mostrar contenido
        }
      } catch (error) {
        console.error(`${guardTag} ❌ Error al validar permiso:`, error);
        router.push("/no-autorizado");
      }
    };

    checkPermiso();
  }, [pathname, router]);

  // ⏳ Mientras verifica permisos, no renderiza nada
  if (verificando) {
  return (
    <AnimatePresence>
      <motion.div
        key="loader"
        className="flex min-h-screen items-center justify-center bg-[#0f172a] text-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="flex items-center justify-center rounded-full bg-[#1e293b] p-6 shadow-lg"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div
            animate={{
              rotate: [0, 360],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: "linear",
            }}
          >
            <Orbit
              className="w-16 h-16 text-[#60a5fa]" // azul suave
              strokeWidth={1.5}
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}





  return (
    <div
      className={cn(
        "flex min-h-screen transition-colors duration-300 bg-background text-foreground"
      )}
    >
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex flex-col flex-1">
        <Navbar />
        <div className="px-6 pt-4">
          <nav className="text-sm text-muted-foreground mb-4">
            <ol className="flex items-center space-x-2">
              <li>
                <Link
                  href="/dashboard"
                  className="hover:underline text-primary"
                >
                  Inicio
                </Link>
              </li>
              {pathSegments.map((segment, index) => (
                <li key={segment.href} className="flex items-center">
                  <span className="mx-2">/</span>
                  {index === pathSegments.length - 1 ? (
                    <span className="text-foreground">{segment.label}</span>
                  ) : (
                    <Link
                      href={segment.href}
                      className="hover:underline text-primary"
                    >
                      {segment.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <main className="flex-1 px-6 pb-6">{children}</main>
      </div>
    </div>
  );
}
