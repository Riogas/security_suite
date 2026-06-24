# Diseño: Menu Builder + reestructura de Objetos

- **Fecha:** 2026-06-24
- **Proyecto:** security_suite (secapi)
- **Estado:** Aprobado para implementación ("hacelo todo")

## 1. Problema

Hoy el árbol de navegación está mezclado dentro de "Objetos": un objeto MENU/SUBMENU
guarda *acciones* que vía el campo `relacion` (id de otro objeto) apuntan a sus hijos.
Armar el menú implica crear varios objetos planos + enlaces crípticos (relación, código
hash), sin ver el árbol resultante. Es confuso y propenso a error.

## 2. Arquitectura (separación de responsabilidades)

- **Objetos = catálogo de recursos** → solo **PAGE** y **FEATURE**. Cada uno con
  `key`, `path` real, `label`, `icon`, `estado`, `esPublico` y sus **acciones de
  permiso** (view/create/edit/delete/export). Ya **no** se crean MENU/SUBMENU acá ni
  se usa la columna "Relación".
- **Menu Builder (`/dashboard/menu`) = estructura de navegación** → los **MENU** y
  **SUBMENU**. Árbol visual; cada nodo hoja referencia una Page/Feature del catálogo.
  Bajo el capó crea objetos MENU/SUBMENU + ObjetoAcciones (con `relacion` y `codigo`
  auto), pero oculto al usuario.

Mapeo al modelo de datos (oculto):
- Nodo **GROUP** = Objeto tipo MENU (raíz). Sus hijos = sus ObjetoAcciones.
- Nodo **SUBMENU** = ObjetoAccion del padre (relacion → objeto SUBMENU) + el objeto
  SUBMENU que contiene el siguiente nivel.
- Nodo **LINK** = ObjetoAccion del padre con relacion → objeto PAGE/FEATURE. Hoja.

## 3. Decisiones acordadas

- **Borrado de nodo:** soft. Quita la ObjetoAccion (el punto del menú) y marca el
  objeto contenedor (MENU/SUBMENU) como `estado="I"`. No toca objetos PAGE/FEATURE
  (se administran en Objetos). Preserva integridad con funcionalidades/accesos.
- **Permisos:** fuera de v1. El builder arma estructura; el gateo sigue en
  Funcionalidades/Roles/Asignar.
- **Ubicación:** `/dashboard/menu` (el botón "Administrar Menú" de Objetos ya apunta ahí).
- **FEATURE en el árbol:** sí puede colocarse como LINK (igual que PAGE).

## 4. Backend

### `GET /api/db/menu/builder?aplicacionId=`
Devuelve el árbol editable de la app: nodos GROUP/SUBMENU/LINK con sus ids
(objetoId del contenedor, objetoAccionId del punto, targetObjetoId del recurso),
label/path/icon/key/estado/orden. Además, el catálogo de PAGE/FEATURE disponibles
para referenciar (`recursos`).

### `PUT /api/db/menu/builder`
Body: `{ aplicacionId, tree: BuilderNode[] }`. Reconciliación en **transacción**:
1. Upsert de objetos contenedores (MENU para GROUP, SUBMENU para SUBMENU) con
   key/label/icon/estado/orden; `parentId` según jerarquía.
2. Para cada contenedor, reconstruye sus ObjetoAcciones para reflejar los hijos en
   orden: cada LINK/SUBMENU → una acción con `key`, `label`, `path`, `icon`,
   `relacion`=targetObjetoId (o el id del objeto SUBMENU), `codigo`=hash(contKey|childKey).
3. Soft-delete: contenedores/acciones que ya no están → acción borrada; objeto
   contenedor huérfano → `estado="I"`. PAGE/FEATURE intactos.

`BuilderNode`:
```ts
{
  nodeKind: "GROUP" | "SUBMENU" | "LINK",
  objetoId?: number,        // contenedor (GROUP/SUBMENU) existente
  objetoAccionId?: number,  // punto de menú existente (para SUBMENU/LINK)
  key: string,
  label: string,
  path: string,
  icon: string,
  estado: "A" | "I",
  targetObjetoId?: number | null,  // LINK → PAGE/FEATURE referenciado
  children?: BuilderNode[],
}
```

## 5. Frontend

### `/dashboard/menu` — Menu Builder (nuevo)
- Selector de aplicación.
- Árbol con drag para anidar/reordenar (`@dnd-kit`, ya en el repo).
- Acciones: agregar Grupo / Submenú / Página(LINK); editar nodo (modal con
  label/icon/path/estado y, para LINK, selector de Page/Feature del catálogo);
  borrar (soft).
- Botón "Guardar" → `PUT` con el árbol completo; toast + recarga.

### Objetos — alta (`ObjetoForm`) reestructurada
- Solo **PAGE/FEATURE** (sin MENU/SUBMENU, sin columna Relación).
- Campos del objeto: aplicación, tipo (PAGE/FEATURE), key, **path**, **label**,
  **icon**, **order**, estado, esPúblico. **Fix:** estos campos hoy se guardan en
  estado pero no se mandan en el payload → se corrige (incluirlos en create/update).
- Tabla de **acciones de permiso** con botón explícito "Agregar acción" y plantillas
  rápidas (view/create/edit/delete/export); `codigo` como detalle (no columna
  protagonista); sin "Relación".

### Objetos — listado
- Enfocado en PAGE/FEATURE; columna+filtro de Aplicación (ya hechos); toque visual.

### Listado de menús
- Lo absorbe el Builder (la vista de árbol por aplicación es la "lista de menús").

## 6. Capa visual

Respeta el design system (Radix + Tailwind + `ModalShell`/`DataTable`/`BadgeEstado`,
paleta y tipografía actuales) y agrega toques llamativos con mesura:
- Header con acento/gradiente por sección.
- Chips de color por tipo de nodo (MENU/SUBMENU/PAGE/FEATURE).
- Micro-animaciones (Framer Motion) al expandir/colapsar/arrastrar.
- Estados vacíos cuidados.
Se apoya en el skill ui-ux-pro-max para coherencia.

## 7. Fases de implementación

1. **Backend**: endpoint builder (GET/PUT) + helper de código server-side.
2. **Menu Builder UI**: `/dashboard/menu` + wrappers en `api.ts`.
3. **Objetos alta**: reestructura PAGE/FEATURE + fix de campos no persistidos.
4. **Objetos listado + capa visual**.

Fuera de alcance v1: gestión de permisos desde el builder; árbol multi-MENU complejo
con el mismo objeto en dos ramas (se soporta un objeto contenedor por nodo).
