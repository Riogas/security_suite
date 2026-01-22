# 🚀 Security Suite - PM2 Deployment

## 📋 Configuración y Uso de PM2

PM2 es un gestor de procesos para Node.js que permite ejecutar la aplicación en producción con auto-restart, monitoreo y logs.

---

## 🚀 Quick Start

### 1. Setup Inicial (Primera vez)

```bash
# Instalar y configurar PM2
bash setup-pm2.sh

# Si aparece un comando con sudo, ejecútalo (ejemplo):
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

### 2. Build de Producción

```bash
# Instalar dependencias
pnpm install

# Build de Next.js
pnpm run build
```

### 3. Iniciar Aplicación

```bash
# Dar permisos al script
chmod +x start-pm2.sh

# Iniciar con PM2
bash start-pm2.sh
```

✅ **¡Listo!** Tu aplicación está corriendo en `http://localhost:4000`

---

## 📋 Comandos Útiles

### Estado y Monitoreo

```bash
# Ver estado de la aplicación
pm2 status

# Logs en tiempo real
pm2 logs securitySuite

# Logs filtrados
pm2 logs securitySuite --lines 100
pm2 logs securitySuite --err    # Solo errores
pm2 logs securitySuite --out    # Solo output

# Monitor interactivo (CPU, RAM)
pm2 monit

# Información detallada
pm2 show securitySuite
```

### Control de la Aplicación

```bash
# Reiniciar
pm2 restart securitySuite

# Detener
pm2 stop securitySuite

# Eliminar de PM2
pm2 delete securitySuite

# Reload (0 downtime en cluster mode)
pm2 reload securitySuite
```

### Gestión de Logs

```bash
# Vaciar logs
pm2 flush securitySuite

# Ver ubicación de logs
ls -lh logs/

# Logs guardados en:
# - ./logs/pm2-out.log    (Output normal)
# - ./logs/pm2-error.log  (Errores)
```

---

## 🔧 Configuración

### Archivo: `pm2.config.js`

```javascript
{
  name: 'securitySuite',           // Nombre del proceso
  script: 'node_modules/next/dist/bin/next',
  args: 'start -p 4000',           // Puerto 4000
  instances: 1,                    // Número de instancias
  exec_mode: 'cluster',            // Modo cluster
  max_memory_restart: '1G',        // Restart si usa >1GB
  autorestart: true,               // Auto-restart en crash
}
```

### Variables de Entorno

Edita `pm2.config.js` para agregar más variables:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 4000,
  BACKEND_BASE_URL: 'http://tu-backend.com',
  NEXT_PUBLIC_API_URL: 'http://tu-backend.com',
  // ... más variables
}
```

### Modo Cluster (Múltiples Instancias)

Para aprovechar múltiples CPUs, edita `pm2.config.js`:

```javascript
instances: 'max',  // Usa todos los CPUs
// o
instances: 4,      // Número específico
```

---

## 🔄 Actualización de la Aplicación

```bash
# 1. Pull de cambios
git pull origin dev

# 2. Instalar dependencias (si hay cambios)
pnpm install

# 3. Build
pnpm run build

# 4. Reload sin downtime
pm2 reload securitySuite

# O restart normal
pm2 restart securitySuite
```

---

## 🔐 Auto-inicio en el Sistema

Para que la app inicie automáticamente al reiniciar el servidor:

```bash
# 1. Generar script de startup
pm2 startup

# 2. Ejecutar el comando que te muestra (con sudo)
# Ejemplo: sudo env PATH=$PATH:/usr/bin ...

# 3. Guardar configuración actual
pm2 save

# 4. Verificar
sudo systemctl status pm2-$USER
```

---

## 📊 Rotación de Logs

PM2 rota automáticamente los logs cada día:

- **Max size**: 10MB por archivo
- **Retention**: 30 días
- **Compression**: Sí (gzip)
- **Rotación**: Diaria a las 00:00

Configuración en `setup-pm2.sh`:

```bash
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

---

## 🚨 Troubleshooting

### App no inicia

```bash
# Ver logs detallados
pm2 logs securitySuite --lines 100

# Verificar que existe el build
ls -la .next/standalone/

# Verificar puerto ocupado
sudo lsof -i :4000
sudo netstat -tulpn | grep 4000
```

