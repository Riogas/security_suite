"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  Loader2,
  Lock,
  LockOpen,
  ShieldBan,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState } from "react";
import { toast } from "sonner";
import { apiLoginUser } from "@/services/api";
import { useRouter } from "next/navigation";
import LogRocket from "logrocket";
import Image from "next/image";

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ usuario?: string; password?: string }>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [lockState, setLockState] = useState<
    "idle" | "locked" | "unlocked" | "denied"
  >("idle");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    const tag = "📥[Login]";
    console.log(`${tag} ▶️ Inicio de envío de formulario`);
    e.preventDefault();

    const newErrors: typeof errors = {};

    if (!usuario.trim()) newErrors.usuario = "El usuario es obligatorio";
    if (!password.trim()) newErrors.password = "La contraseña es obligatoria";

    if (Object.keys(newErrors).length > 0) {
      console.log(`${tag} ❌ Errores de validación:`, newErrors);
      toast.error("Por favor, corrige los errores", {
        description: "Revisa los campos resaltados",
        duration: 3000,
      });
      setErrors(newErrors);
      return;
    }

    try {
      console.log(`${tag} 🔐 Enviando credenciales...`);
      setLoading(true);
      setLockState("locked");

      const SISTEMA = "SecuritySuite";

      const response = await apiLoginUser({
        UserName: usuario,
        Password: password,
        Sistema: SISTEMA,
      });

      console.log(`${tag} ✅ Respuesta recibida:`, response);

      if (response.success) {
        console.log(`${tag} 🔓 Autenticación exitosa`);

        setLockState("unlocked");
        await new Promise((resolve) => setTimeout(resolve, 900));

        localStorage.setItem("user", JSON.stringify(response.user));
        if (response.token) {
          localStorage.setItem("token", response.token);
          console.log(`${tag} 🧾 Token almacenado en localStorage`);
        }

        const user = response.user;
        console.log(`${tag} 👤 Usuario identificado:`, user);

        LogRocket.identify(user?.email || "user-" + Date.now(), {
          name: user?.name?.trim() || usuario,
          email: user?.email?.trim() || usuario,
          role: user?.role?.trim() || "",
          loginTime: new Date().toISOString(),
        });

        LogRocket.track("Login Success", {
          email: user?.email?.trim() || usuario,
          role: user?.role?.trim() || "",
          timestamp: new Date().toISOString(),
        });

        toast.success("Inicio de sesión exitoso", {
          description: "Redirigiendo al panel...",
          duration: 2200,
        });

        console.log(`${tag} 🚀 Redirigiendo a /dashboard`);
        setTimeout(() => {
          router.push("/dashboard");
        }, 1200);
      } else {
        console.warn(`${tag} ⛔ Autenticación fallida:`, response?.message);
        setLockState("denied");
        await new Promise((resolve) => setTimeout(resolve, 1200));
        setLockState("idle");

        toast.error("Acceso denegado", {
          description: response?.message || "Usuario o contraseña incorrectos.",
          duration: 4000,
        });
      }
    } catch (error: any) {
      console.error(`${tag} 💥 Error en login:`, error);
      setLockState("idle");

      LogRocket.track("Login Failed", {
        email: usuario,
        error: error?.message || "Unknown error",
        timestamp: new Date().toISOString(),
      });

      toast.error("Login fallido", {
        description:
          error?.response?.data?.message || "Verifica tus credenciales.",
        duration: 4000,
      });
    } finally {
      setLoading(false);
      console.log(`${tag} 🧹 Finalizado proceso de login`);
    }
  };

  const renderLockModal = () =>
    (lockState === "locked" ||
      lockState === "unlocked" ||
      lockState === "denied") && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
        <div className="bg-card/90 rounded-2xl shadow-2xl p-8 flex flex-col items-center animate-fade-in">
          {lockState === "locked" && (
            <Lock className="w-16 h-16 text-red-400 animate-pulse mb-4" />
          )}
          {lockState === "unlocked" && (
            <LockOpen className="w-16 h-16 text-green-400 animate-bounce mb-4" />
          )}
          {lockState === "denied" && (
            <ShieldBan className="w-16 h-16 text-red-600 animate-shake mb-4" />
          )}
          <span className="text-lg font-semibold">
            {lockState === "locked"
              ? "Validando credenciales..."
              : lockState === "unlocked"
                ? "¡Acceso concedido!"
                : lockState === "denied"
                  ? "Acceso denegado"
                  : ""}
          </span>
        </div>
      </div>
    );

  return (
    <main className="min-h-screen flex items-center justify-center text-foreground px-4 relative">
      <div
        className="absolute inset-0 w-full h-full -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/fondosecure.png')" }}
      />
      <div className="absolute inset-0 w-full h-full -z-5 bg-black/30" />

      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
        aria-label="Cambiar tema"
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {renderLockModal()}

      <div
        className={
          lockState === "locked" || lockState === "unlocked"
            ? "pointer-events-none blur-sm select-none w-full max-w-sm p-6 rounded-2xl shadow-xl border bg-card/90 backdrop-blur-sm"
            : "w-full max-w-sm p-6 rounded-2xl shadow-xl border bg-card/90 backdrop-blur-sm transition-all duration-300"
        }
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={errors.password ? "border-red-500 pr-10" : "pr-10"}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
          </div>
          <Button
            type="submit"
            disabled={loading || lockState === "locked"}
            className="w-full relative overflow-hidden rounded-xl py-2 px-4 font-semibold text-white bg-gradient-to-r from-blue-900 to-slate-800 shadow-md transition-all duration-300 group"
          >
            <span className="relative z-10 flex items-center justify-center space-x-2">
              {loading && <Loader2 className="animate-spin w-4 h-4" />}
              <span>
                {lockState === "locked"
                  ? "Validando..."
                  : lockState === "unlocked"
                    ? "¡Acceso concedido!"
                    : "Ingresar"}
              </span>
            </span>

            {/* Efecto shimmer */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="absolute top-0 left-[-75%] w-[50%] h-full bg-gradient-to-r from-transparent via-white/25 to-transparent transform skew-x-[-20deg] animate-sweep" />
            </span>
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
