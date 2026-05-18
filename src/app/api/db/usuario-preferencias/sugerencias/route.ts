import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Máximo de valores únicos por key para no inflar la respuesta
const MAX_VALORES_POR_KEY = 50;

export interface SugerenciasAtributos {
  success: true;
  atributos: string[];
  porAtributo: Record<
    string,
    {
      keys: string[];
      valoresPorKey: Record<string, string[]>;
    }
  >;
}

// GET /api/db/usuario-preferencias/sugerencias
// Devuelve atributos, keys y valores distintos para alimentar comboboxes
export async function GET() {
  try {
    const filas = await prisma.usuarioPreferencia.findMany({
      select: { atributo: true, valor: true },
    });

    // Sets para acumular sin duplicados
    const atributosSet = new Set<string>();
    const keysPorAtributo = new Map<string, Set<string>>();
    const valoresPorAtributoKey = new Map<string, Map<string, Set<string>>>();

    for (const fila of filas) {
      const atributo = fila.atributo;

      atributosSet.add(atributo);

      if (!keysPorAtributo.has(atributo)) {
        keysPorAtributo.set(atributo, new Set<string>());
      }
      if (!valoresPorAtributoKey.has(atributo)) {
        valoresPorAtributoKey.set(atributo, new Map<string, Set<string>>());
      }

      // Parsear valor como JSON (solo objetos planos {key: value})
      if (fila.valor) {
        try {
          const parsed: unknown = JSON.parse(fila.valor);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            const keysDelAtributo = keysPorAtributo.get(atributo)!;
            const valoresPorKey = valoresPorAtributoKey.get(atributo)!;

            for (const [key, val] of Object.entries(
              parsed as Record<string, unknown>
            )) {
              keysDelAtributo.add(key);

              if (!valoresPorKey.has(key)) {
                valoresPorKey.set(key, new Set<string>());
              }
              const valSet = valoresPorKey.get(key)!;
              if (valSet.size < MAX_VALORES_POR_KEY && val !== null && val !== undefined) {
                valSet.add(String(val));
              }
            }
          }
        } catch {
          // Valor no parseable como JSON — ignorar esa fila
        }
      }
    }

    // Serializar a objetos planos
    const porAtributo: SugerenciasAtributos["porAtributo"] = {};

    for (const atributo of atributosSet) {
      const keys = Array.from(keysPorAtributo.get(atributo) ?? []).sort();
      const valoresPorKeyMap =
        valoresPorAtributoKey.get(atributo) ?? new Map<string, Set<string>>();
      const valoresPorKey: Record<string, string[]> = {};

      for (const key of keys) {
        valoresPorKey[key] = Array.from(valoresPorKeyMap.get(key) ?? []).sort();
      }

      porAtributo[atributo] = { keys, valoresPorKey };
    }

    const response: SugerenciasAtributos = {
      success: true,
      atributos: Array.from(atributosSet).sort(),
      porAtributo,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API/db/usuario-preferencias/sugerencias GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener sugerencias" },
      { status: 500 }
    );
  }
}
