"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Permisos() {
  const [search, setSearch] = useState("");
  return (
    <div className="flex items-center justify-between gap-2">
      <Input
        placeholder="Buscar permiso..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
      <Button>Nuevo</Button>
    </div>
  );
}
