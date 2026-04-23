"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  apiAtributosDB,
  apiGuardarAtributosDB,
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
      const valorParseado = JSON.parse(valor);

      // Si es un array de objetos (ej. [{"Nombre": "X", "Valor": 70}])
      if (Array.isArray(valorParseado)) {
        return valorParseado.map((item, idx) => ({
          id: String(idx),
          valor: typeof item === "object" ? JSON.stringify(item) : String(item),
        }));
      }

      // Si es un objeto plano { clave: valor }
      if (typeof valorParseado === "object" && valorParseado !== null) {
        return Object.entries(valorParseado).map(([id, val]) => ({
          id,
          valor: typeof val === "object" ? JSON.stringify(val) : String(val),
        }));
      }
    } catch {
      // Si falla el parse estándar, intentar parsear formato "{16: Rivera}"
      try {
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

        if (campos.length > 0) return campos;
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
      const atributosExistentes = await apiAtributosDB(userId);
      console.log("Atributos recibidos de la API:", atributosExistentes);

      if (atributosExistentes.length > 0) {
        // Convertir cada AtributoDB a Atributo
        const atributosConvertidos = atributosExistentes.map((pref) => {
          const valor = pref.valor ?? "";
          const campos = parsearValorAtributo(valor);
          console.log(`Procesando atributo "${pref.atributo}":`, {
            valor,
            camposParseados: campos,
          });

          return {
            id: pref.id.toString(),
            descripcion: pref.atributo,
            campos: campos,
            valor: valor, // Mantener el valor original
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

  // Guardar todos los atributos (reemplaza completamente en BD)
  const guardarAtributos = async () => {
    try {
      setSaving(true);

      console.log("Guardando atributos para usuario:", userId);
      console.log("Atributos totales:", atributos);

      if (atributos.length === 0) {
        toast.info("No hay atributos para guardar");
        return true;
      }

      // Enviar TODOS los atributos (existentes + nuevos) — la ruta hace replace completo
      const atributosParaDB = atributos.map((atributo) => ({
        atributo: atributo.descripcion,
        valor: atributo.valor,
      }));

      console.log("Payload para API:", atributosParaDB);

      await apiGuardarAtributosDB(userId, atributosParaDB);

      const nuevos = atributos.filter((a) => a.id.startsWith("nuevo-")).length;
      toast.success(
        nuevos > 0
          ? `${nuevos} atributo(s) guardado(s) correctamente`
          : "Atributos actualizados correctamente",
      );

      // Recargar desde BD para obtener IDs reales
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
