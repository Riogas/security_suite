#!/bin/bash
# deploy-production.sh - Script de despliegue completo para producción

set -e  # Detener en caso de error

echo "=================================================="
echo "   Deployment SecuritySuite - Producción"
echo "=================================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Directorio del proyecto
PROJECT_DIR="/var/www/secapi"

# Función para logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que estamos en el directorio correcto
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Directorio $PROJECT_DIR no existe"
    exit 1
fi

cd "$PROJECT_DIR"

# 1. Verificar estado de Git
log_info "Verificando estado de Git..."
if [ -n "$(git status --porcelain)" ]; then
    log_warn "Hay cambios sin commitear. Listando archivos modificados:"
    git status --short
    read -p "¿Desea continuar de todas formas? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Deployment cancelado por el usuario"
        exit 1
    fi
fi

# 2. Obtener última versión del repositorio
log_info "Obteniendo últimos cambios desde origin/dev..."
git fetch origin dev
git pull origin dev

# 3. Verificar versión de Node.js
log_info "Verificando Node.js..."
NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"

# 4. Verificar versión de pnpm
log_info "Verificando pnpm..."
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm no está instalado"
    exit 1
fi
PNPM_VERSION=$(pnpm --version)
log_info "pnpm version: $PNPM_VERSION"

# 5. Instalar dependencias
log_info "Instalando dependencias..."
pnpm install --frozen-lockfile --prod=false

# 6. Verificar vulnerabilidades
log_info "Verificando vulnerabilidades de seguridad..."
pnpm audit --prod || log_warn "Se encontraron vulnerabilidades, pero continuando..."

# 7. Build de producción
log_info "Compilando aplicación para producción..."
pnpm run build

# 8. Verificar PM2
log_info "Verificando PM2..."
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 no está instalado. Instalando globalmente..."
    npm install -g pm2
fi

# 9. Detener aplicación anterior
log_info "Deteniendo aplicación anterior..."
if pm2 list | grep -q "securitySuite"; then
    pm2 delete securitySuite || log_warn "No se pudo eliminar proceso anterior"
else
    log_info "No hay proceso anterior corriendo"
fi

# 10. Iniciar aplicación con PM2
log_info "Iniciando aplicación con PM2..."
pm2 start pm2.config.js

# 11. Guardar configuración de PM2
log_info "Guardando configuración de PM2..."
pm2 save

# 12. Configurar PM2 para inicio automático (solo primera vez)
if [ ! -f "/etc/systemd/system/pm2-root.service" ] && [ ! -f "/etc/systemd/system/pm2-$USER.service" ]; then
    log_info "Configurando PM2 para inicio automático..."
    pm2 startup systemd -u $USER --hp $HOME
    log_warn "Ejecuta el comando mostrado arriba con sudo si es necesario"
fi

# 13. Verificar estado
log_info "Verificando estado de la aplicación..."
sleep 3
pm2 list

# 14. Ver logs
log_info "Últimas líneas del log:"
pm2 logs securitySuite --lines 20 --nostream

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Deployment completado exitosamente${NC}"
echo "=================================================="
echo ""
echo "Comandos útiles:"
echo "  - Ver logs:           pm2 logs securitySuite"
echo "  - Ver estado:         pm2 status"
echo "  - Reiniciar:          pm2 restart securitySuite"
echo "  - Detener:            pm2 stop securitySuite"
echo "  - Ver monitoreo:      pm2 monit"
echo ""
echo "La aplicación está corriendo en el puerto 3001"
echo "Endpoint: http://localhost:3001"
echo ""
