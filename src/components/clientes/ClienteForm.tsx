'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import dynamic from 'next/dynamic';

// Cargamos el mapa dinámicamente (por ahora sin SSR)
const Mapa = dynamic(() => import('@/components/mapa/OpenStreetMap'), { ssr: false });

interface ClienteFormProps {
  clienteId?: string;
}

export default function ClienteForm({ clienteId }: ClienteFormProps) {
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
      {/* Acciones */}
      <div className="col-span-full flex justify-end gap-4 mb-6">
        <Button variant="outline" className="flex items-center gap-2">
          <span>Cancelar</span>
        </Button>
        <Button className="flex items-center gap-2" onClick={() => setLoading(true)}>
          <span>Guardar Cliente</span>
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500"></div>
          )}
        </Button>
      </div>

      <div className="col-span-4 space-y-6">
        {/* Información Básica */}
        <Card>
          <CardHeader>
            <CardTitle>Información Básica</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Primera línea */}
            <div>
              <Label>Teléfono</Label>
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
            <div>
              <Label>RUT o CI</Label>
              <Input placeholder="0" />
            </div>
            <div>
              <Label>Email</Label>
              <Input placeholder="example@mail.com" />
            </div>
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Teléfono</Label>
              <Input placeholder="099123456" />
            </div>
            <div>
              <Label>Teléfono alternativo</Label>
              <Input placeholder="092123456" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="cliente@mail.com" />
            </div>
          </CardContent>
        </Card>

        {/* Dirección + Mapa */}
        <Card>
          <CardHeader>
            <CardTitle>Dirección y Geolocalización</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Calle principal</Label>
              <Input placeholder="Ej: Av. Italia" />
            </div>
            <div>
              <Label>Número</Label>
              <Input placeholder="1234" />
            </div>
            <div>
              <Label>Bis</Label>
              <Switch />
            </div>
            <div>
              <Label>Ciudad</Label>
              <Input placeholder="Montevideo" />
            </div>
            <div>
              <Label>Departamento</Label>
              <Input placeholder="Montevideo" />
            </div>
            <div>
              <Label>Coordenadas</Label>
              <Input value={coords.lat + ', ' + coords.lng} readOnly />
            </div>
            <div className="col-span-full">
              <Mapa onChange={setCoords} />
            </div>
          </CardContent>
        </Card>

        {/* Clasificación */}
        <Card>
          <CardHeader>
            <CardTitle>Clasificación</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      <div className="col-span-1">
        {/* Información Adicional */}
        <Card>
          <CardHeader>
            <CardTitle>Información Adicional</CardTitle>
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
