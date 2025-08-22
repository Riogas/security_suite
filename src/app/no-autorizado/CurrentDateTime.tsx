"use client";

export default function CurrentDateTime() {
  // capturamos la fecha/hora actual al montar el componente
  const now = new Date();

  const text = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);

  return <span className="text-gray-300">{text}</span>;
}
