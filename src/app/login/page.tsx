"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Loader2, Lock, LockOpen } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState } from "react";
import { toast } from "sonner";
import { apiLogin } from "@/services/api";
import { useRouter } from "next/navigation";
import LogRocket from 'logrocket';
import * as Sentry from '@sentry/nextjs';
import Image from "next/image";

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ usuario?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [lockState, setLockState] = useState<"idle" | "locked" | "unlocked">("idle");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!usuario.trim()) newErrors.usuario = "El usuario es obligatorio";
    if (!password.trim()) newErrors.password = "La contraseña es obligatoria";

    if (newErrors.usuario || newErrors.password) {
      toast.error("Por favor, corrige los errores", {
        description: "Revisa los campos resaltados",
        duration: 3000,
      });
      setErrors(newErrors);
      return;
    }

    if (Object.keys(newErrors).length === 0) {
      try {
        setLoading(true);
        setLockState("locked"); // Mostrar candado cerrado

        const res = await apiLogin(usuario, password);
        const response = res as { data: any };
        setLockState("unlocked"); // Mostrar candado abierto

        await new Promise(resolve => setTimeout(resolve, 900)); // animación

        // Guardar datos de sesión (ajusta esto según tu backend)
        localStorage.setItem("user", JSON.stringify(response.data.user));
        const puestoDefault = { puestoId: 4, PuestoDsc: "SALTO" };
        localStorage.setItem("puesto", JSON.stringify(puestoDefault));
        document.cookie = `puestoId=4; path=/; max-age=${60 * 60 * 24 * 30}`;
        document.cookie = `PuestoDsc=SALTO; path=/; max-age=${60 * 60 * 24 * 30}`;

        // 🎯 LogRocket identificación
        const user = response.data.user;
        LogRocket.identify(user.email || 'user-' + Date.now(), {
          name: user.name,
          email: user.email,
          role: user.role,
          loginTime: new Date().toISOString(),
        });

        LogRocket.track('Login Success', {
          email: user.email,
          role: user.role,
          timestamp: new Date().toISOString()
        });

        toast.success("Inicio de sesión exitoso", {
          description: "Redirigiendo al panel...",
          duration: 2200,
        });

        setTimeout(() => {
          router.push("/dashboard");
        }, 1200);
      } catch (error: any) {
        setLockState("idle");
        LogRocket.track('Login Failed', {
          email: usuario,
          error: error?.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });

        toast.error("Login fallido", {
          description: error?.response?.data?.message || "Verifica tus credenciales.",
          duration: 4000,
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // Modal de candado animado
  const renderLockModal = () => (
    (lockState === "locked" || lockState === "unlocked") && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
        <div className="bg-card/90 rounded-2xl shadow-2xl p-8 flex flex-col items-center animate-fade-in">
          {lockState === "locked" && (
            <Lock className="w-16 h-16 text-red-400 animate-pulse mb-4" />
          )}
          {lockState === "unlocked" && (
            <LockOpen className="w-16 h-16 text-green-400 animate-bounce mb-4" />
          )}
          <span className="text-lg font-semibold">
            {lockState === "locked" ? "Validando credenciales..." : "¡Acceso concedido!"}
          </span>
        </div>
      </div>
    )
  );

  return (
    <main className="min-h-screen flex items-center justify-center text-foreground px-4 relative">
      {/* Imagen de fondo */}
      <div
        className="absolute inset-0 w-full h-full -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/fondosecure.png')" }}
      />
      {/* Overlay para mejorar legibilidad */}
      <div className="absolute inset-0 w-full h-full -z-5 bg-black/30" />

      {/* Toggle Dark/Light */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
        aria-label="Cambiar tema"
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {renderLockModal()}

      {/* Card principal */}
      <div className={(lockState === "locked" || lockState === "unlocked")
        ? "pointer-events-none blur-sm select-none w-full max-w-sm p-6 rounded-2xl shadow-xl border bg-card/90 backdrop-blur-sm"
        : "w-full max-w-sm p-6 rounded-2xl shadow-xl border bg-card/90 backdrop-blur-sm transition-all duration-300"}
      >
        <div className="text-center mb-6">
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt="Logo"
              width={350}
              height={350}
              className="object-contain"
              priority
            />
          </div>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="usuario">Usuario</Label>
            <Input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="nombre de usuario"
              className={errors.usuario ? "border-red-500" : ""}
              disabled={loading}
            />
            {errors.usuario && (
              <p className="text-sm text-red-500">{errors.usuario}</p>
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
              disabled={loading}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
          </div>
          <Button className="w-full transition-all duration-300" type="submit" disabled={loading || lockState === "locked"}>
            <div className="flex items-center justify-center">
              {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
              <span>
                {lockState === "locked"
                  ? "Validando..."
                  : lockState === "unlocked"
                  ? "¡Acceso concedido!"
                  : "Ingresar"}
              </span>
            </div>
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-2">
          ¿Has olvidado la contraseña?{" "}
          <a href="#" className="underline">
            Recuperar contraseña
          </a>
        </p>
      </div>
    </main>
  );
}
