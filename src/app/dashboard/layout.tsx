"use client";

import { ReactNode, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Navbar } from "@/components/dashboard/Navbar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

/** Friendly labels for URL segments */
const breadcrumbLabels: Record<string, string> = {
  dashboard: "Inicio",
  usuarios: "Usuarios",
  roles: "Roles",
  funcionalidades: "Funcionalidades",
  aplicaciones: "Aplicaciones",
  objetos: "Objetos",
  acciones: "Acciones",
  permisos: "Permisos",
  crear: "Crear",
  editar: "Editar",
  nuevo: "Nuevo",
  ver: "Ver",
  eventos: "Eventos",
  stats: "Estadísticas",
  configuracion: "Configuración",
};

function segmentLabel(segment: string): string {
  // Numeric or UUID-like segments: show as "#<id>"
  if (/^\d+$/.test(segment)) return `#${segment}`;
  if (/^[0-9a-f-]{36}$/i.test(segment)) return `#${segment.slice(0, 8)}…`;
  return breadcrumbLabels[segment.toLowerCase()] ?? (segment.charAt(0).toUpperCase() + segment.slice(1));
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Breadcrumbs derivados del path
  const pathSegments = useMemo(() => {
    const parts = (pathname || "").split("/").filter(Boolean);
    return parts.map((segment, index) => {
      const href = "/" + parts.slice(0, index + 1).join("/");
      return {
        label: segmentLabel(segment),
        href,
      };
    });
  }, [pathname]);

  return (
    <div
      className={cn(
        "flex min-h-screen bg-background text-foreground transition-colors duration-300",
      )}
    >
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex flex-1 flex-col">
        <Navbar />

        {/* Breadcrumbs */}
        <div className="px-6 pt-4">
          <nav className="mb-4 text-xs text-muted-foreground" aria-label="Migas de pan">
            <ol className="flex items-center gap-1">
              <li>
                <Link
                  href="/dashboard"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Inicio
                </Link>
              </li>
              {pathSegments.map((segment, index) => (
                <li key={segment.href} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 opacity-40 shrink-0" aria-hidden="true" />
                  {index === pathSegments.length - 1 ? (
                    <span className="text-foreground font-medium" aria-current="page">
                      {segment.label}
                    </span>
                  ) : (
                    <Link
                      href={segment.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {segment.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Contenido con page transition */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            className="flex-1 px-6 pb-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
