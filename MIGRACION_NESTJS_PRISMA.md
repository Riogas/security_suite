# Migración a NestJS + Prisma + PostgreSQL

## Resumen

Migración del backend actual (GeneXus via proxy) a un backend propio con **NestJS** + **Prisma ORM** + **PostgreSQL**.

---

## 1. Arquitectura Propuesta

```
┌─────────────────────┐       ┌─────────────────────┐       ┌──────────────┐
│   Next.js Frontend  │──────▶│   NestJS Backend     │──────▶│  PostgreSQL   │
│   (Puerto 3001)     │ HTTP  │   (Puerto 4000)      │ Prisma│  (Puerto 5432)│
│   /api/* proxy      │       │   /api/v1/*           │       │              │
└─────────────────────┘       └─────────────────────┘       └──────────────┘
```

- **Next.js**: Frontend (ya existente). El proxy `/api/*` redirigirá a NestJS en vez de GeneXus.
- **NestJS**: API REST con autenticación JWT, validación con `class-validator`, y acceso a datos via Prisma.
- **Prisma**: ORM que genera tipos TypeScript automáticos y maneja migraciones de esquema.
- **PostgreSQL**: Base de datos principal.

---

## 2. Estructura del Backend (carpeta `backend/`)

```
backend/
├── prisma/
│   ├── schema.prisma          # Esquema de Prisma (modelos, relaciones)
│   └── migrations/            # Migraciones auto-generadas
├── src/
│   ├── main.ts                # Entry point NestJS
│   ├── app.module.ts          # Módulo raíz
│   ├── prisma/
│   │   ├── prisma.module.ts   # Módulo Prisma global
│   │   └── prisma.service.ts  # Servicio Prisma (singleton)
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts # POST /auth/login
│   │   ├── auth.service.ts    # Lógica de autenticación
│   │   └── jwt.strategy.ts    # Estrategia JWT Passport
│   ├── usuarios/
│   │   ├── usuarios.module.ts
│   │   ├── usuarios.controller.ts
│   │   ├── usuarios.service.ts
│   │   └── dto/
│   │       ├── create-usuario.dto.ts
│   │       └── update-usuario.dto.ts
│   ├── aplicaciones/
│   │   ├── aplicaciones.module.ts
│   │   ├── aplicaciones.controller.ts
│   │   ├── aplicaciones.service.ts
│   │   └── dto/
│   ├── roles/
│   │   ├── roles.module.ts
│   │   ├── roles.controller.ts
│   │   ├── roles.service.ts
│   │   └── dto/
│   ├── funcionalidades/
│   │   ├── funcionalidades.module.ts
│   │   ├── funcionalidades.controller.ts
│   │   ├── funcionalidades.service.ts
│   │   └── dto/
│   ├── accesos/
│   │   ├── accesos.module.ts
│   │   ├── accesos.controller.ts
│   │   ├── accesos.service.ts
│   │   └── dto/
│   └── common/
│       ├── guards/
│       │   └── jwt-auth.guard.ts
│       ├── decorators/
│       └── interceptors/
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env
```

---

## 3. Mapeo de Tablas: GeneXus → PostgreSQL

### 3.1 `usuarios` (antes `UserExtended`)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| UserExtendedId | id | SERIAL PK | Auto-incremental |
| UserExtendedUserName | username | VARCHAR(60) | UNIQUE, NOT NULL |
| UserExtendedPassword | password | VARCHAR(255) | Hash bcrypt |
| UserExtendedEmail | email | VARCHAR(120) | UNIQUE |
| UserExtendedNombre | nombre | VARCHAR(60) | |
| UserExtendedApellido | apellido | VARCHAR(60) | |
| UserExtendedEstado | estado | CHAR(1) | 'A'ctivo / 'I'nactivo |
| UserExtendedFchIns | fecha_creacion | TIMESTAMP | DEFAULT NOW() |
| UserExtendedFchBaja | fecha_baja | TIMESTAMP | NULL |
| UserExtendedFchUltLog | fecha_ultimo_login | TIMESTAMP | NULL |
| UserExtendedExterno | es_externo | CHAR(1) | 'S'/'N' |
| UserExtendedUserExterno | usuario_externo | VARCHAR(60) | NULL |
| UserExtendedTipoUser | tipo_usuario | CHAR(1) | 'L'ocal / 'E'xterno |
| UserExtendedModPerm | modifica_permisos | CHAR(1) | 'S'/'N' |
| UserExtendedCambioPass | cambio_password | CHAR(1) | 'S'/'N' |
| UserExtendedCantFall | intentos_fallidos | INTEGER | DEFAULT 0 |
| UserExtendedFchUltBloq | fecha_ultimo_bloqueo | TIMESTAMP | NULL |
| UserExtendedTelefono | telefono | VARCHAR(40) | NULL |
| UserExtendedCreadoPor | creado_por | VARCHAR(60) | NULL |
| UserExtendedDesdeSistema | desde_sistema | CHAR(1) | 'S'/'N' |
| UserExtendedEsRoot | es_root | CHAR(1) | 'S'/'N' |
| UserExtendedFchUltPerm | fecha_ultimo_permiso | TIMESTAMP | NULL |
| UserExtendedObservacion | observacion | TEXT | NULL |
| UserExtendedObservacion2 | observacion2 | TEXT | NULL |

