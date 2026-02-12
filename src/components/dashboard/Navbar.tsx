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
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState, useEffect } from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useUser } from "@/hooks/useUser";

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
    <header className="h-16 px-6 flex items-center justify-end border-b bg-card gap-4">
      {/* Nombre de usuario */}
      {mounted && user?.nombre && (
        <div className="text-sm text-muted-foreground px-3 py-1 border rounded bg-secondary">
          Usuario: {user.nombre}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="rounded-full p-0 h-10 w-10">
            <Avatar>
              <AvatarImage src="/avatar.png" alt="Avatar" />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Perfil</DropdownMenuItem>
          <DropdownMenuItem>Configuración</DropdownMenuItem>
          <DropdownMenuItem onClick={toggleTheme}>
            {mounted &&
              (theme === "dark" ? (
                <>
                  <Sun className="mr-2 h-4 w-4" /> Tema Claro
                </>
              ) : (
                <>
                  <Moon className="mr-2 h-4 w-4" /> Tema Oscuro
                </>
              ))}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
