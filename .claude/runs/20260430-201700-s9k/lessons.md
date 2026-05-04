# Lessons — 20260430-201700-s9k

## Pedido
Dual-write CRUD: security suite debe llenar tablas PostgreSQL y seguir apuntando a GeneXus.

## Bucket inicial
large-feature (correcto — pero el scope real fue ~40 LOC en 3 archivos)

## Resumen del path
triage(35s) → analyst(90s) → architect(45s) → implementer(180s) → reviewer(30s) → security(20s) → qa(25s)
Total: ~7 minutos de pipeline

## Patrones detectados

- **Leer el código antes de asumir el scope:** El request asumia que los CRUDs iban a GeneXus. La lectura real mostro que el 90% ya estaba en DB. Esto redujo el scope de ~300 LOC a ~40 LOC netos.
- **onSubmit ignorado es un bug silencioso:** RoleForm tenia un prop `onSubmit` que declaraba pero nunca llamaba. Esto dejaba dead code en EditRoleForm. El fix fue hacer que handleSubmit en RoleForm llame `onSubmit` con la data + funcionalidades, delegando el post-process al padre.
- **fire-and-forget pattern:** Para dual-write no bloqueante, el patron dualWriteFireForget() es limpio y reutilizable. Conviene tenerlo en api.ts para futuros usos.

## Métrica clave
- Iteraciones: 1 (approved en primera vuelta)
- Costo estimado: $0.43
- ¿Hubo escalación al arbiter?: no
- ¿Hubo escalación al humano?: no
- ¿Build paso?: si — TypeScript limpio
