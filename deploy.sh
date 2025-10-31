#!/bin/bash

#############################################
# Script de Deployment Automatizado
# Security Suite - Next.js Application
#############################################

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
PROJECT_NAME="security_suite"
REPO_DIR="/opt/securitysuite"
DOCKER_COMPOSE_FILE="docker-compose.yml"
BRANCH="dev"
SSH_KEY_PATH="$HOME/.ssh/id_ed25519"

#############################################
# Funciones auxiliares
#############################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

#############################################
# Verificar prerequisitos
#############################################

check_prerequisites() {
    print_header "Verificando prerequisitos"
    
    # Verificar Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker no está instalado"
        exit 1
    fi
    log_success "Docker instalado"
    
    # Verificar Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose no está instalado"
        exit 1
    fi
    log_success "Docker Compose instalado"
    
    # Verificar Git
    if ! command -v git &> /dev/null; then
        log_error "Git no está instalado"
        exit 1
    fi
    log_success "Git instalado"
    
    # Verificar SSH key
    if [ ! -f "$SSH_KEY_PATH" ]; then
        log_warning "SSH key no encontrada en $SSH_KEY_PATH"
        log_info "Generando SSH key..."
        setup_ssh_key
    else
        log_success "SSH key encontrada"
    fi
}

#############################################
# Configurar SSH key
#############################################

setup_ssh_key() {
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    
    # Crear SSH key si no existe
    if [ ! -f "$SSH_KEY_PATH" ]; then
        ssh-keygen -t ed25519 -C "computos.riogas@gmail.com" -f "$SSH_KEY_PATH" -N ""
        log_success "SSH key generada en $SSH_KEY_PATH"
        log_warning "IMPORTANTE: Debes agregar esta clave pública a GitHub:"
        echo ""
        cat "${SSH_KEY_PATH}.pub"
        echo ""
        read -p "Presiona Enter después de agregar la clave a GitHub..."
    fi
    
    # Configurar SSH para GitHub
    cat > "$HOME/.ssh/config" <<EOF
Host github.com
    HostName github.com
    User git
    IdentityFile $SSH_KEY_PATH
    StrictHostKeyChecking no
EOF
    
    chmod 600 "$HOME/.ssh/config"
    
    # Iniciar ssh-agent y agregar clave
    eval "$(ssh-agent -s)"
    ssh-add "$SSH_KEY_PATH"
    
    log_success "SSH configurado"
}

#############################################
# Clonar o actualizar repositorio
#############################################

setup_repository() {
    print_header "Configurando repositorio"
    
    if [ ! -d "$REPO_DIR" ]; then
        log_info "Clonando repositorio..."
        sudo mkdir -p "$REPO_DIR"
        sudo chown $USER:$USER "$REPO_DIR"
        git clone git@github.com:Riogas/security_suite.git "$REPO_DIR"
        log_success "Repositorio clonado"
    else
        log_info "Repositorio ya existe, actualizando..."
        cd "$REPO_DIR"
        
        # Stash cambios locales si existen
        if ! git diff-index --quiet HEAD --; then
            log_warning "Hay cambios locales, guardándolos..."
            git stash
        fi
        
        # Pull cambios
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
        log_success "Repositorio actualizado"
    fi
}

#############################################
# Detener contenedores actuales
#############################################

stop_containers() {
    print_header "Deteniendo contenedores"
    
    cd "$REPO_DIR"
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
        log_info "Deteniendo contenedores..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        log_success "Contenedores detenidos"
    else
        log_info "No hay contenedores corriendo"
    fi
}

#############################################
# Construir imagen Docker
#############################################

build_image() {
    print_header "Construyendo imagen Docker"
    
    cd "$REPO_DIR"
    
    log_info "Construyendo imagen (esto puede tardar varios minutos)..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    log_success "Imagen construida exitosamente"
}

#############################################
# Iniciar contenedores
#############################################

start_containers() {
    print_header "Iniciando contenedores"
    
    cd "$REPO_DIR"
    
    log_info "Iniciando contenedores..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # Esperar a que el contenedor esté healthy
    log_info "Esperando a que la aplicación esté lista..."
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "healthy"; then
            log_success "Aplicación lista y healthy"
            break
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        log_error "Timeout esperando a que la aplicación esté lista"
        log_info "Verificando logs..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail=50
        exit 1
    fi
}

#############################################
# Limpiar recursos antiguos
#############################################

cleanup() {
    print_header "Limpiando recursos antiguos"
    
    log_info "Eliminando imágenes sin usar..."
    docker image prune -f
    
    log_info "Eliminando volúmenes sin usar..."
    docker volume prune -f
    
    log_success "Limpieza completada"
}

#############################################
# Mostrar estado
#############################################

show_status() {
    print_header "Estado del deployment"
    
    cd "$REPO_DIR"
    
    echo "Contenedores:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps
    echo ""
    
    echo "URLs de acceso:"
    echo "  - Aplicación: http://localhost:4001"
    echo "  - Logs: docker-compose -f $DOCKER_COMPOSE_FILE logs -f"
    echo ""
    
    log_success "Deployment completado exitosamente!"
}

#############################################
# Rollback (en caso de error)
#############################################

rollback() {
    log_error "Error durante el deployment, iniciando rollback..."
    
    cd "$REPO_DIR"
    
    # Volver al commit anterior
    git reset --hard HEAD~1
    
    # Reconstruir y reiniciar
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --build
    
    log_warning "Rollback completado"
}

#############################################
# Script principal
#############################################

main() {
    print_header "🚀 Security Suite - Deployment Script"
    
    echo "Configuración:"
    echo "  - Proyecto: $PROJECT_NAME"
    echo "  - Directorio: $REPO_DIR"
    echo "  - Branch: $BRANCH"
    echo ""
    
    # Trap para capturar errores
    trap rollback ERR
    
    # Ejecutar pasos
    check_prerequisites
    setup_repository
    stop_containers
    build_image
    start_containers
    cleanup
    show_status
    
    # Desactivar trap
    trap - ERR
}

# Ejecutar script
main "$@"