### Alto uso de memoria

```bash
# Ver consumo actual
pm2 monit

# Reiniciar app
pm2 restart securitySuite

# Ajustar límite en pm2.config.js
max_memory_restart: '2G'  # Aumentar a 2GB
```

### Logs no rotan

```bash
# Verificar módulo instalado
pm2 list

# Reinstalar pm2-logrotate
pm2 uninstall pm2-logrotate
pm2 install pm2-logrotate
bash setup-pm2.sh  # Reconfigurar
```

### PM2 no inicia al reiniciar servidor

```bash
# Verificar servicio
sudo systemctl status pm2-$USER

# Habilitar servicio
sudo systemctl enable pm2-$USER

# Regenerar startup
pm2 unstartup
pm2 startup
# Ejecutar comando sudo que aparece
pm2 save
```

---

## 📁 Estructura de Archivos

```
security_suite/
├── pm2.config.js          # Configuración de PM2
├── start-pm2.sh           # Script de inicio
├── setup-pm2.sh           # Setup inicial
├── logs/                  # Logs de PM2
│   ├── pm2-out.log       # Output normal
│   ├── pm2-error.log     # Errores
│   └── pm2-*.log.gz      # Logs rotados (comprimidos)
├── .next/                 # Build de Next.js
│   └── standalone/       # Build standalone
└── node_modules/          # Dependencias
```

---

## 🌐 Acceso a la Aplicación

- **Local**: http://localhost:4000
- **Red local**: http://TU_IP_SERVIDOR:4000
- **Producción**: Configurar Nginx/Apache como reverse proxy

---

## 📊 Monitoreo Avanzado (Opcional)

### PM2 Plus (Dashboard Web)

PM2 Plus ofrece monitoreo en la nube (gratis para 1 servidor):

```bash
# Crear cuenta en: https://app.pm2.io

# Vincular servidor
pm2 link <secret_key> <public_key>

# Ver dashboard en: https://app.pm2.io
```

Características:
- ✅ Dashboard web en tiempo real
- ✅ Alertas por email/Slack
- ✅ Monitoreo de métricas (CPU, RAM, etc.)
- ✅ Logs centralizados
- ✅ Issue tracking

---

## 🔒 Seguridad

### Usuario No-Root

Ejecuta PM2 como usuario no-root:

```bash
# NO uses sudo pm2
# Usa tu usuario normal
pm2 start pm2.config.js
```

### Variables Sensibles

No pongas secretos en `pm2.config.js` si está en git:

```bash
# Opción 1: Usar .env
# Crear .env.production con secretos
# PM2 lo carga automáticamente

# Opción 2: Variables del sistema
export SECRET_KEY="mi-secreto"
pm2 restart securitySuite --update-env
```

---

## 📞 Ayuda

- **Documentación PM2**: https://pm2.keymetrics.io/
- **Issues del proyecto**: GitHub Issues
- **Logs**: `pm2 logs securitySuite`

---

## 🎯 Comparación: PM2 vs Docker

### Cuándo usar PM2:
- ✅ Servidor único sin Docker
- ✅ Deployment simple y rápido
- ✅ Servidor con recursos limitados
- ✅ Necesitas hot-reload en producción

### Cuándo usar Docker:
- ✅ Múltiples servicios/microservicios
- ✅ Aislamiento completo
- ✅ Portabilidad entre entornos
- ✅ Orquestación con Kubernetes

**Puedes usar ambos**: Docker para el entorno + PM2 dentro del container.

---

## 📝 Scripts NPM Adicionales (Opcional)

Agrega a `package.json`:

```json
{
  "scripts": {
    "pm2:start": "bash start-pm2.sh",
    "pm2:stop": "pm2 stop securitySuite",
    "pm2:restart": "pm2 restart securitySuite",
    "pm2:logs": "pm2 logs securitySuite",
    "pm2:monit": "pm2 monit",
    "pm2:status": "pm2 status"
  }
}
```

Uso:
```bash
pnpm run pm2:start
pnpm run pm2:logs
pnpm run pm2:status
```
