'use client';

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState } from "react";
import { toast } from "sonner"; // 👈 Notificaciones visuales



export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!email.trim()) newErrors.email = "El email es obligatorio";
    else if (!validateEmail(email)) newErrors.email = "Formato de email inválido";

    if (!password.trim()) newErrors.password = "La contraseña es obligatoria";

    if (newErrors.email || newErrors.password) {
      console.log("❌ Datos inválidos, mostrar errores:", newErrors);   
      toast.error("Por favor, corrige los errores", {
        description: "Revisa los campos resaltados",
        duration: 3000
      });
      setErrors(newErrors);
      return;
    }

    if (Object.keys(newErrors).length === 0) {
      console.log("✅ Datos válidos, enviar login...");

      toast.success("Inicio de sesión exitoso", {
        description: "Redirigiendo al panel...",
        duration: 3000
      });
      // Aquí podrías hacer fetch, Firebase, etc.
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 relative">
      {/* Toggle Dark/Light */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
        aria-label="Cambiar tema"
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="w-full max-w-sm space-y-6 p-6 rounded-2xl shadow-xl border bg-card">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Iniciar sesión</h1>
          <p className="text-sm text-muted-foreground">Accedé a tu cuenta</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={errors.password ? "border-red-500" : ""}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
          </div>
          <Button className="w-full" type="submit">
            Ingresar
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          ¿No tenés cuenta? <a href="#" className="underline">Registrate</a>
        </p>
      </div>
    </main>
  );
}
