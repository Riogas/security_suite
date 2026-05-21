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
  Shield,
  Users,
  User,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { apiLoginUser } from "@/services/api";
import { useRouter } from "next/navigation";
import LogRocket from "logrocket";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

const FEATURES = [
  "RBAC granular",
  "Auditoría centralizada",
  "Single sign-on integrado",
];

const FLOATING_ICONS = [
  { Icon: Shield, top: "15%", left: "10%", rotate: -12 },
  { Icon: Users, top: "55%", left: "75%", rotate: 8 },
  { Icon: Lock, top: "75%", left: "20%", rotate: -6 },
];

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
  const [loginError, setLoginError] = useState<string | null>(null);
  const usuarioRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  // Auto-focus username when login error is set
  useEffect(() => {
    if (loginError && usuarioRef.current) {
      usuarioRef.current.focus();
    }
  }, [loginError]);


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

    setLoginError(null);

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

        const errorMsg =
          response?.message || "Usuario o contraseña incorrectos.";
        setLoginError(errorMsg);

        toast.error("Acceso denegado", {
          description: errorMsg,
          duration: 4000,
        });
      }
    } catch (error: unknown) {
      console.error(`${tag} 💥 Error en login:`, error);
      setLockState("idle");

      LogRocket.track("Login Failed", {
        email: usuario,
        error: (error as Error)?.message || "Unknown error",
        timestamp: new Date().toISOString(),
      });

      const errorMsg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Verifica tus credenciales.";
      setLoginError(errorMsg);

      toast.error("Login fallido", {
        description: errorMsg,
        duration: 4000,
      });
    } finally {
      setLoading(false);
      console.log(`${tag} 🧹 Finalizado proceso de login`);
    }
  };

  // Lock animation modal — PRESERVED INTACT (component identity)
  const renderLockModal = () =>
    (lockState === "locked" ||
      lockState === "unlocked" ||
      lockState === "denied") && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
        <div className="bg-card/90 rounded-2xl shadow-2xl p-8 flex flex-col items-center animate-fade-in">
          {lockState === "locked" && (
            <Lock className="w-16 h-16 text-destructive animate-pulse mb-4" />
          )}
          {lockState === "unlocked" && (
            <LockOpen className="w-16 h-16 text-green-400 animate-bounce mb-4" />
          )}
          {lockState === "denied" && (
            <ShieldBan className="w-16 h-16 text-destructive animate-shake mb-4" />
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
    <main className="min-h-screen flex relative overflow-hidden bg-background">
      {/* Lock modal — identity animation preserved */}
      {renderLockModal()}

      {/* ── Left decorative panel (desktop only) ── */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between overflow-hidden"
        {...(shouldReduceMotion
          ? {}
          : {
              initial: { opacity: 0, x: -24 },
              animate: { opacity: 1, x: 0 },
              transition: { duration: 0.45 },
            })}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-background" />

        {/* Decorative blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/8 blur-3xl opacity-60" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full bg-primary/6 blur-3xl opacity-40" />

        {/* Floating icons */}
        {FLOATING_ICONS.map(({ Icon, top, left, rotate }, i) => (
          <motion.div
            key={i}
            className="absolute text-primary"
            style={{ top, left, rotate: `${rotate}deg` }}
            {...(shouldReduceMotion
              ? {}
              : {
                  initial: { opacity: 0, scale: 0.8 },
                  animate: { opacity: 0.15, scale: 1 },
                  transition: { duration: 0.6, delay: 0.2 + i * 0.1 },
                })}
          >
            <Icon className="w-20 h-20" />
          </motion.div>
        ))}

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <motion.div
            {...(shouldReduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: -12 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.4, delay: 0.1 },
                })}
          >
            <Image
              src="/logo.png"
              alt="Security Suite"
              width={220}
              height={70}
              className="object-contain"
              priority
            />
          </motion.div>

          {/* Slogan */}
          <motion.p
            className="mt-4 text-lg text-muted-foreground max-w-md"
            {...(shouldReduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.4, delay: 0.18 },
                })}
          >
            Gestión de accesos y permisos para RíoGas
          </motion.p>

          {/* Features list */}
          <div className="mt-12 space-y-4">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature}
                className="flex items-center gap-3"
                {...(shouldReduceMotion
                  ? {}
                  : {
                      initial: { opacity: 0, x: -16 },
                      animate: { opacity: 1, x: 0 },
                      transition: { duration: 0.35, delay: 0.3 + i * 0.08 },
                    })}
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground/80">
                  {feature}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer */}
          <motion.p
            className="text-xs text-muted-foreground"
            {...(shouldReduceMotion
              ? {}
              : {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: { duration: 0.4, delay: 0.55 },
                })}
          >
            © 2026 RíoGas
          </motion.p>
        </div>
      </motion.div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center min-h-screen px-6 py-12 relative">
        {/* Mobile background gradient (replaces fondosecure.png on mobile) */}
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-primary/8 via-background to-background" />

        <motion.div
          className="relative z-10 w-full max-w-md"
          {...(shouldReduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.4, delay: 0.1 },
              })}
        >
          {/* Mobile logo + slogan (hidden on desktop) */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <Image
              src="/logo.png"
              alt="Security Suite"
              width={180}
              height={56}
              className="object-contain mb-3"
              priority
            />
            <p className="text-sm text-muted-foreground text-center">
              Gestión de accesos y permisos para RíoGas
            </p>
          </div>

          {/* Form card */}
          <div
            className={
              lockState === "locked" || lockState === "unlocked"
                ? "pointer-events-none blur-sm select-none bg-card/90 backdrop-blur-sm border rounded-2xl shadow-xl p-8"
                : "bg-card/90 backdrop-blur-sm border rounded-2xl shadow-xl p-8 transition-all duration-300"
            }
          >
            {/* Form header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Bienvenido de nuevo
              </h1>
              <p className="text-base text-muted-foreground mt-2">
                Ingresá tus credenciales para continuar
              </p>
            </div>

            {/* Inline error banner */}
            {loginError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Username field */}
              <div className="space-y-2">
                <Label htmlFor="usuario" className="text-sm font-medium">
                  Usuario
                </Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors duration-200" />
                  <Input
                    ref={usuarioRef}
                    id="usuario"
                    type="text"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    placeholder="nombre de usuario"
                    autoComplete="username"
                    className={`h-12 text-base pl-11 ${errors.usuario ? "border-destructive" : ""}`}
                    aria-invalid={!!errors.usuario}
                    aria-describedby={
                      errors.usuario ? "usuario-error" : undefined
                    }
                    disabled={loading}
                  />
                </div>
                {errors.usuario && (
                  <p
                    id="usuario-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.usuario}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors duration-200" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`h-12 text-base pl-11 pr-12 ${errors.password ? "border-destructive" : ""}`}
                    aria-invalid={!!errors.password}
                    aria-describedby={
                      errors.password ? "password-login-error" : undefined
                    }
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    <span className="transition-opacity duration-150">
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </span>
                  </button>
                </div>
                {errors.password && (
                  <p
                    id="password-login-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                disabled={loading || lockState === "locked"}
                className="w-full h-12 text-base font-semibold relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg group mt-2"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="animate-spin w-4 h-4" />}
                  <span>
                    {loading
                      ? "Ingresando..."
                      : lockState === "unlocked"
                        ? "¡Acceso concedido!"
                        : "Ingresar"}
                  </span>
                </span>

                {/* Shimmer effect */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="absolute top-0 left-[-75%] w-[50%] h-full bg-gradient-to-r from-transparent via-white/25 to-transparent transform skew-x-[-20deg] animate-sweep" />
                </span>
              </Button>
            </form>

            {/* Form footer */}
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                ¿Olvidaste tu contraseña?{" "}
                <a
                  href="#"
                  className="underline hover:text-foreground transition-colors"
                >
                  Recuperar
                </a>
              </p>
              <button
                onClick={toggleTheme}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cambiar tema"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
