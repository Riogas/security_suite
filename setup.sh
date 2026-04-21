#!/bin/bash

#############################################
# Quick Setup Script
# Configuración rápida para nuevo servidor
#############################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "=========================================="
echo "Security Suite - Setup Rápido"
echo "=========================================="
echo ""

# Verificar si es root
if [ "$EUID" -ne 0 ]; then 
    log_error "Este script debe ejecutarse como root"
    echo "Ejecuta: sudo bash setup.sh"
    exit 1
fi

# Actualizar sistema
log_info "Actualizando sistema..."
apt update && apt upgrade -y
log_success "Sistema actualizado"

# Instalar Docker
if ! command -v docker &> /dev/null; then
    log_info "Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    log_success "Docker instalado"
else
    log_success "Docker ya está instalado"
fi

# Instalar Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log_info "Instalando Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    log_success "Docker Compose instalado"
else
    log_success "Docker Compose ya está instalado"
fi

# Instalar Git
if ! command -v git &> /dev/null; then
    log_info "Instalando Git..."
    apt install -y git
    log_success "Git instalado"
else
    log_success "Git ya está instalado"
fi

# Instalar herramientas adicionales
log_info "Instalando herramientas adicionales..."
apt install -y curl wget vim nano htop ufw
log_success "Herramientas instaladas"

# Configurar firewall
log_info "Configurando firewall..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 4001/tcp  # Aplicación
log_success "Firewall configurado"

# Crear usuario para Docker si no existe
if ! getent passwd dockeruser > /dev/null 2>&1; then
    log_info "Creando usuario dockeruser..."
    useradd -m -s /bin/bash dockeruser
    usermod -aG docker dockeruser
    log_success "Usuario dockeruser creado"
else
    log_success "Usuario dockeruser ya existe"
fi

# Crear directorio del proyecto
log_info "Creando estructura de directorios..."
mkdir -p /opt/securitysuite
mkdir -p /backup/security-suite
mkdir -p /var/log/security-suite
chown -R dockeruser:docker /opt/securitysuite
chown -R dockeruser:docker /backup/security-suite
chown -R dockeruser:docker /var/log/security-suite
log_success "Directorios creados"

# Copiar deploy script
log_info "Instalando script de deployment..."
if [ -f "deploy.sh" ]; then
    cp deploy.sh /usr/local/bin/deploy-security-suite
    chmod +x /usr/local/bin/deploy-security-suite
    log_success "Script de deployment instalado"
else
    log_error "No se encontró deploy.sh en el directorio actual"
fi

# Configurar SSH para dockeruser
log_info "Configurando SSH para deployment..."
sudo -u dockeruser bash << 'EOF'
mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -C "computos.riogas@gmail.com" -f ~/.ssh/id_ed25519 -N ""
    echo ""
    echo "============================================"
    echo "IMPORTANTE: Agrega esta clave SSH a GitHub"
    echo "============================================"
    cat ~/.ssh/id_ed25519.pub
    echo "============================================"
    echo ""
fi

# Configurar SSH config
cat > ~/.ssh/config << 'SSHEOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking no
SSHEOF

chmod 600 ~/.ssh/config
EOF

log_success "SSH configurado"

# Configurar Docker daemon para optimización
log_info "Optimizando configuración de Docker..."
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-memory": "4g"
}
EOF

systemctl restart docker
log_success "Docker optimizado"

# Configurar logrotate
log_info "Configurando rotación de logs..."
cat > /etc/logrotate.d/docker-security-suite << 'EOF'
/var/log/security-suite/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 0640 dockeruser docker
}
EOF

log_success "Logrotate configurado"

# Resumen final
echo ""
echo "=========================================="
echo "✅ Setup completado exitosamente"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo ""
echo "1. Agregar la clave SSH pública a GitHub:"
echo "   sudo -u dockeruser cat ~/.ssh/id_ed25519.pub"
echo ""
echo "2. Configurar variables de entorno:"
echo "   sudo -u dockeruser nano /opt/securitysuite/.env.production"
echo ""
echo "3. Ejecutar deployment:"
echo "   sudo -u dockeruser /usr/local/bin/deploy-security-suite"
echo ""
echo "4. Verificar estado:"
echo "   cd /opt/securitysuite && docker-compose ps"
echo ""
echo "=========================================="
