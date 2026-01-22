#!/bin/bash

###############################################
# Security Suite - PM2 Setup
###############################################

set -e

echo "=========================================="
echo "⚙️  Configuración inicial de PM2"
echo "=========================================="

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar si PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 Instalando PM2 globalmente...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}✓ PM2 ya está instalado${NC}"
fi

# Instalar módulo de rotación de logs
echo -e "${YELLOW}📦 Instalando PM2 Log Rotate...${NC}"
pm2 install pm2-logrotate

# Configurar rotación de logs
echo -e "${YELLOW}⚙️  Configurando rotación de logs...${NC}"
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# Configurar PM2 para inicio automático
echo -e "${YELLOW}🔧 Configurando inicio automático del sistema...${NC}"
pm2 startup

echo ""
echo -e "${GREEN}✅ PM2 configurado correctamente${NC}"
echo ""
echo "📋 Siguientes pasos:"
echo "  1. Si viste un comando 'sudo' arriba, cópialo y ejecútalo"
echo "  2. Ejecuta: pnpm run build"
echo "  3. Ejecuta: bash start-pm2.sh"
echo ""
echo "⚠️  IMPORTANTE: Si ves un comando de 'sudo', cópialo y ejecútalo"
echo ""
