import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  apiGetDepartamentos,
  apiGetLocalidades,
  importarCalles,
  obtenerCallesDesdeCoordenadas,
} from "@/services/api";

interface ImportCallesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
  localidadesPorDepartamento: Record<string, string[]>;
}

export default function ImportCallesModal({
  isOpen,
  onClose,
  departamentos,
  localidadesPorDepartamento,
}: ImportCallesModalProps) {
  const [departamento, setDepartamento] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [loading, setLoading] = useState(false);
  const [callesPreview, setCallesPreview] = useState<any[]>([]);
  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [nombreSearch, setNombreSearch] = useState("");
  const [seleccionados, setSeleccionados] = useState<string[]>([]); // Usar name como identificador único
  const [consultaLoading, setConsultaLoading] = useState(false);
  const [oldNameFiltro, setOldNameFiltro] = useState<string[]>([]);
  const [oldNameSearch, setOldNameSearch] = useState("");

  const [departamentosState, setDepartamentosState] = useState<{
    departamentoid: string;
    departamentonombre: string;
  }[]>([]);
  const [localidadesState, setLocalidadesState] = useState<{
    localidadid: string;
    localidadnombre: string;
    lat: number;
    lon: number;
  }[]>([]);

  // Nombres únicos filtrados por búsqueda y paginados de a 20
  const nombresUnicos = Array.from(new Set(callesPreview.map((c) => c.name)));
  const nombresFiltrados = nombresUnicos
    .filter((nombre) =>
      nombre.toLowerCase().includes(nombreSearch.toLowerCase()),
    )
    .slice(0, 20);

  // Nombres antiguos únicos filtrados por búsqueda y paginados de a 20
  const oldNamesUnicos = Array.from(
    new Set(callesPreview.map((c) => c.old_name)),
  );
  const oldNamesFiltrados = oldNamesUnicos
    .filter(
      (oldName) =>
        oldName && oldName.toLowerCase().includes(oldNameSearch.toLowerCase()),
    )
    .slice(0, 20);

  // Filtrado de calles por nombre y nombre antiguo
  const callesFiltradas = callesPreview.filter((c) => {
    const nombreOk =
      nombreFiltro.length > 0 ? nombreFiltro.includes(c.name) : true;
    const oldNameOk =
      oldNameFiltro.length > 0 ? oldNameFiltro.includes(c.old_name) : true;
    return nombreOk && oldNameOk;
  });

  // Selección de filas
  const allSelected =
    callesFiltradas.length > 0 &&
    callesFiltradas.every((c) => seleccionados.includes(c.name));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSeleccionados(
        seleccionados.filter(
          (name) => !callesFiltradas.some((c) => c.name === name),
        ),
      );
    } else {
      setSeleccionados([
        ...seleccionados,
        ...callesFiltradas
          .map((c) => c.name)
          .filter((name) => !seleccionados.includes(name)),
      ]);
    }
  };
  const toggleSelectOne = (name: string) => {
    setSeleccionados((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const importar = async () => {
    const pais = "Uruguay";
    if (!pais || !departamento || !localidad) {
      toast.error("Por favor, seleccione un departamento y una localidad.");
      return;
    }
    setLoading(true);
    try {
      toast("Obteniendo calles desde Overpass...");
      const overpassQuery = `
        [out:json];
        area["name"="Uruguay"]["admin_level"="2"]->.country;
        area["name"="${departamento}"]["admin_level"="4"](area.country)->.depArea;
        area["name"="${localidad}"]["admin_level"="8"](area.depArea)->.searchArea;
        (
          way["highway"]["name"](area.searchArea);
        );
        out tags;
      `;
      const overpassResponse = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: overpassQuery,
        },
      );
      if (!overpassResponse.ok) {
        throw new Error(`Error en Overpass API: ${overpassResponse.status}`);
      }
      const overpassData = await overpassResponse.json();
      const uniqueStreets = Array.from(
        new Map(
          overpassData.elements.map((way: any) => [
            way.tags.name,
            { name: way.tags.name, old_name: way.tags.old_name || "N/A" },
          ]),
        ).values(),
      );
      toast.success("Calles importadas correctamente.");
      onClose();
    } catch (error: any) {
      console.error("Error importando calles:", error.message);
      toast.error(
        "Error al importar calles. Consulte la consola para más detalles.",
      );
    } finally {
      setLoading(false);
    }
  };

  const consultar = async () => {
    if (!departamento || !localidad) {
      toast.error("Por favor, seleccione un departamento y una localidad.");
      return;
    }
    setConsultaLoading(true);
    try {
      toast("Obteniendo calles desde Overpass...");
      const selectedLocalidad = localidadesState.find(
        (loc) => loc.localidadid === localidad,
      );
      if (!selectedLocalidad) {
        throw new Error(
          "No se encontraron coordenadas para la localidad seleccionada.",
        );
      }
      const calles = await obtenerCallesDesdeCoordenadas(
        selectedLocalidad.lat,
        selectedLocalidad.lon,
      );
      setCallesPreview(calles);
      setSeleccionados([]);
      setNombreFiltro([]);
      setNombreSearch("");
      if (!calles.length) {
        toast("No se encontraron calles para esta localidad.");
      }
    } catch (error: any) {
      console.error("Error consultando calles:", error.message);
      toast.error(
        "Error al consultar calles. Consulte la consola para más detalles.",
      );
    } finally {
      setConsultaLoading(false);
    }
  };

  useEffect(() => {
    const fetchDepartamentos = async () => {
      const data = await apiGetDepartamentos();
      const filteredDepartamentos = data.sdtDepartamentos
        .filter((dep: { DepartamentoEstado: string }) => dep.DepartamentoEstado === "S")
        .map((dep: { DepartamentoId: string; DepartamentoNombre: string }) => ({
          departamentoid: dep.DepartamentoId,
          departamentonombre: dep.DepartamentoNombre,
        }));
      setDepartamentosState(filteredDepartamentos);
    };

    fetchDepartamentos();
  }, []);

  useEffect(() => {
    const fetchLocalidades = async () => {
      if (!departamento) return;
      const data = await apiGetLocalidades({ DepartamentoId: departamento });
      const filteredLocalidades = data.sdtLocalidad
        .filter((loc: { LocalidadEstado: string }) => loc.LocalidadEstado === "S")
        .map((loc: { LocalidadId: string; LocalidadNombre: string; LocalidadLatitud: string; LocalidadLongitud: string }) => ({
          localidadid: loc.LocalidadId,
          localidadnombre: loc.LocalidadNombre,
          lat: parseFloat(loc.LocalidadLatitud),
          lon: parseFloat(loc.LocalidadLongitud),
        }));
      setLocalidadesState(filteredLocalidades);
    };

    fetchLocalidades();
  }, [departamento]);

  const localidades = departamento
    ? localidadesState.map((loc) => ({ id: loc.localidadid, name: loc.localidadnombre }))
    : [];

  useEffect(() => {
    if (isOpen) {
      setDepartamento("");
      setLocalidad("");
      setCallesPreview([]);
      setSeleccionados([]);
      setNombreFiltro([]);
      setNombreSearch("");
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-6xl">
        <DialogHeader>
          <DialogTitle>Importar Calles</DialogTitle>
        </DialogHeader>
        <div className="flex flex-row gap-4 items-center mb-2">
          <Select
            value={departamento}
            onValueChange={(value) => {
              setDepartamento(value);
              setLocalidad("");
            }}
          >
            <SelectTrigger>
              {departamentosState.find((dep) => dep.departamentoid === departamento)?.departamentonombre || "Seleccione un departamento"}
            </SelectTrigger>
            <SelectContent>
              {departamentosState.map((dep) => (
                <SelectItem key={dep.departamentoid} value={dep.departamentoid}>
                  {dep.departamentonombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={localidad}
            onValueChange={setLocalidad}
            disabled={!departamento}
          >
            <SelectTrigger>
              {localidades.find((loc) => loc.id === localidad)?.name ||
                (departamento
                  ? "Seleccione una localidad"
                  : "Seleccione un departamento primero")}
            </SelectTrigger>
            <SelectContent>
              {localidades.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              onClick={consultar}
              disabled={consultaLoading || !departamento || !localidad}
              variant="secondary"
            >
              {consultaLoading ? "Consultando..." : "Consultar"}
            </Button>
            <Button
              onClick={importar}
              disabled={loading || !departamento || !localidad}
            >
              {loading ? "Importando..." : "Importar"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading || consultaLoading}
            >
              Cancelar
            </Button>
          </div>
        </div>
        {callesPreview.length > 0 && (
          <div className="mt-4 max-h-96 overflow-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-1/4">Nombre</TableHead>
                  <TableHead className="w-1/4">Nombre Antiguo</TableHead>
                  <TableHead className="w-1/4">Tipo</TableHead>
                  <TableHead className="w-1/4">Superficie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callesFiltradas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={seleccionados.includes(c.name)}
                        onCheckedChange={() => toggleSelectOne(c.name)}
                      />
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.old_name || "N/A"}</TableCell>
                    <TableCell>{c.highway || "Desconocido"}</TableCell>
                    <TableCell>{c.surface || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
