import React, { useState, useEffect } from "react";
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
import { importarLocalidades, apiGetDepartamentos, apiGetLocalidades, apiImportarLocalidades } from "@/services/api";
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
import { Badge } from "@/components/ui/badge";

interface ImportLocalidadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
}

export default function ImportLocalidadesModal({
  isOpen,
  onClose,
  departamentos: departamentosProp,
}: ImportLocalidadesModalProps) {
  const [departamento, setDepartamento] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [consultaLoading, setConsultaLoading] = useState(false);
  const [localidadesPreview, setLocalidadesPreview] = useState<any[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [altNameFiltro, setAltNameFiltro] = useState<string[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]); // Usar name como identificador único
  const [nombreSearch, setNombreSearch] = useState("");
  const [departamentosState, setDepartamentosState] = useState<{
    departamentoid: string;
    departamentonombre: string;
  }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDepartamento("");
      setLocalidadesPreview([]);
      setTipoFiltro([]);
      setNombreFiltro([]);
      setAltNameFiltro([]);
      setSeleccionados([]);
      setNombreSearch("");
    }
  }, [isOpen]);

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

  const importar = async () => {
    if (!departamento) {
      toast.error(
        "Por favor, seleccione un departamento para importar localidades.",
      );
      return;
    }

    const seleccionadosData = localidadesPreview.filter((loc) => seleccionados.includes(loc.name));
    if (seleccionadosData.length === 0) {
      toast.error("Debe seleccionar al menos una localidad para importar.");
      return;
    }

    // Formatear los datos seleccionados al formato requerido por la API
    const body = {
      sdtLocalidad: seleccionadosData.map((loc) => ({
        DepartamentoId: Number(departamento),
        LocalidadId: loc.id,
        LocalidadNombre: loc.name,
        LocalidadEstado: "", 
        LocalidadLatitud: loc.lat,
        LocalidadLongitud: loc.lon,
        LocalidadReferencia: loc.alt_name || "",
        LocalidadTipo: "",
        LocalidadType: loc.place || "", // Campo vacío por defecto
        LocalidadAddressType: "", // Campo vacío por defecto
        LocalidadPoblacion: loc.population || null, // Campo opcional
      })),
    };

    console.log("JSON a importar:", JSON.stringify(body, null, 2));
    setLoading(true);
    try {
      const response = await apiImportarLocalidades(body);
      toast.success("Localidades importadas correctamente.");
      console.log("Respuesta de la API:", response);
      onClose(); // Cierra el modal
      window.dispatchEvent(new Event("actualizarTablaLocalidades")); // Evento para actualizar la tabla
    } catch (error) {
      console.error("Error al importar localidades:", error);
      toast.error("Error al importar localidades. Consulte la consola para más detalles.");
    } finally {
      setLoading(false);
    }
  };

  const consultar = async () => {
    if (!departamento) {
      toast.error("Por favor, seleccione un departamento para consultar.");
      return;
    }

    // Obtener el nombre del departamento seleccionado
    const departamentoNombre = departamentosState.find(
      (dep) => dep.departamentoid === departamento
    )?.departamentonombre;

    if (!departamentoNombre) {
      toast.error("No se pudo encontrar el nombre del departamento seleccionado.");
      return;
    }

    setConsultaLoading(true);
    toast("Obteniendo localidades de Overpass...");
    try {
      const data: {
        id: number;
        lat: number;
        lon: number;
        alt_name?: string;
        name: string;
        place: string;
        population?: string;
      }[] = await importarLocalidades(departamentoNombre);

      // Obtener localidades existentes desde la API usando POST
      const existingLocalidades = await apiGetLocalidades({ DepartamentoId: departamento });
      const existingNames = existingLocalidades?.sdtLocalidad?.map(
        (loc: { LocalidadNombre: string }) => loc.LocalidadNombre
      ) || [];
      console.log("Nombres existentes en la API:", existingNames);
      console.log("Localidades obtenidas de la api:", existingLocalidades);

      setLocalidadesPreview(
        data.map((loc) => {
          const isNew = !existingNames.includes(loc.name.trim());
          console.log("Procesando localidad:", loc.name.trim(), "| Marcado como nuevo:", isNew);
          return {
            id: loc.id,
            lat: loc.lat,
            lon: loc.lon,
            alt_name: loc.alt_name?.trim() || "N/A",
            name: loc.name.trim(),
            place: loc.place,
            population: loc.population?.trim() || "N/A",
            isNew, // Marcar como nuevo si no existe
          };
        }),
      );

      if (!data.length) {
        toast("No se encontraron localidades para este departamento.");
      }
    } catch (error: any) {
      console.error("Error consultando localidades:", error.message);
      toast.error(
        "Error al consultar localidades. Consulte la consola para más detalles.",
      );
    } finally {
      setConsultaLoading(false);
    }
  };

  // Filtrado de localidades por tipo y nombre
  const localidadesFiltradas = localidadesPreview.filter((loc) => {
    const tipoOk =
      tipoFiltro.length > 0 ? tipoFiltro.includes(loc.place) : true;
    const nombreOk =
      nombreFiltro.length > 0 ? nombreFiltro.includes(loc.name) : true;
    const altNameOk =
      altNameFiltro.length > 0 ? altNameFiltro.includes(loc.alt_name) : true;
    return tipoOk && nombreOk && altNameOk;
  });

  // Obtener todos los tipos únicos
  const tiposUnicos = Array.from(
    new Set(localidadesPreview.map((loc) => loc.place)),
  );
  // Obtener todos los nombres únicos
  const nombresUnicos = Array.from(
    new Set(localidadesPreview.map((loc) => loc.name)),
  );
  // Obtener todos los nombres alternativos únicos
  const altNamesUnicos = Array.from(
    new Set(
      localidadesPreview
        .map((loc) => loc.alt_name)
        .filter(Boolean),
    ),
  );

  // Nombres únicos filtrados por búsqueda y paginados de a 20
  const nombresFiltrados = nombresUnicos
    .filter((nombre) =>
      nombre.toLowerCase().includes(nombreSearch.toLowerCase()),
    )
    .slice(0, 20);

  // Selección de filas
  const allSelected =
    localidadesFiltradas.length > 0 &&
    localidadesFiltradas.every((loc) => seleccionados.includes(loc.name));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSeleccionados(
        seleccionados.filter(
          (name) => !localidadesFiltradas.some((loc) => loc.name === name),
        ),
      );
    } else {
      setSeleccionados([
        ...seleccionados,
        ...localidadesFiltradas
          .map((loc) => loc.name)
          .filter((name) => !seleccionados.includes(name)),
      ]);
    }
  };
  const toggleSelectOne = (name: string) => {
    setSeleccionados((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-6xl">
        <DialogHeader>
          <DialogTitle>Importar Localidades</DialogTitle>
        </DialogHeader>
        <Select value={departamento} onValueChange={setDepartamento}>
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
        <div className="flex gap-2 mt-2">
          <Button
            onClick={consultar}
            disabled={consultaLoading || !departamento}
            variant="secondary"
          >
            {consultaLoading ? "Consultando..." : "Consultar"}
          </Button>
          <Button onClick={importar} disabled={loading || !departamento}>
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
        {localidadesPreview.length > 0 && (
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
                  <TableHead className="w-1/4">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Nombre ▾
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 max-h-96 overflow-auto">
                        <input
                          type="text"
                          placeholder="Buscar nombre..."
                          value={nombreSearch}
                          onChange={(e) => setNombreSearch(e.target.value)}
                          className="mb-2 w-full rounded border px-2 py-1 text-sm bg-background text-foreground"
                        />
                        <div className="flex flex-col gap-1">
                          {nombresFiltrados.map((nombre) => (
                            <label
                              key={nombre}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={nombreFiltro.includes(nombre)}
                                onCheckedChange={(checked) => {
                                  setNombreFiltro((prev) =>
                                    checked
                                      ? [...prev, nombre]
                                      : prev.filter((n) => n !== nombre),
                                  );
                                }}
                              />
                              <span>{nombre}</span>
                            </label>
                          ))}
                          {nombresFiltrados.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              Sin resultados
                            </span>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead className="w-1/4">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Tipo ▾
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48">
                        <div className="flex flex-col gap-1">
                          {tiposUnicos.map((tipo) => (
                            <label
                              key={tipo}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={tipoFiltro.includes(tipo)}
                                onCheckedChange={(checked) => {
                                  setTipoFiltro((prev) =>
                                    checked
                                      ? [...prev, tipo]
                                      : prev.filter((t) => t !== tipo),
                                  );
                                }}
                              />
                              <span>{tipo}</span>
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead className="w-1/4">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Nom. Alt. ▾
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 max-h-96 overflow-auto">
                        <input
                          type="text"
                          placeholder="Buscar nom. alt..."
                          value={nombreSearch}
                          onChange={(e) => setNombreSearch(e.target.value)}
                          className="mb-2 w-full rounded border px-2 py-1 text-sm bg-background text-foreground"
                        />
                        <div className="flex flex-col gap-1">
                          {altNamesUnicos.map((altName) => (
                            <label
                              key={altName}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={altNameFiltro.includes(altName)}
                                onCheckedChange={(checked) => {
                                  setAltNameFiltro((prev) =>
                                    checked
                                      ? [...prev, altName]
                                      : prev.filter((n) => n !== altName),
                                  );
                                }}
                              />
                              <span>{altName}</span>
                            </label>
                          ))}
                          {altNamesUnicos.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              Sin resultados
                            </span>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead className="w-1/4">Latitud</TableHead>
                  <TableHead className="w-1/4">Longitud</TableHead>
                  <TableHead className="w-1/4">Población</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localidadesFiltradas.map((loc, idx) => (
                  <TableRow key={`${loc.name}-${idx}`}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={seleccionados.includes(loc.name)}
                        onCheckedChange={() => toggleSelectOne(loc.name)}
                      />
                    </TableCell>
                    <TableCell>
                      {loc.name}
                      {loc.isNew && (
                        <Badge className="ml-2 bg-green-500 text-white">Nuevo</Badge>
                      )}
                    </TableCell>
                    <TableCell>{loc.place}</TableCell>
                    <TableCell>{loc.alt_name}</TableCell>
                    <TableCell>{loc.lat}</TableCell>
                    <TableCell>{loc.lon}</TableCell>
                    <TableCell>{loc.population}</TableCell>
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
