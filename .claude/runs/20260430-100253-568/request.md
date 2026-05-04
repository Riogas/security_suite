# Pedido original

en el administracion de usuarios, cuando voy a editar un usuario y voy a la parte de asignar roles, los roles que me aparecen ahi no son los de postgre, son los de la api vieja de genexus, lo cual esta mal, debe cargar siempre los datos de la tabla de postgre, y cuando le asigno un rol, ese rol debe quedar guardado en la tabla de postgre de usuario_roles

# Calidad detectada

bueno

# Bucket inicial (decisión orquestador, sin triage agent disponible)

bug-fix → tirando a small-feature porque toca:
- UI de admin de usuarios (lectura de roles)
- backend / API route (origen de datos: cambiar Genexus → Postgres)
- escritura DB en tabla `usuario_roles` (Prisma)

Pipeline planeado: analyst (investigar código actual) → architect → implementer → code-reviewer → qa-tester. Skip docs, skip ux-validator (cambio principalmente backend, UI cambia poco).

# Acciones tomadas

- Pre-exploración rápida del repo para enmarcar al analyst (paths exactos del módulo afectado).
