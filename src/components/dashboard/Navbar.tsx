"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Settings, User as UserIcon } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState, useEffect } from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useUser } from "@/hooks/useUser";
import { motion } from "framer-motion";

// Nota: el usuario se lee dentro del componente via useUser() hook
// No leer localStorage a nivel de módulo para evitar problemas de SSR/hidratación

function getPuestosFromStorage() {
  if (typeof window === "undefined") return [];
  // Permite guardar un array de puestos en localStorage bajo "puestos"
  const puestosStr = localStorage.getItem("puestos");
  if (puestosStr) {
    try {
      return JSON.parse(puestosStr);
    } catch {
      return [];
    }
  }
  // Si no hay array, busca el puesto único
  const puestoStr = localStorage.getItem("puesto");
  if (puestoStr) {
    try {
      const p = JSON.parse(puestoStr);
      return p && p.puestoId ? [p] : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function Navbar() {
  const { user } = useUser();
  const userInitials = user?.nombre ? user.nombre.charAt(0) : "JD";
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [puestos, setPuestos] = useState<any[]>([]);
  const [puestoActual, setPuestoActual] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const ps = getPuestosFromStorage();
    setPuestos(ps);
    if (ps.length > 0) {
      // Busca el puesto actual en localStorage o toma el primero
      const actual = localStorage.getItem("puestoActual");
      if (actual) {
        try {
          setPuestoActual(JSON.parse(actual));
        } catch {
          setPuestoActual(ps[0]);
        }
      } else {
        setPuestoActual(ps[0]);
      }
    }
  }, []);

  // Cuando cambia el puesto seleccionado
  const handleChangePuesto = (value: string) => {
    const nuevo = puestos.find((p) => String(p.puestoId) === value);
    if (nuevo) {
      setPuestoActual(nuevo);
      localStorage.setItem("puestoActual", JSON.stringify(nuevo));
      // Opcional: actualizar cookie
      document.cookie = `puestoId=${nuevo.puestoId}; path=/; max-age=${60 * 60 * 24 * 30}`;
      document.cookie = `PuestoDsc=${nuevo.PuestoDsc}; path=/; max-age=${60 * 60 * 24 * 30}`;
    }
  };

  const handleLogout = () => {
    // Eliminar token y usuario
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 h-16 px-6 flex items-center justify-end border-b border-border/60 bg-card/75 backdrop-blur-md shadow-sm gap-4">
      {/* Nombre de usuario pill */}
      {mounted && user?.nombre && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5
            border border-border/60 rounded-full bg-muted/40"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          {user.nombre}
        </motion.div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="rounded-full p-0 h-9 w-9 relative">
            <Avatar className="h-9 w-9 ring-2 ring-border/60 ring-offset-1 ring-offset-background">
              <AvatarImage src="/avatar.png" alt="Avatar" />
              <AvatarFallback className="text-sm font-medium">{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-medium">{user?.nombre || "Usuario"}</p>
              <p className="text-xs text-muted-foreground">{user?.username || ""}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserIcon className="mr-2 h-4 w-4" /> Perfil
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" /> Configuración
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleTheme}>
            {mounted &&
              (theme === "dark" ? (
                <><Sun className="mr-2 h-4 w-4" /> Tema Claro</>
              ) : (
                <><Moon className="mr-2 h-4 w-4" /> Tema Oscuro</>
              ))}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
