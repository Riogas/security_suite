# 🚀 Guía de Deployment - Security Suite

Esta guía te ayudará a deployar la aplicación Security Suite en un servidor de producción usando Docker.

## 📋 Prerequisitos

### En el servidor de producción:

1. **Sistema Operativo**: Linux (Ubuntu 20.04+ recomendado)
2. **Docker**: v20.10+
3. **Docker Compose**: v2.0+
4. **Git**: v2.25+
5. **Acceso SSH** al servidor
6. **Permisos sudo** en el servidor

### Instalación de prerequisitos (Ubuntu/Debian):

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Instalar Git
sudo apt install git -y

# Logout y login para aplicar cambios de grupo
```

## 🔑 Configuración SSH

### 1. Generar clave SSH (si no la tienes):

```bash
ssh-keygen -t ed25519 -C "computos.riogas@gmail.com"
```

### 2. Agregar clave SSH a GitHub:

```bash
# Copiar clave pública
cat ~/.ssh/id_ed25519.pub
```

Ve a GitHub → Settings → SSH and GPG keys → New SSH key
Pega la clave pública copiada.

### 3. Verificar conexión:

```bash
ssh -T git@github.com
```

Deberías ver: `Hi Riogas! You've successfully authenticated...`

## 📦 Deployment Inicial

### 1. Copiar script de deployment al servidor:

```bash
# En tu máquina local
scp deploy.sh usuario@servidor:/tmp/deploy.sh

# En el servidor
chmod +x /tmp/deploy.sh
sudo mv /tmp/deploy.sh /usr/local/bin/deploy-security-suite
```

### 2. Configurar variables de entorno:

```bash
# En el servidor, crear archivo .env.production
sudo mkdir -p /opt/securitysuite
cd /opt/securitysuite

# Crear archivo de configuración
cat > .env.production << 'EOF'
BACKEND_BASE_URL=http://tu-backend:8080
NEXT_PUBLIC_API_URL=http://tu-backend:8080
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
```

### 3. Ejecutar deployment:

```bash
sudo /usr/local/bin/deploy-security-suite
```

El script automáticamente:
- ✅ Verificará prerequisitos
- ✅ Configurará SSH si es necesario
- ✅ Clonará el repositorio
- ✅ Construirá la imagen Docker
- ✅ Iniciará los contenedores
- ✅ Verificará el health check

## 🔄 Actualizaciones

Para actualizar la aplicación con nuevos cambios:

```bash
sudo /usr/local/bin/deploy-security-suite
```

El script automáticamente:
1. Hará `git pull` de los últimos cambios
2. Detendrá los contenedores actuales
3. Reconstruirá la imagen
4. Iniciará los nuevos contenedores

## 📊 Comandos Útiles

### Ver logs en tiempo real:

```bash
cd /opt/securitysuite
docker-compose logs -f
```

### Ver estado de contenedores:

```bash
cd /opt/securitysuite
docker-compose ps
```

### Reiniciar contenedores:

```bash
cd /opt/securitysuite
docker-compose restart
```

### Detener aplicación:

```bash
cd /opt/securitysuite
docker-compose down
```

### Ver logs específicos:

```bash
cd /opt/securitysuite
docker-compose logs -f web
```

### Acceder al contenedor:

```bash
cd /opt/securitysuite
docker-compose exec web sh
```

### Ver uso de recursos:

```bash
docker stats
```

## 🔧 Troubleshooting

### Problema: Error de permisos al clonar repositorio

**Solución:**
```bash
# Verificar permisos SSH
ssh -T git@github.com

# Si falla, verificar clave SSH
ls -la ~/.ssh/
cat ~/.ssh/id_ed25519.pub

# Agregar clave a GitHub nuevamente
```

### Problema: Contenedor no inicia (unhealthy)

**Solución:**
```bash
# Ver logs detallados
cd /opt/securitysuite
docker-compose logs --tail=100

# Verificar variables de entorno
docker-compose exec web env

# Reiniciar con rebuild completo
docker-compose down
docker-compose up -d --build --force-recreate
```

### Problema: Puerto 4001 ya en uso

**Solución:**
```bash
# Ver qué está usando el puerto
sudo lsof -i :4001

# Matar proceso si es necesario
sudo kill -9 <PID>

# O cambiar puerto en docker-compose.yml
```

### Problema: Build falla por falta de memoria

**Solución:**
```bash
# Aumentar memoria de Docker
# Editar /etc/docker/daemon.json
{
  "default-memory": "4g"
}

# Reiniciar Docker
sudo systemctl restart docker
```

## 🔐 Seguridad

### Firewall:

```bash
# Permitir solo puertos necesarios
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 4001/tcp  # Aplicación (temporal, usar nginx después)
sudo ufw enable
```

### Nginx como proxy reverso (recomendado):

```bash
# Instalar Nginx
sudo apt install nginx -y

# Configurar proxy
sudo nano /etc/nginx/sites-available/security-suite

# Contenido:
server {
    listen 80;
    server_name tu-dominio.com;
    
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Activar configuración
sudo ln -s /etc/nginx/sites-available/security-suite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL con Let's Encrypt:

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado
sudo certbot --nginx -d tu-dominio.com

# Auto-renovación (ya configurado por certbot)
```

## 📈 Monitoreo

### Logs centralizados:

```bash
# Configurar logrotate
sudo nano /etc/logrotate.d/docker-security-suite

# Contenido:
/opt/securitysuite/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 0640 root docker
}
```

### Health checks automáticos:

```bash
# Crear script de monitoreo
cat > /usr/local/bin/check-security-suite << 'EOF'
#!/bin/bash
if ! docker-compose -f /opt/securitysuite/docker-compose.yml ps | grep -q "healthy"; then
    echo "Security Suite is down! Restarting..."
    cd /opt/securitysuite
    docker-compose restart
fi
EOF

chmod +x /usr/local/bin/check-security-suite

# Agregar a crontab (cada 5 minutos)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-security-suite") | crontab -
```

## 🔄 Backup

### Backup automático:

```bash
# Crear script de backup
cat > /usr/local/bin/backup-security-suite << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/security-suite"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup de código
cd /opt/securitysuite
git bundle create $BACKUP_DIR/repo_$DATE.bundle --all

# Backup de configuración
tar -czf $BACKUP_DIR/config_$DATE.tar.gz .env* docker-compose.yml

# Mantener solo últimos 7 backups
find $BACKUP_DIR -name "*.bundle" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completado: $DATE"
EOF

chmod +x /usr/local/bin/backup-security-suite

# Agregar a crontab (diario a las 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-security-suite") | crontab -
```

## 📞 Soporte

Para problemas o preguntas:
- Email: computos.riogas@gmail.com
- GitHub Issues: https://github.com/Riogas/security_suite/issues

---

**Última actualización**: Octubre 2025
