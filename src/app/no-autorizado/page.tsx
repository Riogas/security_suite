// src/app/no-autorizado/page.tsx
import { LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { headers, cookies } from "next/headers";
import CopyClipboard from "./CopyClipboard";
import CurrentDateTime from "./CurrentDateTime";

type Search = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<Search> };

export default async function NoAutorizado({ searchParams }: PageProps) {
  const sp = await searchParams; // 👈 Next 15: hay que await
  const code = (sp.code as string) || "";
  const ruta = (sp.ruta as string) || "";
  const nombre = (sp.nombre as string) || "";

  const appId = process.env.NEXT_PUBLIC_APLICACION_ID || "0";
  const codeWithApp = `${appId}|${code}`;

  const h = await headers();
  const c = await cookies();
  const userName = h.get("x-user-name") ?? c.get("userName")?.value ?? "—";

  const adminEmail = "admin@tu-dominio.com";
  const asunto = encodeURIComponent("Solicitud de acceso a pantalla");
  const cuerpo = encodeURIComponent(
    `Hola,\n\nNecesito acceso a la siguiente pantalla:\n\n` +
      `Pantalla: ${nombre || ruta || "(desconocido)"}\n` +
      `Ruta: ${ruta || "(desconocido)"}\n` +
      `Código: ${codeWithApp}\n` +
      `Usuario: ${userName}\n\nGracias.`,
  );
  const mailto = `mailto:${adminEmail}?subject=${asunto}&body=${cuerpo}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#181f2a]">
      <div className="bg-[#232c3b] rounded-2xl shadow-xl p-10 max-w-lg w-full flex flex-col items-center">
        <LockKeyhole size={60} className="text-[#3b82f6] mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Acceso denegado</h1>
        <p className="text-gray-400 mb-6 text-center">
          No tienes permisos para acceder a esta sección.
          <br />
          Si crees que esto es un error, contacta al administrador.
        </p>

        <Image
          src="/no-access-dark.png"
          width={160}
          height={160}
          alt="No autorizado"
          className="mb-6 rounded-lg shadow"
        />

        {(code || ruta || nombre) && (
          <div className="w-full mb-6 rounded-xl border border-[#2f394d] bg-[#1b2433] p-4 text-sm text-gray-300">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-white">
                Detalles de esta pantalla
              </div>
              <CopyClipboard
                textToCopy={`Pantalla: ${nombre || ruta}\nRuta: ${ruta}\nCódigo: ${codeWithApp}\nUsuario: ${userName}`}
                label="Copiar"
              />
            </div>
            <div className="space-y-1">
              <div>
                <span className="text-gray-400">Pantalla:</span>{" "}
                <span className="font-medium text-white">
                  {nombre || ruta || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Ruta:</span>{" "}
                <code className="rounded bg-[#121826] px-1.5 py-0.5">
                  {ruta || "—"}
                </code>
              </div>
              <div>
                <span className="text-gray-400">Código:</span>{" "}
                <code className="rounded bg-[#121826] px-1.5 py-0.5">
                  {codeWithApp || "—"}
                </code>
              </div>
              <div>
                <span className="text-gray-400">Usuario:</span>{" "}
                <span className="font-medium text-white">{userName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Fecha y hora:</span>
                <CurrentDateTime />
              </div>
            </div>
          </div>
        )}

        <div className="flex w-full gap-3">
          <Link
            href="/"
            className="flex-1 px-5 py-2 rounded-lg bg-[#3b82f6] text-white font-semibold hover:bg-[#2563eb] transition text-center"
          >
            Volver al inicio
          </Link>
          <a
            href={mailto}
            className="flex-1 px-5 py-2 rounded-lg bg-[#374151] text-white font-semibold hover:bg-[#4b5563] transition text-center"
          >
            Solicitar acceso
          </a>
        </div>
      </div>
    </div>
  );
}
