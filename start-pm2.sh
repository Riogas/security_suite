#!/bin/bash

###############################################
# Security Suite - PM2 Startup Script
###############################################

set -e

echo "=========================================="
echo "🚀 Security Suite - PM2 Startup"
echo "=========================================="

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Crear carpeta de logs si no existe
echo -e "${YELLOW}[1/5] Creando carpeta de logs...${NC}"
mkdir -p logs

# Verificar que el build existe
if [ ! -d ".next" ]; then
    echo -e "${RED}❌ Error: No se encontró el build de Next.js${NC}"
    echo "Ejecuta primero: pnpm run build"
    exit 1
fi

# Detener instancias anteriores
echo -e "${YELLOW}[2/5] Deteniendo instancias anteriores...${NC}"
pm2 delete securitySuite 2>/dev/null || echo "No hay instancias previas"

# Iniciar con PM2
echo -e "${YELLOW}[3/5] Iniciando aplicación con PM2...${NC}"
pm2 start pm2.config.js

# Guardar configuración para auto-inicio
echo -e "${YELLOW}[4/5] Guardando configuración...${NC}"
pm2 save

# Mostrar estado
echo -e "${YELLOW}[5/5] Estado de la aplicación:${NC}"
pm2 status

echo ""
echo -e "${GREEN}✅ Security Suite iniciado correctamente${NC}"
echo ""
echo "📋 Comandos útiles:"
echo "  pm2 status              - Ver estado"
echo "  pm2 logs securitySuite  - Ver logs en tiempo real"
echo "  pm2 monit               - Monitor interactivo"
echo "  pm2 restart securitySuite - Reiniciar"
echo "  pm2 stop securitySuite  - Detener"
echo "  pm2 delete securitySuite - Eliminar"
echo ""
echo "📁 Logs guardados en: ./logs/"
echo "🌐 Aplicación en: http://localhost:4000"
echo ""
