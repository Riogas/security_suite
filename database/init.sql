-- =============================================
-- Security Suite - PostgreSQL Init Script
-- Migración desde GeneXus (UserExtended, etc.)
-- Ejecutar sobre la base de datos: securitysuite
-- =============================================

-- =============================================
-- 1. TABLA: aplicaciones (antes Aplicacion)
-- =============================================
CREATE TABLE IF NOT EXISTS aplicaciones (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(60)  NOT NULL,
    descripcion     VARCHAR(120),
    estado          CHAR(1)      NOT NULL DEFAULT 'A',   -- 'A'ctivo / 'I'nactivo
    url             VARCHAR(120),
    tecnologia      VARCHAR(60),
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),
    sistema_id      INTEGER                               -- Referencia a sistema externo
);

COMMENT ON TABLE aplicaciones IS 'Aplicaciones registradas en el sistema de seguridad';
COMMENT ON COLUMN aplicaciones.estado IS 'A = Activo, I = Inactivo';

-- =============================================
-- 2. TABLA: usuarios (antes UserExtended)
-- =============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id                    SERIAL PRIMARY KEY,
    username              VARCHAR(60)  NOT NULL UNIQUE,
    password              VARCHAR(255) NOT NULL,           -- Hash bcrypt
    email                 VARCHAR(120) UNIQUE,
    nombre                VARCHAR(60),
    apellido              VARCHAR(60),
    estado                CHAR(1)      NOT NULL DEFAULT 'A',  -- 'A'ctivo / 'I'nactivo
    fecha_creacion        TIMESTAMP    NOT NULL DEFAULT NOW(),
    fecha_baja            TIMESTAMP,
    fecha_ultimo_login    TIMESTAMP,
    es_externo            CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    usuario_externo       VARCHAR(60),
    tipo_usuario          CHAR(1)      NOT NULL DEFAULT 'L',  -- 'L'ocal / 'E'xterno
    modifica_permisos     CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    cambio_password       CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    intentos_fallidos     INTEGER      NOT NULL DEFAULT 0,
    fecha_ultimo_bloqueo  TIMESTAMP,
    telefono              VARCHAR(40),
    creado_por            VARCHAR(60),
    desde_sistema         CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    es_root               CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    fecha_ultimo_permiso  TIMESTAMP,
    observacion           TEXT,
    observacion2          TEXT
);

COMMENT ON TABLE usuarios IS 'Usuarios del sistema (migrado de UserExtended)';
COMMENT ON COLUMN usuarios.estado IS 'A = Activo, I = Inactivo';
COMMENT ON COLUMN usuarios.tipo_usuario IS 'L = Local, E = Externo';
COMMENT ON COLUMN usuarios.es_root IS 'S = Es superusuario, N = No';

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_estado ON usuarios(estado);

-- =============================================
-- 3. TABLA: usuario_preferencias (antes Atributos/UserPreference)
-- =============================================
CREATE TABLE IF NOT EXISTS usuario_preferencias (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    atributo    VARCHAR(60)  NOT NULL,
    valor       VARCHAR(255)
);

COMMENT ON TABLE usuario_preferencias IS 'Preferencias/atributos personalizados por usuario';

CREATE INDEX idx_usuario_preferencias_usuario ON usuario_preferencias(usuario_id);

-- =============================================
-- 4. TABLA: roles
-- =============================================
CREATE TABLE IF NOT EXISTS roles (
    id              SERIAL PRIMARY KEY,
    aplicacion_id   INTEGER      NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
    nombre          VARCHAR(60)  NOT NULL,
    descripcion     VARCHAR(120),
    estado          CHAR(1)      NOT NULL DEFAULT 'A',  -- 'A'ctivo / 'I'nactivo
    nivel           INTEGER      NOT NULL DEFAULT 0,
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),
    creado_en       VARCHAR(60)
);

COMMENT ON TABLE roles IS 'Roles de seguridad por aplicación';

CREATE INDEX idx_roles_aplicacion ON roles(aplicacion_id);
CREATE INDEX idx_roles_estado ON roles(estado);

-- =============================================
-- 5. TABLA: usuario_roles (antes UsuarioRol)
-- =============================================
CREATE TABLE IF NOT EXISTS usuario_roles (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol_id        INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    fecha_desde   DATE,
    fecha_hasta   DATE,
    PRIMARY KEY (usuario_id, rol_id)
);

COMMENT ON TABLE usuario_roles IS 'Asignación de roles a usuarios';

CREATE INDEX idx_usuario_roles_rol ON usuario_roles(rol_id);

