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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importarDepartamentos,
  apiImportarDepartamentos,
  apiGetDepartamentos,
} from "@/services/api";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface ImportDepartamentosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportDepartamentosModal({
  isOpen,
  onClose,
}: ImportDepartamentosModalProps) {
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [consultaLoading, setConsultaLoading] = useState(false);
  const [nombreFiltro, setNombreFiltro] = useState<string[]>([]);
  const [nombreSearch, setNombreSearch] = useState("");
  const [seleccionados, setSeleccionados] = useState<string[]>([]); // Usar name como identificador único
  const [importLoading, setImportLoading] = useState(false);

  // Nombres únicos filtrados por búsqueda y paginados de a 20
  const nombresUnicos = Array.from(new Set(departamentos.map((d) => d.name)));
  const nombresFiltrados = nombresUnicos
    .filter((nombre) =>
      nombre.toLowerCase().includes(nombreSearch.toLowerCase()),
    )
    .slice(0, 20);

  // Filtrado de departamentos por nombre
  const departamentosFiltrados = departamentos.filter((d, idx) => {
    const nombreOk =
      nombreFiltro.length > 0 ? nombreFiltro.includes(d.name) : true;
    return nombreOk;
  });

  // Selección de filas
  const allSelected =
    departamentosFiltrados.length > 0 &&
    departamentosFiltrados.every((dep) => seleccionados.includes(dep.name));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSeleccionados(
        seleccionados.filter(
          (name) => !departamentosFiltrados.some((dep) => dep.name === name),
        ),
      );
    } else {
      setSeleccionados([
        ...seleccionados,
        ...departamentosFiltrados
          .map((dep) => dep.name)
          .filter((name) => !seleccionados.includes(name)),
      ]);
    }
  };
  const toggleSelectOne = (name: string) => {
    setSeleccionados((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const consultar = async () => {
    setConsultaLoading(true);
    toast("Consultando departamentos desde Overpass...");
    try {
      const data = await importarDepartamentos();
      const existingDepartamentos = await apiGetDepartamentos();

      const existingNames =
        existingDepartamentos?.sdtDepartamentos?.map(
          (dep: { DepartamentoNombre: string }) => dep.DepartamentoNombre,
        ) || [];

      const updatedDepartamentos = data.map((dep: any) => ({
        ...dep,
        isNew: !existingNames.includes(dep.name),
      }));

      setDepartamentos(updatedDepartamentos);

      if (!data.length) {
        toast("No se encontraron departamentos.");
      }
    } catch (error: any) {
      console.error("Error consultando departamentos:", error.message);
      toast.error(
        "Error al consultar departamentos. Consulte la consola para más detalles.",
      );
    } finally {
      setConsultaLoading(false);
    }
  };

  const importar = async () => {
    const seleccionadosData = departamentosFiltrados.filter((dep) =>
      seleccionados.includes(dep.name),
    );
    if (seleccionadosData.length === 0) {
      toast.error("Debe seleccionar al menos un departamento para importar.");
      return;
    }
    // Formatear al formato requerido
    const body = {
      sdtDepartamentos: seleccionadosData.map((dep) => ({
        DepartamentoId: String(dep.osm_id),
        DepartamentoNombre: String(dep.name),
      })),
    };
    console.log("JSON a importar:", JSON.stringify(body, null, 2));
    setImportLoading(true);
    try {
      const response = await apiImportarDepartamentos(body);
      toast.success("Departamentos importados correctamente.");
      console.log("Respuesta de la API:", response);
      onClose(); // Cierra el modal
      window.dispatchEvent(new Event("actualizarTablaDepartamentos")); // Evento para actualizar la tabla
    } catch (error) {
      console.error("Error al importar departamentos:", error);
      toast.error(
        "Error al importar departamentos. Consulte la consola para más detalles.",
      );
    } finally {
      setImportLoading(false);
    }
  };

  const marcarSoloNuevos = () => {
    const nuevos = departamentosFiltrados
      .filter((dep) => dep.isNew)
      .map((dep) => dep.name);
    setSeleccionados(nuevos);
  };

  // Limpiar al abrir/cerrar
  React.useEffect(() => {
    if (isOpen) {
      setDepartamentos([]);
      setNombreFiltro([]);
      setNombreSearch("");
      setSeleccionados([]);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar Departamentos</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mt-2">
          <Button
            onClick={consultar}
            disabled={consultaLoading}
            variant="secondary"
          >
            {consultaLoading ? "Consultando..." : "Consultar"}
          </Button>
          <Button
            onClick={importar}
            disabled={consultaLoading || importLoading}
            variant="default"
          >
            {importLoading ? "Importando..." : "Importar"}
          </Button>
          <Button
            onClick={marcarSoloNuevos}
            disabled={consultaLoading || importLoading}
            variant="outline"
          >
            Marcar Solo Nuevos
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={consultaLoading || importLoading}
          >
            Cancelar
          </Button>
        </div>
        {departamentos.length > 0 && (
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
                  <TableHead className="w-1/3">
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
                  <TableHead>OSM ID</TableHead>
                  <TableHead>Admin Level</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departamentosFiltrados.map((dep, idx) => (
                  <TableRow key={dep.name}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={seleccionados.includes(dep.name)}
                        onCheckedChange={() => toggleSelectOne(dep.name)}
                      />
                    </TableCell>
                    <TableCell>
                      {dep.name}
                      {dep.isNew && (
                        <Badge className="ml-2 bg-green-500 text-white">
                          Nuevo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{dep.osm_id}</TableCell>
                    <TableCell>{dep.admin_level}</TableCell>
                    <TableCell>{dep.type}</TableCell>
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
