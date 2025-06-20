'use client';

import { ReactNode, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Navbar } from "@/components/dashboard/Navbar";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "flex min-h-screen transition-colors duration-300",
        theme === "dark" ? "bg-gray-900 text-white" : "bg-background text-foreground"
      )}
    >
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex flex-col flex-1">
        <Navbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
