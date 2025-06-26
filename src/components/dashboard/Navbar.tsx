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

const user =
  typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "{}")
    : {};

console.log("👤 Usuario logueado:", user.name, user.role);

export function Navbar() {
  const userInitials = user.name ? user.name.charAt(0) : "JD";
  const { theme, toggleTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="h-16 px-6 flex items-center justify-end border-b bg-card">
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
          <DropdownMenuItem onClick={() => console.log("Cerrar sesión")}>
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
