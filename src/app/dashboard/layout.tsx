"use client";

import { ReactNode, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

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
        "flex min-h-screen bg-background text-foreground transition-colors duration-300"
      )}
    >
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex flex-1 flex-col">
        <Navbar />

        {/* Breadcrumbs */}
        <div className="px-6 pt-4">
          <nav className="mb-4 text-sm text-muted-foreground">
            <ol className="flex items-center space-x-2">
              <li>
                <Link href="/dashboard" className="text-primary hover:underline">
                  Inicio
                </Link>
              </li>
              {pathSegments.map((segment, index) => (
                <li key={segment.href} className="flex items-center">
                  <span className="mx-2">/</span>
                  {index === pathSegments.length - 1 ? (
                    <span className="text-foreground">{segment.label}</span>
                  ) : (
                    <Link href={segment.href} className="text-primary hover:underline">
                      {segment.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Contenido */}
        <main className="flex-1 px-6 pb-6">{children}</main>
      </div>
    </div>
  );
}
