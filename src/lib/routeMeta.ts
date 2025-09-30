// lib/routeMeta.ts (pequeño registro opcional)
type Meta = { pattern: RegExp; name: string };
export const ROUTE_META: Meta[] = [
  { pattern: /^\/dashboard$/, name: "Dashboard" },
  { pattern: /^\/pedidos\/\d+$/, name: "Detalle de Pedido" },
  { pattern: /^\/usuarios$/, name: "Usuarios" },
];

export function routeName(pathname: string) {
  return ROUTE_META.find((m) => m.pattern.test(pathname))?.name ?? pathname;
}
