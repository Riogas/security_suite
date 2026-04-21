# 🚀 Guía de Despliegue a Producción

## 📋 Pre-requisitos en el Servidor

### Software Requerido
- **Node.js**: v18.17.0 o superior (v20+ recomendado)
- **pnpm**: v8.0.0 o superior
- **PM2**: Instalado globalmente (`npm install -g pm2`)
- **Git**: Para pull de cambios

### Variables de Entorno
El archivo `.env.production` contiene las variables necesarias y está incluido en el repositorio:

```bash
NEXT_PUBLIC_APLICACION_ID=SecuritySuite
BACKEND_BASE_URL=https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite
PERMISOS_API_URL=https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite/permisos
NODE_TLS_REJECT_UNAUTHORIZED=0
```

## 🔧 Configuración del Servidor (Primera Vez)

### 1. Verificar Node.js y pnpm
```bash
node --version  # Debe ser >= 18.17.0
pnpm --version  # Debe estar instalado
```

Si pnpm no está instalado:
```bash
npm install -g pnpm
```

### 2. Verificar PM2
```bash
pm2 --version
```

Si PM2 no está instalado:
```bash
npm install -g pm2
```

### 3. Clonar Repositorio (si es primera vez)
```bash
cd /var/www
git clone https://github.com/Riogas/security_suite.git secapi
cd secapi
git checkout dev
```

### 4. Configurar PM2 para Inicio Automático
```bash
pm2 startup systemd
# Ejecutar el comando que PM2 muestra
pm2 save
```

## 📦 Despliegue Paso a Paso

### Opción 1: Script Automático Completo (Recomendado)
```bash
cd /var/www/secapi
chmod +x deploy-production.sh
./deploy-production.sh
```

El script hace:
1. ✅ Verifica estado de Git
2. ✅ Pull de últimos cambios
3. ✅ Instala dependencias
4. ✅ Verifica vulnerabilidades
5. ✅ Build de producción
6. ✅ Detiene app anterior
7. ✅ Inicia con PM2
8. ✅ Guarda configuración
9. ✅ Muestra logs

### Opción 2: Script Rápido (Sin Verificaciones)
```bash
cd /var/www/secapi
chmod +x quick-deploy.sh
./quick-deploy.sh
```

### Opción 3: Comandos Manuales
```bash
cd /var/www/secapi

# 1. Obtener últimos cambios
git pull origin dev

# 2. Instalar dependencias
pnpm install

# 3. Build de producción
pnpm run build

# 4. Reiniciar con PM2
pm2 delete securitySuite 2>/dev/null || true
pm2 start pm2.config.js
pm2 save

# 5. Ver logs
pm2 logs securitySuite --lines 20
```

## 🔍 Verificación Post-Despliegue

### 1. Verificar Estado de PM2
```bash
pm2 status
```

Debería mostrar:
```
┌────┬────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name           │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ securitySuite  │ fork     │ 0    │ online    │ 0%       │ XXX MB   │
└────┴────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

### 2. Ver Logs en Tiempo Real
```bash
pm2 logs securitySuite
```

Para salir: `Ctrl + C`

### 3. Ver Últimas Líneas del Log
```bash
pm2 logs securitySuite --lines 50 --nostream
```

### 4. Probar Endpoint
```bash
# Desde el servidor
curl http://localhost:3001

# Debería retornar la página de login
```

### 5. Verificar Proxy a Backend
```bash
# Test de conectividad
curl -k https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite/salud

# Debe retornar respuesta del backend
```

## 🛠️ Comandos Útiles de PM2

### Gestión de Procesos
```bash
pm2 list                    # Listar todos los procesos
pm2 status                  # Estado detallado
pm2 restart securitySuite   # Reiniciar aplicación
pm2 stop securitySuite      # Detener aplicación
pm2 start securitySuite     # Iniciar aplicación
pm2 delete securitySuite    # Eliminar proceso
pm2 monit                   # Monitor en tiempo real
```

### Logs
```bash
pm2 logs securitySuite              # Ver logs en vivo
pm2 logs securitySuite --lines 100  # Ver últimas 100 líneas
pm2 logs securitySuite --err        # Solo errores
pm2 logs securitySuite --out        # Solo output normal
pm2 flush securitySuite             # Limpiar logs
```

### Información
```bash
pm2 info securitySuite     # Información detallada del proceso
pm2 env 0                  # Variables de entorno del proceso 0
```

### Configuración
```bash
pm2 save                   # Guardar lista de procesos actual
pm2 resurrect              # Restaurar procesos guardados
pm2 startup                # Configurar inicio automático
pm2 unstartup              # Desactivar inicio automático
```

## 🚨 Troubleshooting

### Problema: Build falla con errores de ESLint
**Solución**: Asegurarse de tener Next.js 16.1.6 o superior
```bash
cat package.json | grep '"next"'
# Debe mostrar: "next": "^16.1.6"
```

### Problema: Error SSL DEPTH_ZERO_SELF_SIGNED_CERT
**Solución**: Verificar que `NODE_TLS_REJECT_UNAUTHORIZED=0` en pm2.config.js
```bash
grep NODE_TLS pm2.config.js
```

### Problema: Puerto 3001 ya en uso
**Solución**:
```bash
# Ver qué está usando el puerto
lsof -i :3001

