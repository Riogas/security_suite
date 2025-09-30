"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import RoleForm, { RolFormState, FuncionalidadItem } from "./RoleForm";
import { apiObtenerRol, apiAbmRoles, AbmRolesReq, ObtenerRolResp } from "@/services/api";

interface EditRoleFormProps {
  rolId: string;
}

export default function EditRoleForm({ rolId }: EditRoleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<Partial<RolFormState> | undefined>(undefined);
  const [initialFuncionalidades, setInitialFuncionalidades] = useState<FuncionalidadItem[]>([]);

  useEffect(() => {
    const cargarRol = async () => {
      try {
        setLoading(true);
        console.log('Cargando rol con ID:', rolId);
        
        // Llamar a la API para obtener los datos del rol
        const rolData: ObtenerRolResp = await apiObtenerRol({ RolId: parseInt(rolId) });
        console.log('Datos del rol cargados:', rolData);
        
        // Mapear los datos de la API al formato del formulario
        const mappedData: Partial<RolFormState> = {
          rolid: rolData.RolId || "",
          rolnombre: rolData.RolNombre || "",
          roldescripcion: rolData.RolDescripcion || "",
          rolestado: (rolData.RolEstado === "A" ? "A" : "I") as "A" | "I",
          rolnivel: parseInt(rolData.RolNivel || "0"),
          rolfchins: rolData.RolFchIns || new Date().toISOString(),
          aplicacionid: rolData.AplicacionId || "2",
          rolcreadoen: rolData.RolCreadoEn || "Security Suite",
        };
        
        console.log('Datos mapeados para el formulario:', mappedData);
        setInitialData(mappedData);

        // Extraer funcionalidades asignadas y convertirlas a FuncionalidadItem
        if (rolData.Funcionalidad && Array.isArray(rolData.Funcionalidad)) {
          const funcionalidadesAsignadas: FuncionalidadItem[] = rolData.Funcionalidad.map(func => ({
            id: func.FuncionalidadId.toString(),
            nombre: `Funcionalidad ${func.FuncionalidadId}`, // Temporal, debería venir de otra API
            descripcion: "", // No disponible en la respuesta actual
            objetosCount: 0, // No disponible en la respuesta actual
            accionesCount: 0, // No disponible en la respuesta actual
          }));
          setInitialFuncionalidades(funcionalidadesAsignadas);
          console.log('Funcionalidades asignadas:', funcionalidadesAsignadas);
        }
        
      } catch (error) {
        console.error('Error cargando rol:', error);
        toast.error('Error al cargar los datos del rol');
        router.push('/dashboard/roles');
      } finally {
        setLoading(false);
      }
    };

    if (rolId && rolId !== 'undefined') {
      cargarRol();
    } else {
      console.error('ID de rol inválido:', rolId);
      toast.error('ID de rol inválido');
      router.push('/dashboard/roles');
    }
  }, [rolId, router]);

  const handleSubmit = async (data: RolFormState) => {
    try {
      console.log('Actualizando rol:', data);
      
      const payload: AbmRolesReq = {
        RolId: parseInt(data.rolid),
        RolNombre: data.rolnombre,
        RolDescripcion: data.roldescripcion,
        RolEstado: data.rolestado,
        RolNivel: data.rolnivel,
        RolFchIns: data.rolfchins,
        AplicacionId: parseInt(data.aplicacionid),
        RolCreadoEn: data.rolcreadoen,
        Funcionalidad: [], // TODO: Integrar funcionalidades seleccionadas
      };
      
      console.log('Payload para actualizar rol:', payload);
      
      const response = await apiAbmRoles(payload);
      console.log('Respuesta de actualización:', response);
      
      if (response.success !== false) {
        toast.success('Rol actualizado correctamente');
        router.push('/dashboard/roles');
      } else {
        toast.error(response.message || 'Error al actualizar el rol');
      }
    } catch (error) {
      console.error('Error actualizando rol:', error);
      toast.error('Error al actualizar el rol');
    }
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
            onClick={() => router.push('/dashboard/roles')}
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