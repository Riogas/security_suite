'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import dynamic from 'next/dynamic';

// Cargamos el mapa dinámicamente (por ahora sin SSR)
const Mapa = dynamic(() => import('@/components/mapa/OpenStreetMap'), { ssr: false });

interface ClienteFormProps {
  clienteId?: string;
}

export default function ClienteForm({ clienteId }: ClienteFormProps) {
  const [coords, setCoords] = useState({ lat: '', lng: '' });

  return (
    <div className="p-6 space-y-6">
      {/* Información Básica */}
      <Card>
        <CardHeader>
          <CardTitle>Información Básica</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nombre</Label>
            <Input placeholder="Juan Pérez" />
          </div>
          <div>
            <Label>Tipo de Documento</Label>
            <Select>
              <SelectTrigger>
                <span>Seleccionar</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ci">Cédula</SelectItem>
                <SelectItem value="rut">RUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Documento</Label>
            <Input placeholder="12345678-9" />
          </div>
          <div>
            <Label>Estado</Label>
            <Select>
              <SelectTrigger>
                <span>Activo</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
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

      {/* Acciones */}
      <div className="flex justify-end gap-4">
        <Button variant="outline">Cancelar</Button>
        <Button>Guardar Cliente</Button>
      </div>
    </div>
  );
}
