#!/bin/bash
# quick-deploy.sh - Script rápido de despliegue (sin verificaciones)

cd /var/www/secapi
git pull origin dev
pnpm install
pnpm run build
pm2 delete securitySuite 2>/dev/null || true
pm2 start pm2.config.js
pm2 save
pm2 logs securitySuite --lines 20 --nostream
