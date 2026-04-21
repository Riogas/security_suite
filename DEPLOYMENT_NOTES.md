# 📝 Notas de Deployment

## Para Servidores Ya Configurados

Si tu servidor ya tiene Docker, Docker Compose y Git configurados, usa `deploy-simple.sh`:

```bash
# 1. Subir script
scp deploy-simple.sh usuario@servidor:/tmp/

# 2. Ejecutar
ssh usuario@servidor
bash /tmp/deploy-simple.sh
```

El script:
- Clona en `/opt/securitysuite` (primera vez) o hace `git pull` (actualizaciones)
- Ejecuta `docker-compose build --no-cache`
- Ejecuta `docker-compose up -d`
- Limpia imágenes antiguas

## Configuración Importante

### Variables de Entorno

Crea un archivo `.env.production` en `/opt/securitysuite/`:

```env
# Backend URL
BACKEND_BASE_URL=http://tu-backend:8080
NEXT_PUBLIC_API_URL=http://tu-backend:8080

# Entorno
NODE_ENV=production

# Puerto (opcional, default: 4001)
PORT=4001
```

### Docker Compose Override (Opcional)

Si necesitas configuraciones específicas, crea `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  web:
    environment:
      - BACKEND_BASE_URL=http://tu-backend:8080
      - NEXT_PUBLIC_API_URL=http://tu-backend:8080
    ports:
      - "4001:3000"
    restart: unless-stopped
```

## Estructura de Directorios

```
/opt/securitysuite/
├── .env.production              # Variables de entorno
├── docker-compose.yml           # Configuración Docker
├── docker-compose.override.yml # Override opcional
├── dockerfile                   # Dockerfile de producción
├── src/                        # Código fuente
├── public/                     # Assets estáticos
└── ...
```

## Comandos Útiles

```bash
cd /opt/securitysuite

# Ver logs
docker-compose logs -f

# Ver solo últimas 100 líneas
docker-compose logs -f --tail=100

# Reiniciar
docker-compose restart

# Detener
docker-compose down

# Ver estado
docker-compose ps

# Ver uso de recursos
docker stats

# Limpiar todo
docker-compose down -v
docker system prune -a
```

## Troubleshooting

### El contenedor no inicia

```bash
# Ver logs completos
docker-compose logs

# Verificar variables de entorno
docker-compose config

# Verificar permisos
ls -la /opt/securitysuite
```

### Error de build

```bash
# Limpiar y rebuild
docker-compose down
docker system prune -a -f
bash /tmp/deploy-simple.sh
```

### Puerto ocupado

```bash
# Ver qué está usando el puerto 4001
sudo lsof -i :4001
sudo netstat -tulpn | grep 4001

# Cambiar puerto en docker-compose.override.yml
```

### Problemas de red entre contenedores

```bash
# Ver redes Docker
docker network ls

# Inspeccionar red
docker network inspect securitysuite_default

# Recrear red
docker-compose down
docker network prune
docker-compose up -d
```

## Actualizaciones

Para actualizar la aplicación:

```bash
bash /tmp/deploy-simple.sh
```

El script automáticamente:
1. Hace `git pull` de los últimos cambios
2. Reconstruye la imagen
3. Reinicia los contenedores

## Rollback

Si algo sale mal después de un deployment:

```bash
cd /opt/securitysuite

# Ver commits recientes
git log --oneline -10

# Volver a commit anterior
git checkout <commit-hash>

# Rebuild y restart
docker-compose build --no-cache
docker-compose up -d

# Volver a branch dev
git checkout dev
```

## Monitoring

### Health Check

```bash
# Verificar si el contenedor está healthy
docker-compose ps

# Hacer request manual
curl http://localhost:4001
```

### Logs en tiempo real

```bash
# Todos los logs
docker-compose logs -f

# Solo errores
docker-compose logs -f | grep -i error

# Con timestamps
docker-compose logs -f -t
```

## Seguridad

### Firewall

Asegúrate de tener el firewall configurado:

```bash
# Ver reglas actuales
sudo ufw status

# Permitir puerto 4001 (si usas UFW)
sudo ufw allow 4001/tcp
```

### HTTPS con Nginx

Si quieres exponer con HTTPS, usa Nginx como reverse proxy:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Performance

### Optimizaciones

- El Dockerfile usa multi-stage build para imagen pequeña
- Next.js standalone output reduce tamaño
- pnpm frozen-lockfile para builds reproducibles
- Docker build cache acelera rebuilds

### Monitoreo de recursos

```bash
# Ver uso de CPU/RAM
docker stats

# Ver logs de Docker daemon
sudo journalctl -u docker -f

# Espacio en disco
docker system df
```

## Backup

### Backup del código

El código está en Git, no necesita backup adicional.

### Backup de datos (si tienes volúmenes Docker)

```bash
# Listar volúmenes
docker volume ls

# Backup de volumen
docker run --rm -v nombre-volumen:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data
```

## CI/CD (Opcional)

Si quieres automatizar con GitHub Actions, ya tienes `.github/workflows/deploy.yml` listo. Solo necesitas:

1. Agregar secretos en GitHub:
   - `SSH_PRIVATE_KEY`
   - `SERVER_HOST`
   - `SERVER_USER`

2. Push a branch `dev` ejecutará deployment automático.
