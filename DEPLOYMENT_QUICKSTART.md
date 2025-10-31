# 🚀 Deployment Quick Start

## Opción 1: Setup Automático (Recomendado)

### 1. Copiar archivos al servidor:

```bash
# En tu máquina local
scp setup.sh deploy.sh usuario@tu-servidor:/tmp/

# En el servidor
cd /tmp
sudo bash setup.sh
```

### 2. Agregar SSH key a GitHub:

```bash
sudo -u dockeruser cat ~/.ssh/id_ed25519.pub
```

Copia la clave y agrégala en: https://github.com/settings/ssh/new

### 3. Configurar variables de entorno:

```bash
sudo -u dockeruser nano /opt/securitysuite/.env.production
```

Agrega:
```env
BACKEND_BASE_URL=http://tu-backend:8080
NEXT_PUBLIC_API_URL=http://tu-backend:8080
NODE_ENV=production
```

### 4. Deployar:

```bash
sudo -u dockeruser /usr/local/bin/deploy-security-suite
```

### 5. Verificar:

```bash
cd /opt/securitysuite
docker-compose ps
docker-compose logs -f
```

## Opción 2: Setup Manual

### 1. Instalar prerequisitos:

```bash
# Docker
curl -fsSL https://get.docker.com | sudo bash

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Git
sudo apt install git -y
```

### 2. Configurar SSH:

```bash
ssh-keygen -t ed25519 -C "computos.riogas@gmail.com"
cat ~/.ssh/id_ed25519.pub  # Copiar y agregar a GitHub
```

### 3. Clonar repositorio:

```bash
sudo mkdir -p /opt/securitysuite
sudo chown $USER:$USER /opt/securitysuite
git clone git@github.com:Riogas/security_suite.git /opt/securitysuite
cd /opt/securitysuite
```

### 4. Configurar environment:

```bash
cat > .env.production << 'EOF'
BACKEND_BASE_URL=http://tu-backend:8080
NEXT_PUBLIC_API_URL=http://tu-backend:8080
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
```

### 5. Deployar:

```bash
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.yml up -d
```

### 6. Verificar:

```bash
docker-compose ps
docker-compose logs -f
```

## ⚡ Comandos Rápidos

```bash
# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Detener
docker-compose down

# Actualizar
cd /opt/securitysuite
git pull origin dev
docker-compose down
docker-compose up -d --build

# Ver estado
docker-compose ps
docker stats
```

## 🔧 Troubleshooting Rápido

### Problema: Puerto en uso
```bash
sudo lsof -i :4001
sudo kill -9 <PID>
```

### Problema: Contenedor unhealthy
```bash
docker-compose logs --tail=100
docker-compose restart
```

### Problema: Build falla
```bash
docker system prune -a
docker-compose build --no-cache
```

### Problema: SSH no funciona
```bash
ssh -T git@github.com
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

## 📊 URLs de Acceso

- **Aplicación**: http://tu-servidor:4001
- **Health Check**: http://tu-servidor:4001/api/health

## 🆘 Soporte

Email: computos.riogas@gmail.com
GitHub: https://github.com/Riogas/security_suite