### 3.2 `usuario_preferencias` (antes Atributos/UserPreference)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| UserPreferenceId | id | SERIAL PK | Auto-incremental |
| UserExtendedId | usuario_id | INTEGER FK | → usuarios.id |
| UserPreferenceAtributo | atributo | VARCHAR(60) | NOT NULL |
| UserPreferenceValor | valor | VARCHAR(255) | |

### 3.3 `roles` (tabla existente en el sistema GeneXus)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| RolId | id | SERIAL PK | Auto-incremental |
| AplicacionId | aplicacion_id | INTEGER FK | → aplicaciones.id |
| RolNombre | nombre | VARCHAR(60) | NOT NULL |
| RolDescripcion | descripcion | VARCHAR(120) | |
| RolEstado | estado | CHAR(1) | 'A'/'I' |
| RolNivel | nivel | INTEGER | DEFAULT 0 |
| RolFchIns | fecha_creacion | TIMESTAMP | DEFAULT NOW() |
| RolCreadoEn | creado_en | VARCHAR(60) | |

### 3.4 `usuario_roles` (antes UsuarioRol)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| UserExtendedId | usuario_id | INTEGER FK | → usuarios.id, PK compuesta |
| RolId | rol_id | INTEGER FK | → roles.id, PK compuesta |
| UsuarioRolFchDesde | fecha_desde | DATE | NULL |
| UsuarioRolFchHasta | fecha_hasta | DATE | NULL |

### 3.5 `aplicaciones` (antes Aplicacion)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| AplicacionId | id | SERIAL PK | Auto-incremental |
| AplicacionNombre | nombre | VARCHAR(60) | NOT NULL |
| AplicacionDescripcion | descripcion | VARCHAR(120) | |
| AplicacionEstado | estado | CHAR(1) | 'A'/'I' |
| AplicacionUrl | url | VARCHAR(120) | |
| AplicacionTecnologia | tecnologia | VARCHAR(60) | |
| AplicacionFchIns | fecha_creacion | TIMESTAMP | DEFAULT NOW() |
| AplicacionSistemaId | sistema_id | INTEGER | NULL |

### 3.6 `funcionalidades` (antes Funcionalidad)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| FuncionalidadId | id | SERIAL PK | Auto-incremental |
| AplicacionId | aplicacion_id | INTEGER FK | → aplicaciones.id |
| FuncionalidadNombre | nombre | VARCHAR(60) | NOT NULL |
| FuncionalidadEstado | estado | CHAR(1) | 'A'/'I' |
| FuncionalidadFchIns | fecha_creacion | TIMESTAMP | DEFAULT NOW() |
| FuncionalidadEsPublico | es_publico | CHAR(1) | 'S'/'N' |
| FuncionalidadSoloRoot | solo_root | CHAR(1) | 'S'/'N' |
| FuncionalidadFchDesde | fecha_desde | DATE | NULL |
| FuncionalidadFchHasta | fecha_hasta | DATE | NULL |

### 3.7 `acciones` (tabla de referencia para tipos de acción)

| Campo | Tipo PostgreSQL | Notas |
|---|---|---|
| id | SERIAL PK | Auto-incremental |
| nombre | VARCHAR(60) | NOT NULL, ej: 'Ver', 'Crear' |
| descripcion | VARCHAR(120) | |
| estado | CHAR(1) | 'A'/'I' |

### 3.8 `funcionalidad_acciones` (antes FuncionalidadAccion / Accion)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| ObjetoId | funcionalidad_id | INTEGER FK | → funcionalidades.id, PK compuesta |
| AccionId | accion_id | INTEGER FK | → acciones.id, PK compuesta |

### 3.9 `accesos` (antes Accesos)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| FuncionalidadId | funcionalidad_id | INTEGER FK | → funcionalidades.id, PK compuesta |
| UserExtendedId | usuario_id | INTEGER FK | → usuarios.id, PK compuesta |
| AccesosEfecto | efecto | VARCHAR(20) | 'ALLOW'/'DENY' |
| AccesosCreadoEn | creado_en | VARCHAR(40) | |
| AccesosFchDesde | fecha_desde | TIMESTAMP | NULL |
| AccesosFchHasta | fecha_hasta | TIMESTAMP | NULL |

### 3.10 `rol_funcionalidades` (antes RolFuncionalidad)

