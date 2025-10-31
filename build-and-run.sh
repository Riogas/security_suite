#!/bin/bash

#############################################
# Security Suite - Build & Run
# Script rápido para compilar y ejecutar
#############################################

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "🚀 Security Suite - Build & Run"
echo "=========================================="
echo ""

# Detener contenedores si están corriendo
echo -e "${BLUE}[1/3]${NC} Deteniendo contenedores existentes..."
if docker-compose ps | grep -q "Up"; then
    docker-compose down
    echo -e "${GREEN}✓${NC} Contenedores detenidos"
else
    echo -e "${YELLOW}⚠${NC} No hay contenedores corriendo"
fi

# Build
echo -e "${BLUE}[2/3]${NC} Construyendo imagen Docker..."
echo -e "${YELLOW}⏳${NC} Esto puede tardar varios minutos..."
docker-compose build --no-cache

echo -e "${GREEN}✓${NC} Imagen construida exitosamente"

# Iniciar
echo -e "${BLUE}[3/3]${NC} Iniciando aplicación..."
docker-compose up -d

# Esperar a que esté listo
echo -e "${YELLOW}⏳${NC} Esperando a que la aplicación esté lista..."
sleep 5

# Verificar estado
echo ""
echo "=========================================="
echo "✅ Aplicación iniciada"
echo "=========================================="
echo ""
docker-compose ps
echo ""
echo "🌐 URL: http://localhost:4000"
echo ""
echo "📋 Comandos útiles:"
echo "  • Ver logs:      docker-compose logs -f"
echo "  • Detener:       docker-compose down"
echo "  • Reiniciar:     docker-compose restart"
echo "  • Ver estado:    docker-compose ps"
echo ""
