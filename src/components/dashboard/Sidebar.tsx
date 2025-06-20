'use client';

import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard, Menu } from "lucide-react";

interface Props {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: Props) {
  return (
    <aside className={`h-screen border-r bg-card transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="text-xl font-bold">Dashboard</span>}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <nav className="flex flex-col px-2 space-y-1">
        <Button variant="ghost" className="justify-start gap-2 w-full">
          <Home className="w-4 h-4" /> {!collapsed && "Inicio"}
        </Button>
        <Button variant="ghost" className="justify-start gap-2 w-full">
          <LayoutDashboard className="w-4 h-4" /> {!collapsed && "Panel"}
        </Button>
      </nav>
    </aside>
  );
}
