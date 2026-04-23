#!/bin/bash
#
# Script de despliegue para el entorno DEV de secapi (security_suite).
# Maneja las DOS apps pm2 del proyecto:
#   - securitySuite  (Next.js, /var/www/secapi)
#   - as400-api      (Express, /var/www/secapi/as400-api)
#
# Claves del script:
# - Hace pnpm install + pnpm build para el Next (siempre).
# - NO hace npm install automático en as400-api/ — node-jt400 tiene un
#   patch manual pendiente para Node 22 (ver docs) y un install limpio
#   puede romper los bindings nativos. Solo avisa si cambió el lockfile.
# - Reinicia as400-api SOLO si su código cambió en el pull.
# - Usa "describe + restart / start" para cubrir el caso en que algún
#   proceso fue eliminado de pm2 (como pasó con goya).
# - pm2 restart con --update-env para que tome cambios del .env.

set -euo pipefail

APP_NAME="secapi"
APP_DIR="/var/www/secapi"
BRANCH="dev"

PM2_APP_NAME="securitySuite"
AS400_API_NAME="as400-api"
AS400_API_DIR="$APP_DIR/as400-api"
PM2_CONFIG="$APP_DIR/pm2.config.js"

APP_USER="node"
APP_GROUP="node"

CLEAN_UNTRACKED="no"

trap 'echo; echo "ERROR: El despliegue de ${APP_NAME} falló en la línea ${LINENO}."; exit 1' ERR

echo "=================================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Inicio despliegue DEV ${APP_NAME}"
echo "=================================================="

# ─── Validaciones ──────────────────────────────────────────────
echo
echo "===== VALIDACIONES INICIALES ====="

[ -d "$APP_DIR" ] || { echo "ERROR: $APP_DIR no existe"; exit 1; }
[ -d "$APP_DIR/.git" ] || { echo "ERROR: $APP_DIR no es repo Git"; exit 1; }

echo "Aplicación : $APP_NAME"
echo "Directorio : $APP_DIR"
echo "Rama       : $BRANCH"
echo "Usuario app: $APP_USER"

echo "Verificando acceso a Git..."
sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null

echo "Verificando que el repositorio no tenga cambios locales..."
if ! sudo -u "$APP_USER" git -C "$APP_DIR" diff --quiet || \
   ! sudo -u "$APP_USER" git -C "$APP_DIR" diff --cached --quiet; then
    echo "ERROR: Hay cambios locales en archivos versionados."
    sudo -u "$APP_USER" git -C "$APP_DIR" status --short
    exit 1
fi

# ─── Sincronización Git ────────────────────────────────────────
echo
echo "===== SINCRONIZACION GIT ====="

PREV_COMMIT=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse HEAD)

echo "Obteniendo cambios desde origin..."
sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin

echo "Validando que exista origin/$BRANCH ..."
sudo -u "$APP_USER" git -C "$APP_DIR" show-ref --verify --quiet "refs/remotes/origin/$BRANCH" \
    || { echo "ERROR: origin/$BRANCH no existe"; exit 1; }

echo "Cambiando a rama $BRANCH..."
sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"

echo "Sincronizando con origin/$BRANCH..."
sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"

NEW_COMMIT=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse HEAD)

if [ "$CLEAN_UNTRACKED" = "yes" ]; then
    echo "Limpiando archivos no versionados..."
    sudo -u "$APP_USER" git -C "$APP_DIR" clean -fd
else
    echo "Limpieza de archivos no versionados desactivada."
fi

# ─── Detección de cambios en paths críticos ────────────────────
AS400_CHANGED="no"
AS400_DEPS_CHANGED="no"
NEXT_CHANGED="no"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
    echo "No hubo cambios desde el último deploy ($PREV_COMMIT)."
else
    echo "Analizando archivos modificados entre $PREV_COMMIT y $NEW_COMMIT..."
    CHANGED_FILES=$(sudo -u "$APP_USER" git -C "$APP_DIR" diff --name-only "$PREV_COMMIT" "$NEW_COMMIT")

    # as400-api: cualquier archivo bajo as400-api/ → se reinicia el proceso
    if echo "$CHANGED_FILES" | grep -q "^as400-api/"; then
        AS400_CHANGED="yes"
    fi
    # Cambios en deps del as400-api (package.json / lockfile)
    if echo "$CHANGED_FILES" | grep -qE "^as400-api/(package\.json|package-lock\.json)$"; then
        AS400_DEPS_CHANGED="yes"
    fi
    # Next.js cambió si se tocaron cosas fuera de as400-api/ o docs/
    if echo "$CHANGED_FILES" | grep -vE "^(as400-api/|docs/)" | grep -q .; then
        NEXT_CHANGED="yes"
    fi

    echo "  - as400-api modificado:     $AS400_CHANGED"
    echo "  - as400-api deps cambiaron: $AS400_DEPS_CHANGED"
    echo "  - Next.js modificado:       $NEXT_CHANGED"
