"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RoleForm, { RolFormState, FuncionalidadItem } from "./RoleForm";
import {
  apiRolDBById,
  apiAbmRoles,
  AbmRolesReq,
  dualWriteFireForget,
} from "@/services/api";

interface EditRoleFormProps {
  rolId: string;
}

export default function EditRoleForm({ rolId }: EditRoleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<
    Partial<RolFormState> | undefined
  >(undefined);
  const [initialFuncionalidades, setInitialFuncionalidades] = useState<
    FuncionalidadItem[]
  >([]);

  useEffect(() => {
    const cargarRol = async () => {
      try {
        setLoading(true);
        console.log("Cargando rol con ID (Prisma):", rolId);

        // Read rol from PostgreSQL via Prisma — replaces previous GeneXus apiObtenerRol call
        const response = await apiRolDBById(parseInt(rolId));
        const rolData = response?.rol;

        if (!rolData) {
          throw new Error("Rol no encontrado en la base de datos");
        }

        console.log("Datos del rol cargados (Prisma):", rolData);

        // Map Prisma fields to RolFormState shape
        const mappedData: Partial<RolFormState> = {
          rolid: String(rolData.id),
          rolnombre: rolData.nombre || "",
          roldescripcion: rolData.descripcion || "",
          rolestado: (rolData.estado === "A" ? "A" : "I") as "A" | "I",
          rolnivel: rolData.nivel ?? 0,
          rolfchins: rolData.fechaCreacion || new Date().toISOString(),
          aplicacionid: String(rolData.aplicacionId || rolData.aplicacion?.id || "2"),
          rolcreadoen: rolData.creadoEn || "Security Suite",
        };

        console.log("Datos mapeados para el formulario:", mappedData);
        setInitialData(mappedData);

        // Map Prisma funcionalidades to FuncionalidadItem shape
        // Prisma: funcionalidades[{funcionalidadId, funcionalidad:{id, nombre, estado}}]
        if (rolData.funcionalidades && Array.isArray(rolData.funcionalidades)) {
          const funcionalidadesAsignadas: FuncionalidadItem[] =
            rolData.funcionalidades.map((rf: any) => ({
              id: String(rf.funcionalidadId ?? rf.funcionalidad?.id),
              nombre: rf.funcionalidad?.nombre || `Funcionalidad ${rf.funcionalidadId}`,
              descripcion: "",
              objetosCount: 0,
              accionesCount: 0,
            }));
          setInitialFuncionalidades(funcionalidadesAsignadas);
          console.log("Funcionalidades asignadas (Prisma):", funcionalidadesAsignadas);
        }
      } catch (error) {
        console.error("Error cargando rol:", error);
        toast.error("Error al cargar los datos del rol");
        router.push("/dashboard/roles");
      } finally {
        setLoading(false);
      }
    };

    if (rolId && rolId !== "undefined") {
      cargarRol();
    } else {
      console.error("ID de rol inválido:", rolId);
      toast.error("ID de rol inválido");
      router.push("/dashboard/roles");
    }
  }, [rolId, router]);

  /**
   * handleSubmit is called AFTER RoleForm has saved successfully to PostgreSQL.
   * We perform a fire-and-forget dual-write to GeneXus (non-blocking).
   */
  const handleSubmit = async (data: RolFormState, funcionalidades: FuncionalidadItem[]) => {
    const rolIdNum = parseInt(data.rolid);

    const gxPayload: AbmRolesReq = {
      RolId: rolIdNum,
      RolNombre: data.rolnombre,
      RolDescripcion: data.roldescripcion,
      RolEstado: data.rolestado,
      RolNivel: data.rolnivel,
      RolFchIns: data.rolfchins,
      AplicacionId: parseInt(data.aplicacionid),
      RolCreadoEn: data.rolcreadoen,
      Funcionalidad: funcionalidades.map((f) => ({
        FuncionalidadId: parseInt(f.id),
        RolFuncionalidadFchIns: new Date().toISOString(),
      })),
    };

    // Dual-write to GeneXus: fire-and-forget, does not block navigation
    dualWriteFireForget(`rol:gx:update:${rolIdNum}`, () => apiAbmRoles(gxPayload));

    toast.success("Rol actualizado correctamente");
    router.push("/dashboard/roles");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando datos del rol...</p>
        </div>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-500">Error al cargar los datos del rol</p>
          <button
            onClick={() => router.push("/dashboard/roles")}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Volver a roles
          </button>
        </div>
      </div>
    );
  }

  return (
    <RoleForm
      initialData={initialData}
      initialFuncionalidades={initialFuncionalidades}
      onSubmit={handleSubmit}
    />
  );
}
