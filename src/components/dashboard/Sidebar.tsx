"use client";

import { Button } from "@/components/ui/button";
import { Menu as MenuIcon, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { apiMenu } from "@/services/api"; // ← usamos tu función real
import { iconMap } from "./iconMap";
import { useRouter } from "next/navigation";
import { useAppLoading } from "@/hooks/useAppLoading";

interface Props {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

type ApiMenuItem = {
  enabled?: string | boolean;
  visible?: string | boolean;
  icon?: string;
  key?: string;
  label?: string;
  order?: string | number;
  path?: string;
  type?: string; // PAGE | SUBMENU | MENU
  children?: ApiMenuItem[];
  style?: string; // new: server-provided css class
  accionstyle?: string; // compatibility alias if backend sends accionstyle
};

type NormalizedMenuItem = {
  icon: keyof typeof iconMap;
  key: string;
  label: string;
  order: number;
  path: string;
  type: "PAGE" | "SUBMENU" | "MENU" | "FEATURE";
  children: NormalizedMenuItem[];
  style?: string; // normalized css class name
};

function toBool(v: unknown) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

function normalizeLabel(it: ApiMenuItem): string {
  if (it.label && String(it.label).trim()) return String(it.label);
  if (it.key && String(it.key).trim()) return String(it.key);
  if (it.path && String(it.path).trim()) {
    const last = String(it.path).split("/").filter(Boolean).pop() || "";
    return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Elemento";
}

function asIconKey(icon?: string): keyof typeof iconMap {
  const key = (icon || "menu") as keyof typeof iconMap;
  return iconMap[key] ? key : ("menu" as keyof typeof iconMap);
}

function normalizeTree(items: ApiMenuItem[] | undefined): NormalizedMenuItem[] {
  const arr = Array.isArray(items) ? items : [];
  const norm = arr.map<NormalizedMenuItem>((it, idx) => {
    const children = normalizeTree(it.children);
    const type = String(it.type || (children.length ? "SUBMENU" : "PAGE")).toUpperCase() as NormalizedMenuItem["type"];
    const style = (it.style ?? (it as any)?.accionstyle ?? "").toString().trim() || undefined;
    return {
      icon: asIconKey(it.icon),
      key:
        (it.key && String(it.key)) ||
        (it.path && String(it.path)) ||
        `${type}-${idx}`,
      label: normalizeLabel(it),
      order: typeof it.order === "number" ? it.order : parseInt(String(it.order ?? 0), 10) || 0,
      path: String(it.path ?? "#"),
      type,
      children,
      style,
    };
  });
  // Ordenar por order
  norm.sort((a, b) => a.order - b.order);
  // Opcional: filtrar por visible/enabled si vienen activos (no filtramos si no están presentes)
  return norm;
}

export function Sidebar({ collapsed, setCollapsed }: Props) {
  const [menuTree, setMenuTree] = useState<NormalizedMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const loadingApp = useAppLoading();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await apiMenu();
        // La API puede devolver { resp: "{ menu: [...] }" } o directamente { menu: [...] }
        let rawMenu: ApiMenuItem[] | undefined;
        if (data?.resp) {
          try {
            const inner = JSON.parse(String(data.resp));
            rawMenu = inner?.menu ?? inner?.sdtPuntosMenu ?? [];
          } catch (e) {
            console.warn("No se pudo parsear resp de apiMenu", e);
            rawMenu = [];
          }
        } else if (Array.isArray(data?.menu)) {
          rawMenu = data.menu;
        } else if (Array.isArray(data?.sdtPuntosMenu)) {
          // compat con forma anterior
          rawMenu = data.sdtPuntosMenu;
        } else {
          rawMenu = [];
        }

        const normalized = normalizeTree(rawMenu);
        if (mounted) setMenuTree(normalized);
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

  function renderItem(item: NormalizedMenuItem, depth = 0) {
    const Icon = iconMap[item.icon] || MenuIcon;
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren || item.type === "SUBMENU") {
      const isOpen = !!open[item.key];
      return (
        <div key={item.key} className="w-full">
          <Button
            variant="ghost"
            className={`justify-start gap-2 w-full ${depth ? "pl-8" : ""} ${item.style ?? ""}`}
            onClick={() => setOpen((s) => ({ ...s, [item.key]: !s[item.key] }))}
            title={item.label}
          >
            <Icon className="w-4 h-4" />
            {!collapsed && (
              <span className="flex-1 text-left truncate">{item.label}</span>
            )}
            {!collapsed && (isOpen ? (<ChevronDown className="w-4 h-4" />) : (<ChevronRight className="w-4 h-4" />))}
          </Button>
          {isOpen && (
            <div className="flex flex-col">
              {item.children.sort((a,b)=>a.order-b.order).map((child) => renderItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // PAGE (o sin hijos)
    return (
      <Button
        key={item.key}
        variant="ghost"
        className={`justify-start gap-2 w-full ${depth ? "pl-8" : ""} ${item.style ?? ""}`}
        onClick={() => {
          loadingApp.showNavigating();
          router.push(item.path || "/");
        }}
        title={item.label}
      >
        <Icon className="w-4 h-4" />
        {!collapsed && item.label}
      </Button>
    );
  }

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
          menuTree.map((item) => renderItem(item))
        )}
      </nav>
    </aside>
  );
}
