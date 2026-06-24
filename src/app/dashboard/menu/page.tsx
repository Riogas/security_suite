import { FolderTree } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import MenuBuilder from "@/components/dashboard/menu/MenuBuilder";

export default function MenuPage() {
  return (
    <div className="p-6">
      <PageHeader
        icon={FolderTree}
        title="Constructor de menú"
        description="Armá la estructura de navegación: grupos, submenús y páginas. Cada punto puede referenciar una página o feature del catálogo de Objetos."
      />
      <MenuBuilder />
    </div>
  );
}
