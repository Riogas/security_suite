"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Loader2 } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { useState } from "react";
import { toast } from "sonner"; // 👈 Notificaciones visuales
import { apiLogin } from "@/services/api"; // 👈 Importa tu API
import { useRouter } from "next/navigation"; // 👈 Para redirección
import LogRocket from 'logrocket'; // 👈 Para identificar usuario
import * as Sentry from '@sentry/nextjs'; // 👈 Para testing de errores

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!email.trim()) newErrors.email = "El email es obligatorio";
    else if (!validateEmail(email))
      newErrors.email = "Formato de email inválido";

    if (!password.trim()) newErrors.password = "La contraseña es obligatoria";

    if (newErrors.email || newErrors.password) {
      console.log("❌ Datos inválidos, mostrar errores:", newErrors);
      toast.error("Por favor, corrige los errores", {
        description: "Revisa los campos resaltados",
        duration: 3000,
      });
      setErrors(newErrors);
      return;
    }

    if (Object.keys(newErrors).length === 0) {
      try {
        setLoading(true); // 👈 Esto activa la animación

        const res = await apiLogin(email, password); // 👈 Llamada real a la API
        // Asume que la respuesta tiene la forma { data: any }
        const response = res as { data: any };
        console.log("✅ Login exitoso:", response.data);

        // Guardar datos de sesión
        localStorage.setItem("user", JSON.stringify(response.data.user));

        // 🎯 Identificar usuario en LogRocket
        const user = response.data.user;
        LogRocket.identify(user.email || 'user-' + Date.now(), {
          name: user.name,
          email: user.email,
          role: user.role,
          // Añadir cualquier otra propiedad útil
          loginTime: new Date().toISOString(),
        });

        // 📊 Registrar evento de login exitoso
        LogRocket.track('Login Success', {
          email: user.email,
          role: user.role,
          timestamp: new Date().toISOString()
        });

        console.log('👤 Usuario identificado en LogRocket:', user.name, user.email);

        toast.success("Inicio de sesión exitoso", {
          description: "Redirigiendo al panel...",
          duration: 3000,
        });

        // Aquí podrías guardar el token y redirigir, por ejemplo:
        // localStorage.setItem("token", response.data.token);
        // router.push("/dashboard");
        router.push("/dashboard");
      } catch (error: any) {
        console.error("❌ Error al iniciar sesión:", error);

        // 📊 Registrar intento de login fallido
        LogRocket.track('Login Failed', {
          email: email,
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });

        toast.error("Login fallido", {
          description:
            error.response?.data?.message || "Verifica tus credenciales.",
          duration: 4000,
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // 🧪 Función de prueba para Sentry
  const testSentryError = () => {
    console.log('🧪 Generando error de prueba para Sentry...');
    Sentry.captureException(new Error('Error de prueba desde Login Page'));
    throw new Error('Error de prueba manual');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 relative">
      {/* SVG decorativo de fondo */}
      <svg
        className="absolute inset-0 w-full h-full -z-10 opacity-25 blur-2xl"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        viewBox="0 0 1200 1200"
        fill="none"
      >
        <path
          d="M1200 0L1091.7 100C983.3 200 766.7 400 550 400C333.3 400 116.7 200 8.333 100L0 0V1200H1200V0Z"
          fill="url(#gradient)"
        />
        <defs>
          <linearGradient
            id="gradient"
            x1="0"
            y1="0"
            x2="1200"
            y2="1200"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4f46e5" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
      </svg>

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
          <Button className="w-full" type="submit" disabled={loading}>
            {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          ¿Has olvidado la contraseña?{" "}
          <a href="#" className="underline">
            Recuperar contraseña
          </a>
        </p>
        
        {/* 🧪 Botón de prueba temporal para Sentry */}
        {process.env.NODE_ENV === "development" && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={testSentryError}
            className="w-full mt-2 text-xs"
          >
            🧪 Test Sentry Error
          </Button>
        )}
      </div>
    </main>
  );
}
