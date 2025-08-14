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
import axios from "axios";

import { apiValidarPermiso } from "@/services/api";

const PUBLIC_PATHS = ["/", "/login", "/no-autorizado"];
const TAG = "🛡️ [DashboardGuard]";
const APLICACION_NOMBRE = "SecuritySuite";

// último segmento del path → ObjetoKey
const getObjetoKeyFromPath = (path: string) => {
  const segs = (path || "").split("/").filter(Boolean);
  return segs.length ? segs[segs.length - 1] : "";
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);

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

  // Guard
  useEffect(() => {
    const guardTag = `${TAG}[${pathname}]`;
    const controller = new AbortController();

    (async () => {
      // públicas
      if (PUBLIC_PATHS.includes(pathname)) {
        console.log(`${guardTag} 🔓 Ruta pública, sin verificación`);
        setVerificando(false);
        return;
      }

      // token rápido
      const token =
        Cookies.get("token") ||
        (typeof window !== "undefined" ? localStorage.getItem("token") : null);

      if (!token) {
        console.warn(`${guardTag} 🔐 No hay token → /login`);
        router.replace("/login");
        return;
      }

      // validar permiso (PAGE + view)
      try {
        const ObjetoKey = getObjetoKeyFromPath(pathname);

        const { Permitido, redirect } = await apiValidarPermiso(
          {
            AplicacionNombre: APLICACION_NOMBRE,
            ObjetoKey,
            ObjetoTipo: "PAGE",
            AccionKey: "view",
          },
          { signal: controller.signal },
        );

        if (!Permitido) {
          console.warn(`${guardTag} ❌ Acceso denegado`);
          router.replace(redirect || "/no-autorizado");
          return;
        }

        setVerificando(false);
      } catch (err: any) {
        // ignorar cancelaciones (cambio de ruta/unmount)
        if (
          axios.isCancel?.(err) ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "CanceledError" ||
          err?.name === "AbortError" ||
          err?.message === "canceled"
        ) {
          return;
        }

        if (err?.message === "UNAUTHORIZED" || err?.status === 401) {
          console.warn(`${guardTag} ⚠️ Sesión inválida → /login`);
          router.replace("/login");
          return;
        }

        console.error(`${guardTag} ❌ Error al validar permiso:`, err);
        router.replace("/no-autorizado");
      }
    })();

    return () => controller.abort();
  }, [pathname, router]);

  // Loader
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
              animate={{ rotate: [0, 360] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            >
              <Orbit className="w-16 h-16 text-[#60a5fa]" strokeWidth={1.5} />
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Contenido
  return (
    <div
      className={cn(
        "flex min-h-screen transition-colors duration-300 bg-background text-foreground",
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
