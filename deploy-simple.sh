#!/bin/bash

#############################################
# Security Suite - Deployment Simple
# Para servidores ya configurados
#############################################

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuración
PROJECT_DIR="/opt/securitysuite"
REPO_URL="git@github.com:Riogas/security_suite.git"
BRANCH="dev"
DOCKER_COMPOSE_FILE="docker-compose.yml"

echo "=========================================="
echo "🚀 Security Suite - Deployment"
echo "=========================================="
echo ""

# Verificar si el directorio existe
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${BLUE}[1/5]${NC} Creando directorio y clonando repositorio..."
    sudo mkdir -p "$PROJECT_DIR"
    sudo chown $USER:$USER "$PROJECT_DIR"
    git clone "$REPO_URL" "$PROJECT_DIR"
    echo -e "${GREEN}✓${NC} Repositorio clonado"
else
    echo -e "${BLUE}[1/5]${NC} Actualizando repositorio..."
    cd "$PROJECT_DIR"
    
    # Guardar cambios locales si hay
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}⚠${NC} Guardando cambios locales..."
        git stash
    fi
    
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    echo -e "${GREEN}✓${NC} Repositorio actualizado"
fi

cd "$PROJECT_DIR"

# Detener contenedores
echo -e "${BLUE}[2/5]${NC} Deteniendo contenedores..."
if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    echo -e "${GREEN}✓${NC} Contenedores detenidos"
else
    echo -e "${YELLOW}⚠${NC} No hay contenedores corriendo"
fi

# Build
echo -e "${BLUE}[3/5]${NC} Construyendo imagen (esto puede tardar)..."
docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache

echo -e "${GREEN}✓${NC} Imagen construida"

# Iniciar contenedores
echo -e "${BLUE}[4/5]${NC} Iniciando contenedores..."
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Esperar health check
echo -e "${BLUE}[5/5]${NC} Esperando health check..."
sleep 5

MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "healthy\|Up"; then
        echo -e "${GREEN}✓${NC} Aplicación lista"
        break
    fi
    echo -n "."
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""

# Limpiar imágenes antiguas
echo "Limpiando imágenes antiguas..."
docker image prune -f > /dev/null 2>&1

# Estado final
echo ""
echo "=========================================="
echo "✅ Deployment completado"
echo "=========================================="
echo ""
docker-compose -f "$DOCKER_COMPOSE_FILE" ps
echo ""
echo "📋 Comandos útiles:"
echo "  • Ver logs:      docker-compose -f $DOCKER_COMPOSE_FILE logs -f"
echo "  • Reiniciar:     docker-compose -f $DOCKER_COMPOSE_FILE restart"
echo "  • Detener:       docker-compose -f $DOCKER_COMPOSE_FILE down"
echo "  • Ver estado:    docker-compose -f $DOCKER_COMPOSE_FILE ps"
echo ""
echo "🌐 URL: http://localhost:4001"
echo ""
