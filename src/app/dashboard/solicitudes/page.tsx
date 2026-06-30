import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Solicitudes from "@/components/dashboard/solicitudes/Solicitudes";

export default function SolicitudesPage() {
  return (
    <div className="p-6">
      <PageHeader
        icon={Inbox}
        title="Solicitudes de acceso"
        description="Revisá y resolvé las solicitudes de permisos de los usuarios. Aprobar otorga el acceso directo a la funcionalidad elegida."
      />
      <Solicitudes />
    </div>
  );
}
