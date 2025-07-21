import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Departamentos from "@/components/configuracion/Departamentos";
import Localidades from "@/components/configuracion/Localidades";
import Calles from "@/components/configuracion/Calles";
import Usuarios from "@/components/configuracion/Usuarios";
import Roles from "@/components/configuracion/Roles";
import Permisos from "@/components/configuracion/Permisos";
import Zonificacion from "@/components/configuracion/Zonificacion";
import TiposCapa from "@/components/configuracion/TiposCapa";
import Capa from "@/components/configuracion/Capa";
import Zona from "@/components/configuracion/Zona";
import Puestos from "@/components/configuracion/Puestos";

export default function ConfiguracionPage() {
  return (
    <div className="p-4">
      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
          <TabsTrigger value="localidades">Localidades</TabsTrigger>
          <TabsTrigger value="calles">Calles</TabsTrigger>
          <TabsTrigger value="zonificacion">Zonificación</TabsTrigger>
          <TabsTrigger value="puestos">Puestos</TabsTrigger>
          <TabsTrigger value="tipos-capa">Tipos de Capa</TabsTrigger>
          <TabsTrigger value="capas">Capas</TabsTrigger>
          <TabsTrigger value="zonas">Zonas</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <CardTitle>Usuarios</CardTitle>
              <CardDescription>Administración de usuarios.</CardDescription>
            </CardHeader>
            <CardContent>
              <Usuarios />
            </CardContent>
            <CardFooter>
              <div>Footer de Usuarios</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <CardDescription>Administración de roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <Roles />
            </CardContent>
            <CardFooter>
              <div>Footer de Roles</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="permisos">
          <Card>
            <CardHeader>
              <CardTitle>Permisos</CardTitle>
              <CardDescription>Administración de permisos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Permisos />
            </CardContent>
            <CardFooter>
              <div>Footer de Permisos</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="departamentos">
          <Card>
            <CardHeader>
              <CardTitle>Departamentos</CardTitle>
              <CardDescription>
                Administración de departamentos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Departamentos />
            </CardContent>
            <CardFooter></CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="localidades">
          <Card>
            <CardHeader>
              <CardTitle>Localidades</CardTitle>
              <CardDescription>Administración de localidades.</CardDescription>
            </CardHeader>
            <CardContent>
              <Localidades />
            </CardContent>
            <CardFooter></CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="calles">
          <Card>
            <CardHeader>
              <CardTitle>Calles</CardTitle>
              <CardDescription>Administración de calles.</CardDescription>
            </CardHeader>
            <CardContent>
              <Calles />
            </CardContent>
            <CardFooter>
              <div>Footer de Calles</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="zonificacion">
          <Card>
            <CardHeader>
              <CardTitle>Zonificación</CardTitle>
              <CardDescription>Administración de zonificación.</CardDescription>
            </CardHeader>
            <CardContent>
              <Zonificacion />
            </CardContent>
            <CardFooter>
              <div>Footer de Zonificación</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="puestos">
          <Card>
            <CardHeader>
              <CardTitle>Puestos</CardTitle>
              <CardDescription>Administración de puestos de trabajo.</CardDescription>
            </CardHeader>
            <CardContent>
              <Puestos />
            </CardContent>
            <CardFooter>
              <div>Footer de Puestos</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="tipos-capa">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Capa</CardTitle>
              <CardDescription>Administración de tipos de capas del mapa.</CardDescription>
            </CardHeader>
            <CardContent>
              <TiposCapa />
            </CardContent>
            <CardFooter>
              <div>Footer de Tipos de Capa</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="capas">
          <Card>
            <CardHeader>
              <CardTitle>Capas</CardTitle>
              <CardDescription>Administración de capas del mapa.</CardDescription>
            </CardHeader>
            <CardContent>
              <Capa />
            </CardContent>
            <CardFooter>
              <div>Footer de Capas</div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="zonas">
          <Card>
            <CardHeader>
              <CardTitle>Zonas</CardTitle>
              <CardDescription>Administración de zonas geográficas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Zona />
            </CardContent>
            <CardFooter>
              <div>Footer de Zonas</div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
