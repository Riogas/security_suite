#!/bin/bash

###############################################
# Security Suite - PM2 Troubleshooting & Fix
###############################################

set -e

echo "=========================================="
echo "🔧 PM2 Troubleshooting & Fix"
echo "=========================================="

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}[1/8] Verificando estado actual...${NC}"
pm2 status

echo ""
echo -e "${BLUE}[2/8] Deteniendo aplicación...${NC}"
pm2 stop securitySuite 2>/dev/null || echo "App no estaba corriendo"

echo ""
echo -e "${BLUE}[3/8] Limpiando logs antiguos...${NC}"
pm2 flush securitySuite 2>/dev/null || true
rm -f logs/*.log
mkdir -p logs

echo ""
echo -e "${BLUE}[4/8] Eliminando app de PM2...${NC}"
pm2 delete securitySuite 2>/dev/null || echo "App no existía"

echo ""
echo -e "${BLUE}[5/8] Verificando módulo pm2-logrotate...${NC}"
pm2 list | grep pm2-logrotate || {
    echo -e "${YELLOW}Instalando pm2-logrotate...${NC}"
    pm2 install pm2-logrotate
}

echo ""
echo -e "${BLUE}[6/8] Configurando pm2-logrotate...${NC}"
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss

echo ""
echo -e "${BLUE}[7/8] Verificando build de Next.js...${NC}"
if [ ! -d ".next" ]; then
    echo -e "${RED}❌ Error: No existe .next/ - Ejecuta: pnpm run build${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build existe${NC}"

echo ""
echo -e "${BLUE}[8/8] Iniciando aplicación con PM2...${NC}"
pm2 start pm2.config.js

echo ""
echo -e "${BLUE}Guardando configuración...${NC}"
pm2 save

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Troubleshooting completado${NC}"
echo "=========================================="
echo ""
pm2 status
echo ""
echo -e "${YELLOW}📋 Verificar logs:${NC}"
echo "  pm2 logs securitySuite --lines 50"
echo ""
echo -e "${YELLOW}🌐 Probar aplicación:${NC}"
echo "  curl http://localhost:3000"
echo "  curl http://localhost:3000/login"
echo ""
