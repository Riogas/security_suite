// src/app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Panel Principal</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Usuarios Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">245</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Órdenes del Día</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">68</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingresos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">$12.430</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
