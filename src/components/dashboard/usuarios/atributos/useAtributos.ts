"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  apiAtributosDB,
  apiGuardarAtributosDB,
  apiObtenerSugerenciasAtributosDB,
  SugerenciasAtributosResponse,
} from "@/services/api";
import {
  type CampoValor,
  generarJsonValor,
  parsearValorAtributo,
} from "./valorAtributo";

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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sugerencias, setSugerencias] = useState<SugerenciasAtributosResponse | null>(null);

  // generarJsonValor / parsearValorAtributo viven en ./valorAtributo.ts (puras, testeadas).

  // Cargar sugerencias para comboboxes (una sola vez cuando el modal se abre)
  const cargarSugerencias = async () => {
    try {
      const data = await apiObtenerSugerenciasAtributosDB();
      setSugerencias(data);
    } catch (error) {
      console.error("Error al cargar sugerencias:", error);
      // No mostrar toast — es funcionalidad de mejora, no bloqueante
    }
  };

  // Cargar atributos existentes del usuario
  const cargarAtributos = async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const atributosExistentes = await apiAtributosDB(userId);

      if (atributosExistentes.length > 0) {
        // Convertir cada AtributoDB a Atributo
        const atributosConvertidos = atributosExistentes.map((pref) => {
          const valor = pref.valor ?? "";
          const campos = parsearValorAtributo(valor);

          return {
            id: pref.id.toString(),
            descripcion: pref.atributo,
            campos: campos,
            valor: valor, // Mantener el valor original
          };
        });

        setAtributos(atributosConvertidos);
      } else {
        setAtributos([]);
      }
    } catch (error) {
      console.error("Error al cargar atributos:", error);
      toast.error("Error al cargar los atributos del usuario");
    } finally {
      setLoading(false);
    }
  };

  // Iniciar edición de un atributo existente (carga sus datos en el formulario)
  const editarAtributo = (id: string) => {
    const atributo = atributos.find((a) => a.id === id);
    if (!atributo) return;
    setEditandoId(id);
    setDescripcionAtributo(atributo.descripcion);
    setCamposActuales([...atributo.campos]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // Crear o actualizar atributo en el estado local
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

    if (editandoId !== null) {
      // Actualizar atributo existente en el estado local
      setAtributos((prev) =>
        prev.map((a) =>
          a.id === editandoId
            ? { ...a, descripcion: descripcionAtributo.trim(), campos: [...camposActuales], valor: valorJson }
            : a
        )
      );
      toast.success(`Atributo "${descripcionAtributo.trim()}" actualizado`);
    } else {
      // Agregar nuevo atributo
      const nuevoAtributo: Atributo = {
        id: `nuevo-${Date.now()}`,
        descripcion: descripcionAtributo.trim(),
        campos: [...camposActuales],
        valor: valorJson,
      };
      setAtributos((prev) => [...prev, nuevoAtributo]);
      toast.success(`Atributo "${nuevoAtributo.descripcion}" agregado`);
    }

    // Limpiar formulario
    setEditandoId(null);
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // Eliminar atributo
  const eliminarAtributo = (id: string) => {
    setAtributos((prev) => prev.filter((attr) => attr.id !== id));
    // Si se eliminó el que estaba en edición, limpiar formulario
    if (editandoId === id) {
      setEditandoId(null);
      setDescripcionAtributo("");
      setCamposActuales([]);
      setNuevoCampo({ id: "", valor: "" });
    }
    toast.success("Atributo eliminado");
  };

  // Guardar todos los atributos (reemplaza completamente en BD)
  const guardarAtributos = async () => {
    try {
      setSaving(true);

      if (atributos.length === 0) {
        toast.info("No hay atributos para guardar");
        return true;
      }

      const atributosParaDB = atributos.map((atributo) => ({
        atributo: atributo.descripcion,
        valor: atributo.valor,
      }));

      await apiGuardarAtributosDB(userId, atributosParaDB);

      toast.success(`${atributosParaDB.length} atributo(s) guardado(s) correctamente`);

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
    setEditandoId(null);
    setDescripcionAtributo("");
    setCamposActuales([]);
    setNuevoCampo({ id: "", valor: "" });
  };

  // useEffect para cargar atributos cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      cargarAtributos();
      cargarSugerencias();
    } else {
      // Al cerrar el modal, limpiar todos los atributos para que se recarguen al abrir
      setAtributos([]);
      setSugerencias(null);
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
    editandoId,
    saving,
    loading,
    sugerencias,

    // Funciones
    crearAtributo,
    editarAtributo,
    eliminarAtributo,
    guardarAtributos,
    limpiarEstado,
  };
}
