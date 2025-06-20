import { useParams } from "next/navigation";
import ClienteForm from "@/components/clientes/ClienteForm";

export default function EditarClientePage() {
  const { id } = useParams();
  return <ClienteForm clienteId={id} />;
}