-- =============================================
-- 6. TABLA: funcionalidades (antes Funcionalidad)
-- =============================================
CREATE TABLE IF NOT EXISTS funcionalidades (
    id              SERIAL PRIMARY KEY,
    aplicacion_id   INTEGER      NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
    nombre          VARCHAR(60)  NOT NULL,
    estado          CHAR(1)      NOT NULL DEFAULT 'A',  -- 'A'ctivo / 'I'nactivo
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),
    es_publico      CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    solo_root       CHAR(1)      NOT NULL DEFAULT 'N',  -- 'S'/'N'
    fecha_desde     DATE,
    fecha_hasta     DATE
);

COMMENT ON TABLE funcionalidades IS 'Funcionalidades/features protegidas por aplicación';

CREATE INDEX idx_funcionalidades_aplicacion ON funcionalidades(aplicacion_id);
CREATE INDEX idx_funcionalidades_estado ON funcionalidades(estado);

-- =============================================
-- 7. TABLA: acciones (catálogo de acciones posibles)
-- =============================================
CREATE TABLE IF NOT EXISTS acciones (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(60)  NOT NULL,
    descripcion VARCHAR(120),
    estado      CHAR(1)      NOT NULL DEFAULT 'A'   -- 'A'ctivo / 'I'nactivo
);

COMMENT ON TABLE acciones IS 'Catálogo de acciones (Ver, Crear, Editar, Eliminar, etc.)';

-- Datos iniciales de acciones
INSERT INTO acciones (nombre, descripcion) VALUES
    ('Ver',      'Permiso de lectura/visualización'),
    ('Crear',    'Permiso de creación'),
    ('Editar',   'Permiso de modificación'),
    ('Eliminar', 'Permiso de eliminación'),
    ('Ejecutar', 'Permiso de ejecución');

-- =============================================
-- 8. TABLA: funcionalidad_acciones (antes FuncionalidadAccion / Accion)
-- =============================================
CREATE TABLE IF NOT EXISTS funcionalidad_acciones (
    funcionalidad_id  INTEGER NOT NULL REFERENCES funcionalidades(id) ON DELETE CASCADE,
    accion_id         INTEGER NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
    PRIMARY KEY (funcionalidad_id, accion_id)
);

COMMENT ON TABLE funcionalidad_acciones IS 'Acciones disponibles por funcionalidad';

-- =============================================
-- 9. TABLA: accesos (antes Accesos)
-- =============================================
CREATE TABLE IF NOT EXISTS accesos (
    funcionalidad_id  INTEGER      NOT NULL REFERENCES funcionalidades(id) ON DELETE CASCADE,
    usuario_id        INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    efecto            VARCHAR(20)  NOT NULL DEFAULT 'ALLOW',  -- 'ALLOW' / 'DENY'
    creado_en         VARCHAR(40),
    fecha_desde       TIMESTAMP,
    fecha_hasta       TIMESTAMP,
    PRIMARY KEY (funcionalidad_id, usuario_id)
);

COMMENT ON TABLE accesos IS 'Permisos directos de usuario a funcionalidad';

CREATE INDEX idx_accesos_usuario ON accesos(usuario_id);

-- =============================================
-- 10. TABLA: rol_funcionalidades (antes RolFuncionalidad)
-- =============================================
CREATE TABLE IF NOT EXISTS rol_funcionalidades (
    rol_id            INTEGER   NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    funcionalidad_id  INTEGER   NOT NULL REFERENCES funcionalidades(id) ON DELETE CASCADE,
    fecha_creacion    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rol_id, funcionalidad_id)
);

COMMENT ON TABLE rol_funcionalidades IS 'Funcionalidades asignadas a cada rol';

CREATE INDEX idx_rol_funcionalidades_funcionalidad ON rol_funcionalidades(funcionalidad_id);

-- =============================================
-- RESUMEN DE TABLAS CREADAS
-- =============================================
-- 1.  aplicaciones            (8 campos)  - PK: id
-- 2.  usuarios                (24 campos) - PK: id, UNIQUE: username, email
-- 3.  usuario_preferencias    (4 campos)  - PK: id, FK: usuario_id
-- 4.  roles                   (8 campos)  - PK: id, FK: aplicacion_id
-- 5.  usuario_roles           (4 campos)  - PK: (usuario_id, rol_id)
-- 6.  funcionalidades         (9 campos)  - PK: id, FK: aplicacion_id
-- 7.  acciones                (4 campos)  - PK: id (catálogo)
-- 8.  funcionalidad_acciones  (2 campos)  - PK: (funcionalidad_id, accion_id)
-- 9.  accesos                 (6 campos)  - PK: (funcionalidad_id, usuario_id)
-- 10. rol_funcionalidades     (3 campos)  - PK: (rol_id, funcionalidad_id)
-- =============================================
-- TOTAL: 10 tablas, 72 campos, 13 índices, 10 foreign keys
