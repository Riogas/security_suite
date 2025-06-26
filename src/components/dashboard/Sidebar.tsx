"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import {
  apiGetMenuByRole,
  Role,
  MenuItem as ApiMenuItem,
} from "@/services/api";
import { iconMap } from "./iconMap";
import { useRouter } from "next/navigation";

interface Props {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

// Aseguramos que los iconos coincidan con los del mapa
interface MenuItem extends ApiMenuItem {
  icon: keyof typeof iconMap;
}

export function Sidebar({ collapsed, setCollapsed }: Props) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser) as { role: Role };
        const role: Role = user?.role || "user";

        apiGetMenuByRole(role).then((items) => {
          setMenuItems(items as MenuItem[]);
          setLoading(false);
        });
      } catch (e) {
        console.error("❌ Error al leer el usuario desde localStorage:", e);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <aside
      className={`h-screen border-r bg-card transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="text-xl font-bold">Dashboard</span>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <nav className="flex flex-col px-2 space-y-1">
        {loading ? (
          <span className="text-muted-foreground text-sm px-2">
            Cargando menú...
          </span>
        ) : (
          menuItems.map((item) => {
            const Icon = iconMap[item.icon] || Menu;
            return (
              <Button
                key={item.label}
                variant="ghost"
                className="justify-start gap-2 w-full"
                onClick={() => router.push(item.path)}
              >
                <Icon className="w-4 h-4" /> {!collapsed && item.label}
              </Button>
            );
          })
        )}
      </nav>
    </aside>
  );
}
