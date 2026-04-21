#!/bin/bash
# fix-tmp-errors.sh - Limpia errores de archivos temporales en el sistema

set -e

echo "🔧 Limpiando errores de archivos temporales..."

# 1. Crear directorios temporales si no existen
echo "1️⃣ Verificando directorios temporales..."
sudo mkdir -p /tmp/.X11-unix
sudo mkdir -p /tmp/.XIN-unix
sudo chmod 1777 /tmp/.X11-unix 2>/dev/null || echo "  ⚠️  No se pudo cambiar permisos de .X11-unix (puede ser normal)"
sudo chmod 1777 /tmp/.XIN-unix 2>/dev/null || echo "  ⚠️  No se pudo cambiar permisos de .XIN-unix (puede ser normal)"

# 2. Limpiar archivos de cron problemáticos
echo "2️⃣ Limpiando archivos de cron..."
sudo rm -f /tmp/cron.* 2>/dev/null || echo "  ℹ️  No hay archivos cron para limpiar"
sudo rm -f /tmp/grep.txt 2>/dev/null || echo "  ℹ️  No hay grep.txt para limpiar"

# 3. Verificar permisos de /tmp
echo "3️⃣ Verificando permisos de /tmp..."
ls -la /tmp/ | head -n 20

echo ""
echo "✅ Limpieza completada"
echo ""
echo "📝 Ahora reinicia PM2 con:"
echo "   bash fix-pm2.sh"
