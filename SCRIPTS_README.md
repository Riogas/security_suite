# 🚀 Scripts de Deployment

Este proyecto incluye varios scripts para diferentes propósitos:

## 📋 Scripts Disponibles

### Desarrollo Local

#### `dev.sh` - Modo Desarrollo con Hot Reload
```bash
chmod +x dev.sh
./dev.sh
```

**Características:**
- ✅ Hot reload habilitado
- ✅ Mapeo de volúmenes para cambios en tiempo real
- ✅ Puerto: `4001`
- ✅ NODE_ENV: `development`
- ✅ Usa `Dockerfile.dev` y `docker-compose.dev.yml`
- ✅ Comando: `next dev`

**Usar cuando:** Estés desarrollando localmente y quieras ver cambios instantáneos.

---

### Producción Local

#### `build-and-run.sh` - Build y Run en Producción
```bash
chmod +x build-and-run.sh
./build-and-run.sh
```

**Características:**
- ✅ Build optimizado para producción
- ✅ Puerto: `4000`
- ✅ NODE_ENV: `production`
- ✅ Usa `dockerfile` y `docker-compose.yml`
- ✅ Comando: `next start` (después de build)
- ✅ Sin hot reload (imagen estática)

**Usar cuando:** Quieras probar la versión de producción localmente antes de deployar.

---

### Deployment en Servidor

#### `deploy-simple.sh` - Deployment Simple
```bash
# En tu servidor (que ya tiene Docker configurado)
chmod +x deploy-simple.sh
./deploy-simple.sh
```

**Características:**
- ✅ Clona repo en `/opt/securitysuite` (primera vez)
- ✅ Git pull (actualizaciones)
- ✅ Build de producción
- ✅ Reinicio automático de contenedores
- ✅ Health check
- ✅ Limpieza de imágenes antiguas

**Usar cuando:** Necesites deployar o actualizar en servidor de producción.

---

#### `deploy.sh` - Deployment Completo con Rollback
```bash
# En tu servidor
sudo -u dockeruser /usr/local/bin/deploy-security-suite
```

**Características:**
- ✅ Todo lo de `deploy-simple.sh`
- ✅ Verificación de prerequisites
- ✅ Rollback automático en caso de fallo
- ✅ Respaldo de versión anterior
- ✅ Health checks más robustos

**Usar cuando:** Necesites un deployment más seguro con capacidad de rollback.

---

#### `setup.sh` - Setup Inicial de Servidor
```bash
# Solo la primera vez en un servidor nuevo
sudo bash setup.sh
```

**Características:**
- ✅ Instala Docker, Docker Compose, Git
- ✅ Configura usuario dockeruser
- ✅ Configura firewall (UFW)
- ✅ Genera SSH key para GitHub
- ✅ Optimiza Docker daemon

**Usar cuando:** Estés configurando un servidor nuevo desde cero.

---

## 🔧 Diferencias Clave

| Aspecto | Desarrollo (`dev.sh`) | Producción Local (`build-and-run.sh`) | Producción Servidor (`deploy-simple.sh`) |
|---------|----------------------|---------------------------------------|------------------------------------------|
| **Puerto** | 4001 | 4000 | 4000 |
| **NODE_ENV** | development | production | production |
| **Dockerfile** | Dockerfile.dev | dockerfile | dockerfile |
| **Hot Reload** | ✅ Sí | ❌ No | ❌ No |
| **Volúmenes** | ✅ Mapeados | ❌ No | ❌ No |
| **Build** | No (usa código en vivo) | ✅ Sí | ✅ Sí |
| **Comando Next** | `next dev` | `next start` | `next start` |
| **Git Pull** | ❌ No | ❌ No | ✅ Sí |

---

## 🎯 Flujo de Trabajo Recomendado

### 1. Desarrollo Diario
```bash
# En tu máquina local
./dev.sh

# Hacer cambios en el código
# Ver cambios en http://localhost:4001
# Ctrl+C para detener
```

### 2. Testing Pre-Producción
```bash
# En tu máquina local
./build-and-run.sh

# Probar en http://localhost:4000
# Verificar que todo funciona en modo producción
```

### 3. Commit y Push
```bash
git add .
git commit -m "feat: nueva funcionalidad"
git push origin dev
```

### 4. Deployment a Servidor
```bash
# SSH a tu servidor
ssh usuario@tu-servidor

# Ejecutar deployment
cd /tmp
./deploy-simple.sh

# Verificar
docker-compose -f docker-compose.yml ps
docker-compose -f docker-compose.yml logs -f
```

---

## 🐛 Troubleshooting

### "Critical dependency" warnings
- ✅ **Esto es normal** - Son warnings de Sentry/OpenTelemetry
- ❌ No afectan funcionalidad
- ℹ️ Puedes ignorarlos

### "Sentry disabled in development"
- ✅ **Esto es correcto** - Sentry solo funciona en producción
- ℹ️ Configura `SENTRY_DSN` en producción para habilitarlo

### Puerto ocupado
```bash
# Ver qué está usando el puerto
sudo lsof -i :4000  # o :4001 para dev

# Detener contenedores
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

### Cambios no se reflejan
```bash
# En desarrollo: reinicia el contenedor
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart

# En producción: rebuild
./build-and-run.sh
```

---

## 📚 Documentación Adicional

- **Deployment completo:** Ver [README.deployment.md](./README.deployment.md)
- **Quick start:** Ver [DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)
- **Troubleshooting:** Ver [DEPLOYMENT_NOTES.md](./DEPLOYMENT_NOTES.md)

---

## ⚙️ Variables de Entorno

### Desarrollo
Las variables están en `docker-compose.dev.yml`

### Producción
Las variables están en `docker-compose.yml`

Para sobrescribir en producción, crea `.env.production`:
```env
BACKEND_BASE_URL=http://tu-backend:8080
NEXT_PUBLIC_API_URL=http://tu-backend:8080
NODE_ENV=production
```

---

## 🔐 Seguridad

- ⚠️ Nunca commitas `.env.production` al repositorio
- ✅ Usa `.env.production.example` como template
- ✅ Configura variables sensibles directamente en el servidor
