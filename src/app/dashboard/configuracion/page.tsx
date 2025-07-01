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

export default function ConfiguracionPage() {
  return (
    <div className="p-4">
      <Tabs defaultValue="departamentos" className="w-full">
        <TabsList>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
          <TabsTrigger value="localidades">Localidades</TabsTrigger>
          <TabsTrigger value="calles">Calles</TabsTrigger>
        </TabsList>

        <TabsContent value="departamentos">
          <Card>
            <CardHeader>
              <CardTitle>Departamentos</CardTitle>
              <CardDescription>Administración de departamentos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Departamentos />
            </CardContent>
            <CardFooter>
              <div>Footer de Departamentos</div>
            </CardFooter>
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
            <CardFooter>
              <div>Footer de Localidades</div>
            </CardFooter>
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
      </Tabs>
    </div>
  );
}