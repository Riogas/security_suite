"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiSyncUsuarios } from "@/services/api";

interface SyncResult {
  success: boolean;
  mensaje: string;
  total: number;
  creados: number;
  actualizados: number;
  errores: number;
  detallesErrores: { username: string; error: string }[];
}

interface SyncUsuariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export default function SyncUsuariosModal({
  isOpen,
  onClose,
  onSyncComplete,
}: SyncUsuariosModalProps) {
  const [userName, setUserName] = useState("");
  const [desde, setDesde] = useState("SGM");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiSyncUsuarios({ UserName: userName.trim(), Desde: desde.trim() || "SGM" });
      setResult(res);
      if (res.success) {
        if (res.errores === 0) {
          toast.success(res.mensaje);
        } else {
          toast.warning(`Sincronización con ${res.errores} error(es). Revisá los detalles.`);
        }
        onSyncComplete?.();
      } else {
        toast.error("Error en la sincronización");
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setResult(null);
    setUserName("");
    setDesde("SGM");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Importación masiva de usuarios
          </DialogTitle>
          <DialogDescription>
            Sincroniza usuarios desde el sistema SGM hacia la base de datos local.
            Dejá el campo Usuario vacío para importar todos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sync-username">Usuario (opcional)</Label>
              <Input
                id="sync-username"
                placeholder="Dejar vacío para todos"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Username o documento para importar uno específico
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-desde">Sistema origen</Label>
              <Input
                id="sync-desde"
                placeholder="SGM"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Resultado */}
          {result && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                {result.errores === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                )}
                <span className="font-medium text-sm">{result.mensaje}</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center rounded-md bg-muted p-3">
                  <span className="text-2xl font-bold text-green-600">{result.creados}</span>
                  <span className="text-xs text-muted-foreground mt-1">Creados</span>
                </div>
                <div className="flex flex-col items-center rounded-md bg-muted p-3">
                  <span className="text-2xl font-bold text-blue-600">{result.actualizados}</span>
                  <span className="text-xs text-muted-foreground mt-1">Actualizados</span>
                </div>
                <div className="flex flex-col items-center rounded-md bg-muted p-3">
                  <span className="text-2xl font-bold text-red-600">{result.errores}</span>
                  <span className="text-xs text-muted-foreground mt-1">Errores</span>
                </div>
              </div>

              {result.detallesErrores?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Detalle de errores
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded border p-2 bg-muted/40">
                    {result.detallesErrores.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                        <span>
                          <span className="font-mono font-medium">{e.username}</span>
                          {" — "}
                          <span className="text-muted-foreground break-all">
                            {e.error?.replace(/`[^`]*TURBOPACK[^`]*`/g, "`prisma`").split("\n").pop()?.trim() || e.error}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          <Button onClick={handleSync} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {result ? "Sincronizar de nuevo" : "Sincronizar"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
