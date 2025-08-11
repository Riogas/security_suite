"use client";

import { Button } from "@/components/ui/button";
import { Menu as MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { apiMenu } from "@/services/api"; // ← usamos tu función real
import { iconMap } from "./iconMap";
import { useRouter } from "next/navigation";

interface Props {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

type ApiMenuItem = {
  icon?: string;
  key?: string;
  label?: string;
  order?: number;
  path?: string;
};

type MenuItem = {
  icon: keyof typeof iconMap;
  key: string;
  label: string;
  order: number;
  path: string;
};

export function Sidebar({ collapsed, setCollapsed }: Props) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await apiMenu(); // { sdtPuntosMenu: [...] }
        const items: ApiMenuItem[] = data?.sdtPuntosMenu ?? [];

        const normalized: MenuItem[] = items
          .slice()
          .sort(
            (a, b) =>
              (typeof a.order === "number" ? a.order : 0) -
              (typeof b.order === "number" ? b.order : 0)
          )
          .map((it) => {
            const iconKey = (it.icon ?? "menu") as keyof typeof iconMap;
            return {
              icon: iconMap[iconKey] ? iconKey : ("menu" as keyof typeof iconMap),
              key: String(it.key ?? it.label ?? it.path ?? crypto.randomUUID()),
              label: String(it.label ?? it.key ?? ""),
              order: typeof it.order === "number" ? it.order : 0,
              path: String(it.path ?? "/"),
            };
          });

        if (mounted) setMenuItems(normalized);
      } catch (e) {
        console.error("❌ Error cargando menú:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
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
          <MenuIcon className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex flex-col px-2 space-y-1">
        {loading ? (
          <span className="text-muted-foreground text-sm px-2">
            Cargando menú...
          </span>
        ) : (
          menuItems.map((item) => {
            const Icon = iconMap[item.icon] || MenuIcon;
            return (
              <Button
                key={item.key}
                variant="ghost"
                className="justify-start gap-2 w-full"
                onClick={() => router.push(item.path)}
                title={item.label}
              >
                <Icon className="w-4 h-4" />
                {!collapsed && item.label}
              </Button>
            );
          })
        )}
      </nav>
    </aside>
  );
}
