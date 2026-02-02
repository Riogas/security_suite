#!/bin/bash
# diagnose-proxy.sh - Diagnosticar problemas de proxy

echo "🔍 Diagnóstico de Proxy - Security Suite"
echo "=========================================="
echo ""

# 1. Verificar variables de entorno en PM2
echo "1️⃣ Variables de entorno en PM2:"
pm2 show securitySuite | grep -A 20 "env:"
echo ""

# 2. Verificar conectividad al backend
echo "2️⃣ Prueba de conectividad al backend:"
BACKEND_URL="https://sgm-dev.glp.riogas.com.uy/servicios/SecuritySuite/loginUser"
echo "   URL: $BACKEND_URL"
echo ""
curl -X POST "$BACKEND_URL" \
  -H "Content-Type: application/json" \
  -d '{"UserName":"test","Password":"test","Sistema":"SecuritySuite"}' \
  -v \
  -k \
  --max-time 10 \
  2>&1 | head -n 30
echo ""

# 3. Verificar que el build de Next.js tenga la config correcta
echo "3️⃣ Verificar build de Next.js:"
if [ -f ".next/BUILD_ID" ]; then
  echo "   Build ID: $(cat .next/BUILD_ID)"
  echo "   Fecha del build: $(stat -c %y .next/BUILD_ID 2>/dev/null || stat -f %Sm .next/BUILD_ID 2>/dev/null)"
else
  echo "   ⚠️  No existe .next/BUILD_ID"
fi
echo ""

# 4. Verificar logs recientes de PM2
echo "4️⃣ Últimos errores en PM2:"
pm2 logs securitySuite --nostream --lines 20 --err 2>/dev/null | tail -n 20
echo ""

# 5. Probar endpoint de test
echo "5️⃣ Probar endpoint de test interno:"
echo "   GET http://localhost:3001/api/test-proxy"
curl -s http://localhost:3001/api/test-proxy | jq '.' 2>/dev/null || curl -s http://localhost:3001/api/test-proxy
echo ""
echo ""

# 6. Verificar DNS
echo "6️⃣ Resolución DNS:"
echo "   sgm-dev.glp.riogas.com.uy:"
nslookup sgm-dev.glp.riogas.com.uy 2>/dev/null | grep -A 2 "Name:" || host sgm-dev.glp.riogas.com.uy
echo ""

# 7. Verificar certificados SSL
echo "7️⃣ Certificado SSL del backend:"
echo | openssl s_client -servername sgm-dev.glp.riogas.com.uy -connect sgm-dev.glp.riogas.com.uy:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null
echo ""

echo "=========================================="
echo "✅ Diagnóstico completado"
echo ""
echo "💡 Siguiente paso:"
echo "   Si hay errores de conexión, revisar:"
echo "   1. Firewall entre servidores"
echo "   2. Certificados SSL"
echo "   3. Variables de entorno en pm2.config.js"
echo ""
