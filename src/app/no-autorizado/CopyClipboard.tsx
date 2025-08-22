"use client";

import { Copy } from "lucide-react";

export default function CopyClipboard({ textToCopy, label = "Copiar" }: {
  textToCopy: string;
  label?: string;
}) {
  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      // Fallback: descarga un txt si el clipboard falla
      const blob = new Blob([textToCopy], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "detalles.txt"; a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-lg border border-[#2f394d] px-3 py-1.5 text-xs hover:bg-[#2a3446]"
      title="Copiar detalles"
      type="button"
    >
      <Copy size={14} />
      {label}
    </button>
  );
}
