#!/bin/bash

#############################################
# Security Suite - Development Mode
# Script para correr en modo desarrollo
#############################################

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "🔧 Security Suite - Development Mode"
echo "=========================================="
echo ""

# Detener contenedores si están corriendo
echo -e "${BLUE}[1/2]${NC} Deteniendo contenedores existentes..."
if docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps | grep -q "Up"; then
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
    echo -e "${GREEN}✓${NC} Contenedores detenidos"
else
    echo -e "${YELLOW}⚠${NC} No hay contenedores corriendo"
fi

# Iniciar en modo desarrollo
echo -e "${BLUE}[2/2]${NC} Iniciando en modo desarrollo..."
echo -e "${YELLOW}⏳${NC} Hot reload habilitado"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

echo ""
echo "=========================================="
echo "✅ Modo desarrollo iniciado"
echo "=========================================="
echo ""
echo "🌐 URL: http://localhost:4001"
echo ""
echo "📋 Comandos útiles:"
echo "  • Ver logs:      docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f"
echo "  • Detener:       docker-compose -f docker-compose.yml -f docker-compose.dev.yml down"
echo "  • Reiniciar:     docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart"
echo ""