fi

# ─── Dependencias Next.js (siempre corre) ──────────────────────
echo
echo "===== DEPENDENCIAS (Next.js / pnpm) ====="
echo "Instalando dependencias con pnpm..."
sudo -u "$APP_USER" bash -c "
    cd '$APP_DIR'
    export PATH=\$PATH:/usr/local/bin:/home/$APP_USER/.local/share/pnpm
    pnpm install --no-frozen-lockfile
"

# ─── Aviso si cambiaron deps de as400-api ──────────────────────
if [ "$AS400_DEPS_CHANGED" = "yes" ]; then
    echo
    echo "===== AS400-API: DEPENDENCIAS MODIFICADAS ====="
    echo "⚠️  Cambiaron package.json / package-lock.json en as400-api/."
    echo "⚠️  Este script NO hace npm install automático porque node-jt400"
    echo "⚠️  tiene un patch manual pendiente para Node 22 (ver"
    echo "⚠️  docs o CLAUDE.md del repo) y un install limpio puede romper"
    echo "⚠️  los bindings nativos."
    echo ""
    echo "   Si estás seguro de que querés reinstalar, correr manualmente:"
    echo "     sudo -u $APP_USER bash -c 'cd $AS400_API_DIR && npm ci'"
    echo "     y probar 'curl http://localhost:5000/api/health' antes de"
    echo "     continuar."
fi

# ─── Build Next.js ─────────────────────────────────────────────
if grep -q '"build"' "$APP_DIR/package.json"; then
    echo
    echo "===== BUILD (Next.js) ====="
    echo "Ejecutando build..."
    sudo -u "$APP_USER" bash -c "
        cd '$APP_DIR'
        export PATH=\$PATH:/usr/local/bin:/home/$APP_USER/.local/share/pnpm
        pnpm run build
    "
else
    echo "No hay script build en package.json, se omite."
fi

# ─── Permisos ──────────────────────────────────────────────────
echo
echo "===== PERMISOS ====="
echo "Ajustando permisos de $APP_DIR..."
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

# ─── Reinicio Next.js (securitySuite) ──────────────────────────
echo
echo "===== REINICIO: $PM2_APP_NAME ====="
if sudo -u "$APP_USER" pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    echo "Reiniciando $PM2_APP_NAME con --update-env..."
    sudo -u "$APP_USER" pm2 restart "$PM2_APP_NAME" --update-env
else
    echo "⚠️  $PM2_APP_NAME no está registrado en pm2. Levantándolo desde $PM2_CONFIG..."
    sudo -u "$APP_USER" pm2 start "$PM2_CONFIG" --only "$PM2_APP_NAME"
    sudo -u "$APP_USER" pm2 save
fi

# ─── Reinicio as400-api (condicional) ──────────────────────────
echo
echo "===== REINICIO: $AS400_API_NAME ====="
if [ "$AS400_CHANGED" = "yes" ]; then
    if sudo -u "$APP_USER" pm2 describe "$AS400_API_NAME" >/dev/null 2>&1; then
        echo "as400-api tuvo cambios, reiniciando con --update-env..."
        sudo -u "$APP_USER" pm2 restart "$AS400_API_NAME" --update-env
    else
        echo "⚠️  $AS400_API_NAME no está en pm2. Levantándolo desde $PM2_CONFIG..."
        sudo -u "$APP_USER" pm2 start "$PM2_CONFIG" --only "$AS400_API_NAME"
        sudo -u "$APP_USER" pm2 save
    fi
else
    if sudo -u "$APP_USER" pm2 describe "$AS400_API_NAME" >/dev/null 2>&1; then
        echo "as400-api sin cambios, no se reinicia (está up)."
    else
        echo "⚠️  $AS400_API_NAME no está en pm2 y no tuvo cambios."
        echo "   Si debería estar corriendo, levantalo a mano:"
        echo "     sudo -u $APP_USER pm2 start $PM2_CONFIG --only $AS400_API_NAME"
        echo "     sudo -u $APP_USER pm2 save"
    fi
fi

# ─── Healthcheck final ─────────────────────────────────────────
echo
echo "===== HEALTHCHECK ====="
sleep 2

echo -n "securitySuite (pm2): "
sudo -u "$APP_USER" pm2 describe "$PM2_APP_NAME" 2>/dev/null | grep -E "^\s*status\s*:" | head -1 || echo "no info"

echo -n "as400-api (pm2): "
sudo -u "$APP_USER" pm2 describe "$AS400_API_NAME" 2>/dev/null | grep -E "^\s*status\s*:" | head -1 || echo "no registrado"

echo -n "as400-api (:5000): "
curl -sf -m 3 http://localhost:5000/api/health && echo "" || echo "no responde"

# ─── Fin ───────────────────────────────────────────────────────
echo
echo "=================================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Despliegue DEV ${APP_NAME} finalizado correctamente"
echo "=================================================="