| Campo GeneXus | Campo PostgreSQL | Tipo PostgreSQL | Notas |
|---|---|---|---|
| RolId | rol_id | INTEGER FK | → roles.id, PK compuesta |
| FuncionalidadId | funcionalidad_id | INTEGER FK | → funcionalidades.id, PK compuesta |
| RolFuncionalidadFchIns | fecha_creacion | TIMESTAMP | DEFAULT NOW() |

---

## 4. Mapeo de API endpoints: GeneXus → NestJS

| API actual (GeneXus) | Endpoint NestJS | Método | Descripción |
|---|---|---|---|
| `/loginUser` | `POST /auth/login` | POST | Login con JWT |
| `/Menu` | `POST /menu` | POST | Menú por aplicación |
| `/usuarios` | `GET /usuarios` | GET | Listar usuarios (paginado) |
| `/usuarios` | `POST /usuarios` | POST | Crear usuario |
| `/usuarios/:id` | `PUT /usuarios/:id` | PUT | Editar usuario |
| `/importarUsuario` | `POST /usuarios/importar` | POST | Importar usuario externo |
| `/getAtributos` | `GET /usuarios/:id/atributos` | GET | Atributos de usuario |
| `/ABMAtributos` | `PUT /usuarios/:id/atributos` | PUT | Guardar atributos |
| `/getRolUsuario` | `GET /usuarios/:id/roles` | GET | Roles de un usuario |
| `/setRol` | `PUT /usuarios/:id/roles` | PUT | Asignar roles |
| `/aplicaciones` | `GET /aplicaciones` | GET | Listar aplicaciones |
| `/aplicaciones` | `POST /aplicaciones` | POST | Crear aplicación |
| `/roles` | `GET /roles` | GET | Listar roles |
| `/abmRoles` | `POST /roles` | POST | Crear/editar rol |
| `/obtenerRol` | `GET /roles/:id` | GET | Obtener un rol |
| `/listarFuncionalidades` | `GET /funcionalidades` | GET | Listar funcionalidades |
| `/abmFuncionalidades` | `POST /funcionalidades` | POST | Crear/editar funcionalidad |
| `/listarObjetos` | `GET /objetos` | GET | Listar objetos |
| `/abmObjetos` | `POST /objetos` | POST | Crear/editar objeto |
| `/accesos` | `GET /accesos` | GET | Listar accesos |
| `/Permisos` | `POST /permisos/validar` | POST | Validar permiso |
| `/getRoles` | `GET /roles/mis-roles` | GET | Roles del usuario actual |

---

## 5. Dependencias NestJS (backend/package.json)

```json
{
  "dependencies": {
    "@nestjs/common": "^11.x",
    "@nestjs/core": "^11.x",
    "@nestjs/platform-express": "^11.x",
    "@nestjs/jwt": "^11.x",
    "@nestjs/passport": "^11.x",
    "@prisma/client": "^6.x",
    "passport": "^0.7.x",
    "passport-jwt": "^4.x",
    "bcrypt": "^5.x",
    "class-validator": "^0.14.x",
    "class-transformer": "^0.5.x"
  },
  "devDependencies": {
    "prisma": "^6.x",
    "@types/bcrypt": "^5.x",
    "@types/passport-jwt": "^4.x"
  }
}
```

---

## 6. Variables de entorno necesarias

```env
# backend/.env
DATABASE_URL="postgresql://usuario:password@localhost:5432/security_suite?schema=public"
JWT_SECRET="cambiar-por-un-secreto-seguro"
JWT_EXPIRATION="7d"
PORT=4000
```

---

## 7. Pasos de implementación

1. **Crear base PostgreSQL**: Ejecutar `database/init.sql`
2. **Inicializar NestJS**: `nest new backend` dentro del workspace
3. **Configurar Prisma**: `npx prisma init` → copiar `schema.prisma`
4. **Generar migraciones**: `npx prisma migrate dev --name init`
5. **Crear módulos NestJS**: Usuarios, Aplicaciones, Roles, Funcionalidades, Accesos, Auth
6. **Actualizar proxy Next.js**: Redirigir `/api/*` al NestJS en vez de GeneXus
7. **Migrar datos**: Script de migración de datos desde GeneXus a PostgreSQL
8. **Actualizar frontend**: Adaptar los llamados de `services/api.ts` si cambian los contratos

---

## 8. Cambios en el Frontend (Next.js)

El proxy en `src/app/api/[...proxy]/route.ts` solo necesita cambiar `BACKEND_BASE_URL` para apuntar al NestJS:

```env
BACKEND_BASE_URL=http://localhost:4000
```

Si las respuestas del NestJS mantienen el mismo formato JSON que GeneXus, **el frontend no necesita cambios**. Si se normalizan los nombres de campos en las respuestas, habrá que actualizar los componentes que consumen esos datos.
