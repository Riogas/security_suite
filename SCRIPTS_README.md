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

## Importación masiva de preferencias SGM

### `scripts/import-sgm-preferences.ts` — CLI para importar preferencias SGM

Script Node/TypeScript que dispara `POST /api/db/admin/import-sgm-preferences` desde la línea de comandos, sin necesidad de login manual en el browser.

**Qué hace:**
- Genera un JWT localmente usando `JWT_SECRET` del `.env.local` (mismo secret que usa la app).
- Hace POST al endpoint con la cookie `token=<jwt>`.
- Imprime un resumen de candidatos, escenarios/empFleteras actualizados/skipped, roles Distribuidor asignados y errores.
- Imprime una tabla detallada por usuario.

**Uso:**
```bash
# Importación real
pnpm import:sgm-prefs

# Dry run (simulación sin escrituras en DB)
pnpm import:sgm-prefs --dry-run

# Apuntar a otra URL (ej: producción)
pnpm import:sgm-prefs --base-url=https://securitysuite.riogas.com.uy

# Ver ayuda
pnpm import:sgm-prefs --help
```

**Variables de entorno (en `.env.local` o `.env`):**

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `JWT_SECRET` | Sí | — | Secret para firmar el JWT. Debe coincidir con el que usa la app. |
| `DATABASE_URL` | Solo si no se especifica admin | — | URL de PostgreSQL. Se usa para buscar el primer usuario `esRoot='S'`. |
| `IMPORT_BASE_URL` | No | `http://localhost:4005` | URL base del servidor. |
| `IMPORT_ADMIN_USERNAME` | No | lookup en DB | Username del admin para el JWT. |
| `IMPORT_ADMIN_USERID` | No | lookup en DB | ID del admin para el JWT. |

**Errores comunes:**

- `JWT_SECRET no está seteado` → Agregá `JWT_SECRET=<valor>` al `.env.local`.
- `ERROR 401` → El JWT_SECRET no coincide con el que usa la app.
- `No se pudo conectar a http://localhost:4005` → El servidor no está corriendo en esa URL.
- `No se encontró ningún usuario con esRoot='S'` → Especificá `IMPORT_ADMIN_USERNAME` y `IMPORT_ADMIN_USERID` en el `.env`.

**Requisitos:**
- Node 20+ (usa `fetch` nativo)
- `tsx` instalado (ya está en `devDependencies`)
- `jsonwebtoken` y `dotenv` (ya están en `dependencies`)

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