# Matar proceso
kill -9 <PID>

# O reiniciar PM2
pm2 restart securitySuite
```

### Problema: PM2 no encuentra el proceso
**Solución**:
```bash
# Eliminar todos los procesos
pm2 delete all

# Limpiar PM2
pm2 kill

# Reiniciar aplicación
pm2 start pm2.config.js
pm2 save
```

### Problema: Aplicación no responde
**Solución**:
```bash
# Ver logs de error
pm2 logs securitySuite --err --lines 50

# Reiniciar con logs
pm2 restart securitySuite && pm2 logs securitySuite
```

### Problema: Error 404 en rutas de API
**Solución**: Verificar que el proxy está funcionando
```bash
# Ver logs de Next.js
pm2 logs securitySuite | grep '\[Proxy\]'

# Debe mostrar líneas como:
# [Proxy] POST /api/loginUser
```

## 📊 Monitoreo

### Ver Uso de Recursos
```bash
pm2 monit
```

### Ver Logs de Error
```bash
tail -f /var/www/secapi/logs/error-*.log
```

### Ver Logs de Output
```bash
tail -f /var/www/secapi/logs/out-*.log
```

## 🔄 Rollback (Volver a Versión Anterior)

Si algo sale mal, puedes volver a una versión anterior:

```bash
cd /var/www/secapi

# Ver commits recientes
git log --oneline -10

# Volver a un commit específico
git checkout <commit-hash>

# Reinstalar y rebuildar
pnpm install
pnpm run build

# Reiniciar PM2
pm2 restart securitySuite
```

Para volver a la última versión:
```bash
git checkout dev
git pull origin dev
```

## 📝 Checklist de Despliegue

- [ ] Servidor tiene Node.js >= 18.17.0
- [ ] pnpm está instalado
- [ ] PM2 está instalado globalmente
- [ ] Repositorio clonado en `/var/www/secapi`
- [ ] Branch `dev` checked out
- [ ] `.env.production` existe y está configurado
- [ ] Pull de últimos cambios: `git pull origin dev`
- [ ] Dependencias instaladas: `pnpm install`
- [ ] Build exitoso: `pnpm run build`
- [ ] PM2 corriendo: `pm2 start pm2.config.js`
- [ ] Configuración guardada: `pm2 save`
- [ ] Aplicación responde en puerto 3001
- [ ] Logs muestran sin errores: `pm2 logs securitySuite`
- [ ] Proxy a backend funciona correctamente

## 🌐 URLs de Producción

- **Frontend**: http://localhost:3001 (interno al servidor)
- **Backend**: https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite
- **API Permisos**: https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite/permisos

## 🔒 Consideraciones de Seguridad

1. **Certificados SSL**: El backend usa certificados autofirmados, por eso `NODE_TLS_REJECT_UNAUTHORIZED=0`
2. **Puerto**: La aplicación corre en puerto 3001, debe estar detrás de un reverse proxy (nginx/apache)
3. **Logs**: Se rotan automáticamente (10MB max, 30 días)
4. **Variables**: No exponer `.env.production` fuera del servidor

## 📞 Soporte

Si hay problemas durante el despliegue:

1. Verificar logs: `pm2 logs securitySuite --lines 100`
2. Verificar estado: `pm2 status`
3. Verificar build: `pnpm run build`
4. Verificar conectividad: `curl http://localhost:3001`

---

**Última actualización**: enero 2025
**Versión Next.js**: 16.1.6
**Versión Node.js requerida**: >= 18.17.0
