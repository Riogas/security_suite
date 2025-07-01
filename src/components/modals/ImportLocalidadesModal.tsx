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
import { importarLocalidades } from "@/services/api";
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

interface ImportLocalidadesModalProps {
  isOpen: boolean;
  onClose: () => void;
  departamentos: string[];
}

export default function ImportLocalidadesModal({
  isOpen,
  onClose,
  departamentos,
}: ImportLocalidadesModalProps) {
  const [departamento, setDepartamento] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [consultaLoading, setConsultaLoading] = useState(false);
  const [localidadesPreview, setLocalidadesPreview] = useState<any[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]); // Usar name como identificador único
  const [nombreSearch, setNombreSearch] = useState("");

  useEffect(() => {
    if (isOpen) {
      setDepartamento("");
      setLocalidadesPreview([]);
      setTipoFiltro([]);
      setNombreFiltro([]);
      setSeleccionados([]);
      setNombreSearch("");
    }
  }, [isOpen]);

  const importar = async () => {
    if (!departamento) {
      toast.error(
        "Por favor, seleccione un departamento para importar localidades.",
      );
      return;
    }
    setLoading(true);
    try {
      await importarLocalidades(departamento);
      toast.success("Localidades importadas correctamente.");
      onClose();
    } catch (error: any) {
      console.error("Error importando localidades:", error.message);
      toast.error(
        "Error al importar localidades. Consulte la consola para más detalles.",
      );
    } finally {
      setLoading(false);
    }
  };

  const consultar = async () => {
    if (!departamento) {
      toast.error("Por favor, seleccione un departamento para consultar.");
      return;
    }
    setConsultaLoading(true);
    toast("Consultando localidades desde Overpass...");
    try {
      const data: { name: string; place: string; lat: number; lon: number }[] =
        await importarLocalidades(departamento);
      setLocalidadesPreview(
        data.map((loc) => ({
          ...loc,
          name: loc.name.trim(),
        })),
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
  const localidadesFiltradas = localidadesPreview.filter((loc, idx) => {
    const tipoOk =
      tipoFiltro.length > 0 ? tipoFiltro.includes(loc.place) : true;
    const nombreOk =
      nombreFiltro.length > 0 ? nombreFiltro.includes(loc.name) : true;
    return tipoOk && nombreOk;
  });

  // Obtener todos los tipos únicos
  const tiposUnicos = Array.from(
    new Set(localidadesPreview.map((loc) => loc.place)),
  );
  // Obtener todos los nombres únicos
  const nombresUnicos = Array.from(
    new Set(localidadesPreview.map((loc) => loc.name)),
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
            {departamento || "Seleccione un departamento"}
          </SelectTrigger>
          <SelectContent>
            {departamentos.map((dep) => (
              <SelectItem key={dep} value={dep}>
                {dep}
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
                  <TableHead className="w-1/4">Lat</TableHead>
                  <TableHead className="w-1/4">Lon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localidadesFiltradas.map((loc, idx) => (
                  <TableRow key={loc.name}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={seleccionados.includes(loc.name)}
                        onCheckedChange={() => toggleSelectOne(loc.name)}
                      />
                    </TableCell>
                    <TableCell>{loc.name}</TableCell>
                    <TableCell>{loc.place}</TableCell>
                    <TableCell>{loc.lat}</TableCell>
                    <TableCell>{loc.lon}</TableCell>
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
