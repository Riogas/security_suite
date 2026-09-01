-- =============================================
-- Security Suite - Sync horario ADMSEC.USUARIOS -> secapi
-- Spec: docs/superpowers/specs/2026-09-01-sync-usuarios-admsec-design.md (§4)
-- Ejecutar sobre la base de datos: securitysuite
--
-- OJO: dev y prod apuntan a la MISMA Postgres (.env:5 y pm2.config.js:37).
-- Correr esto "en dev" es correrlo en producción.
--
-- Equivalente al modelo Prisma SyncAdmsecCorrida (prisma/schema.prisma).
-- Está acá suelto porque el índice único parcial de más abajo Prisma no lo
-- sabe expresar, así que la tabla se aplica a mano y el índice también.
-- =============================================

-- =============================================
-- 1. TABLA: sync_admsec_corridas
-- =============================================
CREATE TABLE IF NOT EXISTS sync_admsec_corridas (
    id            SERIAL       PRIMARY KEY,
    inicio        TIMESTAMP    NOT NULL DEFAULT NOW(),
    fin           TIMESTAMP,
    resultado     VARCHAR(12)  NOT NULL DEFAULT 'EN_CURSO',  -- 'EN_CURSO' / 'OK' / 'FALLIDA'
    reloj_origen  VARCHAR(32),                               -- texto, no timestamp: ver el comentario de abajo
    altas         INTEGER      NOT NULL DEFAULT 0,
    cambios       INTEGER      NOT NULL DEFAULT 0,
    omitidos      INTEGER      NOT NULL DEFAULT 0,
    nota          TEXT
);

COMMENT ON TABLE sync_admsec_corridas IS 'Una fila por corrida del job de sync con ADMSEC.USUARIOS';
COMMENT ON COLUMN sync_admsec_corridas.resultado IS 'EN_CURSO = corriendo, OK = terminó bien, FALLIDA = se cortó';
-- reloj_origen es VARCHAR y no TIMESTAMP a propósito: USUDTUPD llega desde
-- node-jt400 como string (getString + JSON, que no tiene tipo fecha) y se
-- compara contra esta marca como texto de ancho fijo. Guardarla como timestamp
-- obliga a un new Date() del otro lado, que compara false siempre y además
-- mete zona horaria.
COMMENT ON COLUMN sync_admsec_corridas.reloj_origen IS 'Reloj del AS400 al arrancar, COMO TEXTO (YYYY-MM-DD HH24:MI:SS.FF6). NULL si la corrida falló antes de leerlo';
COMMENT ON COLUMN sync_admsec_corridas.nota IS 'Los ES_ROOT, los BAJA_LOCAL y cualquier error: texto plano, para leer';

-- =============================================
-- 2. ÍNDICE: una sola corrida EN_CURSO a la vez
-- =============================================
-- Es el candado del job, y reemplaza a un advisory lock. Existe porque dev y
-- prod comparten la misma Postgres: sin esto, una corrida a mano en dev y la
-- del cron de prod escriben el mismo padrón al mismo tiempo. El segundo
-- proceso choca con el índice al insertar su fila EN_CURSO y sale.
-- El ((1)) es una expresión constante: hace que las filas EN_CURSO colisionen
-- todas entre sí, sin importar sus columnas.
CREATE UNIQUE INDEX ux_sync_admsec_una_en_curso
  ON sync_admsec_corridas ((1)) WHERE resultado = 'EN_CURSO';

-- =============================================
-- RESUMEN
-- =============================================
-- 1 tabla (9 campos) - PK: id
-- 1 índice único parcial: ux_sync_admsec_una_en_curso
-- =============================================
