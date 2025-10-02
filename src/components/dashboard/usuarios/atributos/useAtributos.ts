"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  apiGetAtributos,
  apiABMAtributos,
  UserPreference,
} from "@/services/api";

interface CampoValor {
  id: string;
  valor: string;
}

interface Atributo {
  id: string;
  descripcion: string;
  campos: CampoValor[];
  valor: string; // JSON generado
}

export function useAtributos(userId: number, isOpen: boolean) {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [descripcionAtributo, setDescripcionAtributo] = useState("");
  const [camposActuales, setCamposActuales] = useState<CampoValor[]>([]);
  const [nuevoCampo, setNuevoCampo] = useState({ id: "", valor: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Generar JSON a partir de los campos
  const generarJsonValor = (campos: CampoValor[]): string => {
    const obj = campos.reduce(
      (acc, campo) => {
        if (campo.id && campo.valor) {
          acc[campo.id] = campo.valor;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    return JSON.stringify(obj, null, 2);
  };

  // Cargar atributos existentes del usuario
  const cargarAtributos = async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const atributosExistentes = await apiGetAtributos();

      if (atributosExistentes.length > 0) {
        // Convertir UserPreference[] a Atributo[]
        // Agrupar por UserPreferenceAtributo (descripción)
        const atributosAgrupados = atributosExistentes.reduce(
          (acc, pref) => {
            const key = pref.UserPreferenceAtributo;
            if (!acc[key]) {
              acc[key] = {
                id: pref.UserPreferenceId.toString(),
                descripcion: pref.UserPreferenceAtributo,
                campos: [],
                valor: "",
              };
            }

            // Parsear el valor JSON si es posible
            try {
              const valorParseado = JSON.parse(pref.UserPreferenceValor);
              if (typeof valorParseado === "object" && valorParseado !== null) {
                acc[key].campos = Object.entries(valorParseado).map(
                  ([id, valor]) => ({
                    id,
                    valor: String(valor),
                  }),
                );
                acc[key].valor = JSON.stringify(valorParseado, null, 2);
              } else {
                // Si no es un objeto JSON válido, tratar como campo simple
                acc[key].campos = [
                  { id: "valor", valor: pref.UserPreferenceValor },
                ];
                acc[key].valor = JSON.stringify(
                  { valor: pref.UserPreferenceValor },
                  null,
                  2,
                );
              }
            } catch {
              // Si no se puede parsear como JSON, tratar como texto simple
              acc[key].campos = [
                { id: "valor", valor: pref.UserPreferenceValor },
              ];
              acc[key].valor = JSON.stringify(
                { valor: pref.UserPreferenceValor },
                null,
                2,
              );
            }

            return acc;
          },
          {} as Record<string, Atributo>,
        );

        setAtributos(Object.values(atributosAgrupados));
      }
    } catch (error) {
      console.error("Error al cargar atributos:", error);
      toast.error("Error al cargar los atributos del usuario");
    } finally {
      setLoading(false);
    }
  };

  // Crear nuevo atributo
  const crearAtributo = () => {
    if (!descripcionAtributo.trim()) {
      toast.error("Por favor ingresa una descripción para el atributo");
      return;
    }

    if (camposActuales.length === 0) {
      toast.error("Agrega al menos un campo ID-Valor");
      return;
    }

    const nuevoAtributo: Atributo = {
      id: Date.now().toString(),
      descripcion: descripcionAtributo.trim(),
      campos: [...camposActuales],
      valor: generarJsonValor(camposActuales),
    };

    setAtributos((prev) => [...prev, nuevoAtributo]);

    // Limpiar formulario
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });

    toast.success(`Atributo "${nuevoAtributo.descripcion}" creado`);
  };

  // Eliminar atributo
  const eliminarAtributo = (id: string) => {
    setAtributos((prev) => prev.filter((attr) => attr.id !== id));
    toast.success("Atributo eliminado");
  };

  // Guardar todos los atributos
  const guardarAtributos = async () => {
    try {
      setSaving(true);

      console.log("Guardando atributos para usuario:", userId);
      console.log("Atributos:", atributos);

      // Convertir atributos a formato UserPreference[]
      const userPreferences: UserPreference[] = atributos.map(
        (atributo, index) => ({
          UserPreferenceId: 0, // Siempre enviar 0 para nuevos atributos
          UserExtendedId: userId,
          UserPreferenceAtributo: atributo.descripcion,
          UserPreferenceValor: atributo.valor,
        }),
      );

      // Crear el payload con el nuevo formato
      const payload = {
        sdtAtributos: userPreferences,
        UserId: userId,
      };

      console.log("Payload para API:", payload);

      await apiABMAtributos(payload);

      toast.success("Atributos guardados correctamente");
      return true;
    } catch (error) {
      console.error("Error guardando atributos:", error);
      toast.error("Error al guardar atributos");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Limpiar estado al cerrar
  const limpiarEstado = () => {
    setAtributos([]);
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // useEffect para cargar atributos cuando se abre el modal
  useEffect(() => {
    cargarAtributos();
  }, [isOpen]);

  return {
    // Estado
    atributos,
    descripcionAtributo,
    setDescripcionAtributo,
    camposActuales,
    setCamposActuales,
    nuevoCampo,
    setNuevoCampo,
    saving,
    loading,

    // Funciones
    crearAtributo,
    eliminarAtributo,
    guardarAtributos,
    limpiarEstado,
  };
}
