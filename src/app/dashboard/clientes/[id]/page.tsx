"use client";
import { useParams } from "next/navigation";
import ClienteForm from "@/components/clientes/ClienteForm";

export default function EditarClientePage() {
  const { id } = useParams();

  const clienteId = Array.isArray(id) ? id[0] : id;

  if (!clienteId) {
    return <p>Error: ID no proporcionado</p>;
  }

  return <ClienteForm clienteId={clienteId} />;
}
