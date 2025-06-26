"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle, Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import dynamic from "next/dynamic";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { Pencil, Trash } from "lucide-react";
import { Combobox } from "@headlessui/react";
import Mapa from "@/components/mapa/OpenStreetMap";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

// Cargamos el mapa dinámicamente (por ahora sin SSR)
const DynamicMapa = dynamic(() => import("@/components/mapa/OpenStreetMap"), {
  ssr: false,
});

interface ClienteFormProps {
  clienteId?: string;
}

interface TelefonoAlternativo {
  numero: string;
  observacion: string;
}

const Modal = ({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gray-800 text-white p-6 text-left align-middle shadow-xl transition-all">
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

const departamentos = [
  { nombre: "Montevideo", localidades: ["Centro", "Ciudad Vieja", "Pocitos"] },
  {
    nombre: "Canelones",
    localidades: ["Las Piedras", "La Paz", "Barros Blancos"],
  },
  {
    nombre: "Maldonado",
    localidades: ["Punta del Este", "San Carlos", "La Barra"],
  },
];

const mockStreets = [
  "Avenida Italia",
  "Avenida Millán",
  "26 de Marzo",
  "Bulevar España",
  "Rambla de Montevideo",
  "Avenida 18 de Julio",
  "Avenida Brasil",
  "Avenida Libertador",
  "Avenida Italia y Bulevar Artigas",
  "Avenida General Flores",
];

export default function ClienteForm({ clienteId }: ClienteFormProps) {
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [telefonos, setTelefonos] = useState<TelefonoAlternativo[]>([]);
  const [newTelefono, setNewTelefono] = useState<TelefonoAlternativo>({
    numero: "",
    observacion: "",
  });
  const [selectedDepartamento, setSelectedDepartamento] = useState<string>("");
  const [localidades, setLocalidades] = useState<string[]>([]);
  const [selectedLocalidad, setSelectedLocalidad] = useState<string>("");
  const [direccion, setDireccion] = useState<string>("");
  const [nroPuerta, setNroPuerta] = useState<string>("");
  const [esquina1, setEsquina1] = useState<string>("");
  const [esquina2, setEsquina2] = useState<string>("");

  const handleAdd = () => {
    setTelefonos([...telefonos, newTelefono]);
    setNewTelefono({ numero: "", observacion: "" });
    setShowModal(false);
  };

  const handleEdit = (index: number) => {
    const telefono = telefonos[index];
    setNewTelefono(telefono);
    setShowModal(true);
  };

  const handleDelete = (index: number) => {
    setTelefonos(telefonos.filter((_, i) => i !== index));
  };

  const handleDepartamentoChange = (departamento: string) => {
    setSelectedDepartamento(departamento);
    const depto = departamentos.find((d) => d.nombre === departamento);
    setLocalidades(depto ? depto.localidades : []);
  };

  const handleLocalidadChange = (localidad: string) => {
    setSelectedLocalidad(localidad);
    console.log("Localidad seleccionada:", localidad);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
      {/* Acciones */}
      <div className="col-span-full flex justify-end gap-4 mb-6">
        <Button variant="outline" className="flex items-center gap-2">
          <span>Cancelar</span>
        </Button>
        <Button
          className="flex items-center gap-2"
          onClick={() => setLoading(true)}
        >
          <span>Guardar Cliente</span>
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500"></div>
          )}
        </Button>
      </div>

      <div className="col-span-4 space-y-6">
        {/* Información Básica */}
        <CollapsibleCard title="Información Básica" defaultOpen={true}>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Primera línea */}
            <div>
              <Label>Teléfono Principal</Label>
              <Input placeholder="46326008" />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input placeholder="DIEGO" />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input placeholder="MEDAGLIA" />
            </div>

            {/* Segunda línea */}
            <div>
              <Label>Obs. Cliente</Label>
              <Input placeholder="Observaciones" />
            </div>
            <div>
              <Label>Email</Label>
              <Input placeholder="example@mail.com" />
            </div>
            {/* Tercera línea */}
            
            <div>
              <Label>Tipo Cliente</Label>
              <Select>
                <SelectTrigger>
                  <span>Seleccionar</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domesticos">DOMÉSTICOS</SelectItem>
                  <SelectItem value="empresarial">COMERCIAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </CollapsibleCard>

        {/* Dirección + Mapa */}
        <CollapsibleCard title="Dirección y Geolocalización" defaultOpen={true}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Departamento y Localidad */}
              <div className="md:col-span-3 w-full">
                <Label>Departamento</Label>
                <Select onValueChange={handleDepartamentoChange}>
                  <SelectTrigger className="w-full">
                    <span>{selectedDepartamento || "Seleccionar"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((depto) => (
                      <SelectItem key={depto.nombre} value={depto.nombre}>
                        {depto.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3 w-full">
                <Label>Localidad</Label>
                <Select onValueChange={handleLocalidadChange}>
                  <SelectTrigger className="w-full">
                    <span>{selectedLocalidad || "Seleccionar"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {localidades.map((localidad) => (
                      <SelectItem key={localidad} value={localidad}>
                        {localidad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dirección */}
              <div className="col-span-full">
                <Label>Dirección</Label>
                <div className="relative w-full">
                  <Combobox
                    value={direccion}
                    onChange={(value) => setDireccion(value ?? "")}
                  >
                    <Combobox.Input
                      placeholder="Ej: Av. Italia"
                      onBlur={(e) => setDireccion(e.target.value)}
                      className="w-full border border-gray-700 bg-gray-900 text-white rounded-md p-2"
                    />
                    <Combobox.Options className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-md">
                      {mockStreets.map((street) => (
                        <Combobox.Option
                          key={street}
                          value={street}
                          className="px-3 py-2 text-white hover:bg-gray-700 cursor-pointer"
                        >
                          {street}
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  </Combobox>
                </div>
              </div>

              {/* Nº Puerta, Apto, Block/Solar, Nivel, Local, Manzana */}
              <div>
                <Label>Nº Puerta</Label>
                <Input
                  placeholder="1234"
                  value={nroPuerta}
                  onChange={(e) => setNroPuerta(e.target.value)}
                />
              </div>
              <div>
                <Label>Apto</Label>
                <Input placeholder="" />
              </div>
              <div>
                <Label>Block</Label>
                <Input placeholder="Block/Solar" />
              </div>
              <div>
                <Label>Nivel</Label>
                <Input placeholder="" />
              </div>
              <div>
                <Label>Local</Label>
                <Input placeholder="" />
              </div>
              <div>
                <Label>Manzana</Label>
                <Input placeholder="" />
              </div>

              {/* Esquina 1 y Esquina 2 */}
              <div className="md:col-span-3">
                <Label>Esquina 1</Label>
                <Input
                  placeholder=""
                  value={esquina1}
                  onChange={(e) => setEsquina1(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Esquina 2</Label>
                <Input
                  placeholder=""
                  value={esquina2}
                  onChange={(e) => setEsquina2(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Latitud</Label>
                <Input
                  placeholder=""
                  value={coords.lat}
                  readOnly
                />
              </div>
              <div className="md:col-span-3">
                <Label>Longitud</Label>
                <Input
                  placeholder=""
                  value={coords.lng}
                  readOnly
                />
              </div>
            </div>
            <div>
              <DynamicMapa
                onChange={(data) => {
                  if (data.address && data.address !== direccion) {
                    setDireccion(data.address);
                  }
                  if (data.houseNumber && data.houseNumber !== nroPuerta) {
                    setNroPuerta(data.houseNumber);
                  }
                  if (data.lat && data.lng) {
                    setCoords({ lat: data.lat, lng: data.lng });
                  }
                  console.log("Datos recibidos del mapa:", data);
                }}
                departamento={selectedDepartamento}
                localidad={selectedLocalidad || ""}
                direccion={direccion}
                nroPuerta={nroPuerta}
                esquina1={esquina1}
                esquina2={esquina2}
              />
            </div>
          </CardContent>
        </CollapsibleCard>

        {/* Observaciones */}
        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Obs. General</Label>
              <Input placeholder="Observaciones varias" />
            </div>
            <div>
              <Label>Obs. Comercial</Label>
              <Input placeholder="Cliente moroso en 2023" />
            </div>
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between items-center">
                <Label>Teléfonos Alternativos</Label>
                <Button variant="outline" onClick={() => setShowModal(true)}>
                  + Agregar
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Observación</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {telefonos.map((telefono, index) => (
                    <TableRow key={index}>
                      <TableCell>{telefono.numero}</TableCell>
                      <TableCell>{telefono.observacion}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(index)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(index)}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
              <div className="space-y-4">
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={newTelefono.numero}
                    onChange={(e) =>
                      setNewTelefono({ ...newTelefono, numero: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Observación</Label>
                  <Input
                    value={newTelefono.observacion}
                    onChange={(e) =>
                      setNewTelefono({
                        ...newTelefono,
                        observacion: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex justify-end gap-4">
                  <Button variant="outline" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAdd}>Confirmar</Button>
                </div>
              </div>
            </Modal>
          </CardContent>
        </Card>

        {/* Info Adicional */}
        <Card>
          <CardHeader>
            <CardTitle>Información Adicional</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>RUT o CI</Label>
              <Input placeholder="0" />
            </div>
            <div>
              <Label>GCI Nº</Label>
              <Input placeholder="GCI Nº" />
            </div>
            <div>
              <Label>Tipo de cliente</Label>
              <Select>
                <SelectTrigger>
                  <span>Seleccionar</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residencial">Residencial</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Privilegio</Label>
              <Input placeholder="Ej: VIP" />
            </div>
          </CardContent>
        </Card>

         
      </div>

      <div className="col-span-1">
        {/* Historial */}
        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div>
              <Label>Fecha Alta</Label>
              <Input value="22/04/2013 00:00" readOnly />
            </div>
            <div>
              <Label>Ult. Modificación</Label>
              <Input value="22/04/2013 00:00" readOnly />
            </div>
            <div>
              <Label>Ult. Compra</Label>
              <Input value="/ / 00:00" readOnly />
            </div>
          </CardContent>
        </Card>

        {/* Pedidos Pendientes */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Pedidos Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movil</TableHead>
                  <TableHead>Pedidos</TableHead>
                  <TableHead>C/Atraso</TableHead>
                  <TableHead>Dem.Prom</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Movil 1</TableCell>
                  <TableCell>5</TableCell>
                  <TableCell>2</TableCell>
                  <TableCell>30 min</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Movil 2</TableCell>
                  <TableCell>3</TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>45 min</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
