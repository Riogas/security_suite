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

  // 🔍 DEBUG: Rastrear cambios de loading
  console.log("🎣 [useAtributos] Estados:", {
    userId,
    isOpen,
    loading,
    saving,
    atributosCount: atributos.length,
  });

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

  // Parsear valor de atributo (puede venir como "{16: Rivera}" o JSON válido)
  const parsearValorAtributo = (valor: string): CampoValor[] => {
    try {
      // Intentar parsear como JSON estándar
      const valorParseado = JSON.parse(valor);
      if (typeof valorParseado === "object" && valorParseado !== null) {
        return Object.entries(valorParseado).map(([id, val]) => ({
          id,
          valor: String(val),
        }));
      }
    } catch {
      // Si falla el parse estándar, intentar parsear formato "{16: Rivera}"
      try {
        // Remover llaves externas y separar por comas
        const contenido = valor.replace(/^\{|\}$/g, "").trim();
        const pares = contenido.split(",").map((par) => par.trim());

        const campos: CampoValor[] = [];
        for (const par of pares) {
          const [id, ...valorParts] = par.split(":");
          if (id && valorParts.length > 0) {
            campos.push({
              id: id.trim(),
              valor: valorParts.join(":").trim(),
            });
          }
        }

        if (campos.length > 0) {
          return campos;
        }
      } catch (e) {
        console.log("Error parseando formato alternativo:", e);
      }
    }

    // Si todo falla, retornar como campo simple
    return [{ id: "valor", valor: valor }];
  };

  // Cargar atributos existentes del usuario
  const cargarAtributos = async () => {
    if (!isOpen) {
      console.log("🎣 [useAtributos] cargarAtributos: Modal cerrado, no cargar");
      return;
    }

    console.log("🎣 [useAtributos] ⏳ Iniciando carga de atributos - setLoading(true)");
    setLoading(true);
    try {
      const atributosExistentes = await apiGetAtributos(userId);
      console.log("Atributos recibidos de la API:", atributosExistentes);

      if (atributosExistentes.length > 0) {
        // Convertir cada UserPreference a Atributo
        const atributosConvertidos = atributosExistentes.map((pref) => {
          const campos = parsearValorAtributo(pref.UserPreferenceValor);
          console.log(`Procesando atributo "${pref.UserPreferenceAtributo}":`, {
            valor: pref.UserPreferenceValor,
            camposParseados: campos,
          });

          return {
            id: pref.UserPreferenceId.toString(),
            descripcion: pref.UserPreferenceAtributo,
            campos: campos,
            valor: pref.UserPreferenceValor, // Mantener el valor original
          };
        });

        console.log("Atributos convertidos:", atributosConvertidos);
        setAtributos(atributosConvertidos);
      } else {
        console.log("No hay atributos existentes");
        setAtributos([]);
      }
    } catch (error) {
      console.error("🎣 [useAtributos] ❌ Error al cargar atributos:", error);
      toast.error("Error al cargar los atributos del usuario");
    } finally {
      console.log("🎣 [useAtributos] ✅ Carga completada - setLoading(false)");
      setLoading(false);
    }
  };

  // Crear nuevo atributo (se agrega a los existentes cargados de BD)
  const crearAtributo = () => {
    if (!descripcionAtributo.trim()) {
      toast.error("Por favor ingresa una descripción para el atributo");
      return;
    }

    if (camposActuales.length === 0) {
      toast.error("Agrega al menos un campo ID-Valor");
      return;
    }

    const valorJson = generarJsonValor(camposActuales);

    const nuevoAtributo: Atributo = {
      id: `nuevo-${Date.now()}`, // ID temporal para nuevos atributos
      descripcion: descripcionAtributo.trim(),
      campos: [...camposActuales],
      valor: valorJson,
    };

    // Agregar al array existente (que incluye los de BD + los nuevos locales)
    setAtributos((prev) => [...prev, nuevoAtributo]);

    // Limpiar formulario
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });

    toast.success(`Atributo "${nuevoAtributo.descripcion}" creado localmente`);
  };

  // Eliminar atributo
  const eliminarAtributo = (id: string) => {
    setAtributos((prev) => prev.filter((attr) => attr.id !== id));
    toast.success("Atributo eliminado");
  };

  // Guardar todos los atributos (solo guarda los nuevos creados localmente)
  const guardarAtributos = async () => {
    try {
      setSaving(true);

      console.log("Guardando atributos para usuario:", userId);
      console.log("Atributos totales:", atributos);

      // Filtrar solo los atributos nuevos (con ID que empieza con "nuevo-")
      const atributosNuevos = atributos.filter((attr) =>
        attr.id.startsWith("nuevo-"),
      );

      if (atributosNuevos.length === 0) {
        toast.info("No hay atributos nuevos para guardar");
        return true;
      }

      console.log("Atributos nuevos a guardar:", atributosNuevos);

      // Convertir atributos nuevos a formato UserPreference[]
      const userPreferences: UserPreference[] = atributosNuevos.map(
        (atributo) => ({
          UserPreferenceId: 0, // 0 para nuevos atributos
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

      toast.success(
        `${atributosNuevos.length} atributo(s) guardado(s) correctamente`,
      );

      // Recargar atributos desde la BD para obtener los IDs reales
      await cargarAtributos();

      return true;
    } catch (error) {
      console.error("Error guardando atributos:", error);
      toast.error("Error al guardar atributos");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Limpiar estado al cerrar (solo limpia el formulario, no los atributos)
  const limpiarEstado = () => {
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // useEffect para cargar atributos cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      cargarAtributos();
    } else {
      // Al cerrar el modal, limpiar todos los atributos para que se recarguen al abrir
      setAtributos([]);
    }
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
