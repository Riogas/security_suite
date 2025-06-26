"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Pencil, Trash, Plus } from "lucide-react";

const mockClients = [
  {
    id: 1,
    name: "Julio Gómez",
    address: "Montevideo, Uruguay",
    phone: "099 123 456",
    status: "activo",
  },
  {
    id: 2,
    name: "Laura Pérez",
    address: "Canelones, Uruguay",
    phone: "092 555 888",
    status: "pasivo",
  },
  {
    id: 3,
    name: "Carlos Rodríguez",
    address: "Maldonado, Uruguay",
    phone: "098 111 222",
    status: "activo",
  },
];

export default function ClientesPage() {
  const [clients, setClients] = useState(mockClients);

  return (
    <div className="p-4 space-y-6">
      {/* Filtros y botón */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Input placeholder="Buscar por nombre..." />
        <Input placeholder="Buscar por teléfono..." />
        <div className="flex items-center justify-between gap-2">
          <Select>
            <SelectTrigger>
              <span>Filtrar por estado</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="pasivo">Pasivo</SelectItem>
            </SelectContent>
          </Select>

          <Button className="ml-auto">
            <Plus className="w-4 h-4 mr-2" />
            Crear Cliente
          </Button>
        </div>
      </motion.div>

      {/* Tabla */}
      <Card className="overflow-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Acciones</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="text-left space-x-2">
                    <Button variant="outline" size="sm">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="sm">
                      <Trash className="w-4 h-4" />
                    </Button>
                  </TableCell>
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.address}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        client.status === "activo" ? "secondary" : "destructive"
                      }
                      className={client.status === "pasivo" ? "opacity-70" : ""}
                    >
                      {client.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      </Card>

      {/* Footer y paginación */}
      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </motion.div>
    </div>
  );
}
