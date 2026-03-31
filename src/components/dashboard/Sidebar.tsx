"use client";

import { Button } from "@/components/ui/button";
import { Menu as MenuIcon, ChevronDown, ChevronRight, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiMenu } from "@/services/api"; // ← usamos tu función real
import { iconMap } from "./iconMap";
import { usePathname, useRouter } from "next/navigation";
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
    const type = String(
      it.type || (children.length ? "SUBMENU" : "PAGE"),
    ).toUpperCase() as NormalizedMenuItem["type"];
    const style =
      (it.style ?? (it as any)?.accionstyle ?? "").toString().trim() ||
      undefined;
    return {
      icon: asIconKey(it.icon),
      key:
        (it.key && String(it.key)) ||
        (it.path && String(it.path)) ||
        `${type}-${idx}`,
      label: normalizeLabel(it),
      order:
        typeof it.order === "number"
          ? it.order
          : parseInt(String(it.order ?? 0), 10) || 0,
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
  const pathname = usePathname();
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

  function renderItem(item: NormalizedMenuItem, depth = 0, i = 0) {
    const Icon = iconMap[item.icon] || MenuIcon;
    const hasChildren = item.children && item.children.length > 0;
    const isActive = pathname === item.path || (item.path !== "/" && item.path !== "#" && pathname.startsWith(item.path));

    if (hasChildren || item.type === "SUBMENU") {
      const isOpen = !!open[item.key];
      return (
        <motion.div
          key={item.key}
          className="w-full"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <Button
            variant="ghost"
            className={`justify-start gap-2 w-full rounded-lg relative ${
              depth ? "pl-8" : ""
            } ${item.style ?? ""}`}
            onClick={() => setOpen((s) => ({ ...s, [item.key]: !s[item.key] }))}
            title={item.label}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left truncate">{item.label}</span>
            )}
            {!collapsed &&
              (isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              ))}
          </Button>
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                className="flex flex-col overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
              >
                {item.children
                  .sort((a, b) => a.order - b.order)
                  .map((child, ci) => renderItem(child, depth + 1, ci))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    // PAGE (sin hijos)
    return (
      <motion.div
        key={item.key}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.04, duration: 0.3 }}
        className="relative"
      >
        {/* Active left indicator */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
          />
        )}
        <Button
          variant={isActive ? "secondary" : "ghost"}
          className={`justify-start gap-2 w-full rounded-lg ${
            depth ? "pl-8" : ""
          } ${item.style ?? ""} ${isActive ? "font-medium" : ""}`}
          onClick={() => {
            loadingApp.showNavigating();
            router.push(item.path || "/");
          }}
          title={item.label}
        >
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
          {!collapsed && item.label}
        </Button>
      </motion.div>
    );
  }

  return (
    <aside
      className={`h-screen border-r bg-card flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-border/40">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="leading-none">
              <span className="font-bold text-sm tracking-tight block">Security</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Suite
              </span>
            </div>
          </motion.div>
        )}
        {collapsed && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 mx-auto">
            <Shield className="w-4 h-4 text-primary" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => setCollapsed(!collapsed)}
        >
          <MenuIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col px-2 py-3 space-y-0.5 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 px-1">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="h-9 rounded-lg bg-muted/40 animate-pulse"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.07 }}
              />
            ))}
          </div>
        ) : (
          menuTree.map((item, i) => renderItem(item, 0, i))
        )}
      </nav>
    </aside>
  );
}
