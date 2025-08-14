// src/app/no-autorizado/page.tsx
"use client";

import { LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function NoAutorizado() {
  const router = useRouter();

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
        <button
          onClick={() => router.back()}
          className="mt-2 px-5 py-2 rounded-lg bg-[#3b82f6] text-white font-semibold hover:bg-[#2563eb] transition"
        >
          Volver
        </button>
      </div>
    </div>
  );
}
