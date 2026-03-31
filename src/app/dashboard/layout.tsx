"use client";

import { ReactNode, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Navbar } from "@/components/dashboard/Navbar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

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
        label: segment.charAt(0).toUpperCase() + segment.slice(1),
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
          <nav className="mb-4 text-sm text-muted-foreground">
            <ol className="flex items-center space-x-1.5">
              <li>
                <Link
                  href="/dashboard"
                  className="text-primary hover:underline"
                >
                  Inicio
                </Link>
              </li>
              {pathSegments.map((segment, index) => (
                <li key={segment.href} className="flex items-center">
                  <span className="mx-1.5 opacity-40">/</span>
                  {index === pathSegments.length - 1 ? (
                    <span className="text-foreground font-medium">{segment.label}</span>
                  ) : (
                    <Link
                      href={segment.href}
                      className="text-primary hover:underline"
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
