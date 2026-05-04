# Lessons — 20260430-205200-r4t

## Pedido
Auditoría de reads: verificar que todos los paneles/modales/pantallas lean de PostgreSQL.

## Bucket inicial
large-feature (confirmado)

## Resumen del path
triage → analyst (read full codebase) → implementer (1 file) → reviewer → security → qa → ux
Commit: 10262d0 en branch dev

## Patrones detectados

### El repositorio ya estaba en muy buen estado para reads
De 12 pantallas auditadas, 9 ya usaban Prisma correctamente. Solo EditRoleForm tenía
un read activo via GeneXus que podía migrarse.

### GeneXus como fuente intencional
Algunos reads via GeneXus son intencionales y no deben migrarse:
- `apiUsuarios` con `sinMigrar:true` → lista del SGM externo para importar usuarios
- Auth/login → siempre GeneXus por diseño
- `apiMenuDB` (Prisma) vs `apiMenu` (GeneXus) → el menú ya usa Prisma

### Gaps declarados (no migrables en este run)
- `apiEventos` → GeneXus proxy `/eventos` → no hay tabla de eventos en Prisma (GAP)
- Dashboard home stats → datos hardcodeados → requiere tabla de auditoría en Prisma (GAP)

### Mejora de calidad inesperada
Al migrar EditRoleForm, los nombres de funcionalidades ahora se muestran correctamente
(antes eran "Funcionalidad 42" por limitación del endpoint GeneXus /obtenerRol que
no incluía los nombres — el endpoint Prisma sí los incluye via include).

## Métrica clave
- Iteraciones: 1
- Tokens estimados: 113k
- Costo estimado: $0.55
- Arbiter: no
- Escalación humana: no
