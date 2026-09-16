// Entorno de secapi. Vive afuera porque lo comparten el server y el job
// `sync-admsec`: la cadena de conexión y la api-key tienen que ser las mismas
// en los dos, y duplicarlas es garantía de que un día queden desfasadas.
const envSecapi = {
  NODE_ENV: 'production',
  PORT: 3001,
  HOSTNAME: '0.0.0.0',
  NEXT_TELEMETRY_DISABLED: 1,
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
  UV_THREADPOOL_SIZE: 2,

  // App Config
  NEXT_PUBLIC_APLICACION_ID: '1',
  APLICACION_ID: '1',

  // API URLs
  NEXT_PUBLIC_MENU_API_URL: '/api/Menu',
  NEXT_PUBLIC_PERMISOS_API_URL: '/api/Permisos',
  PERMISOS_API_URL: 'https://sgm.glp.riogas.com.uy/servicios/SecuritySuite/Permisos',

  // Backend URL
  BACKEND_BASE_URL: 'https://sgm.glp.riogas.com.uy/servicios/SecuritySuite',

  // Database (Prisma)
  DATABASE_URL: 'postgresql://postgres:CVRY,m7r:dHy@192.168.2.117:5432/securitysuite?schema=public',

  // AS400 API (auth fallback: SGM y LDAP)
  AS400_API_URL: 'http://localhost:5000',
  DESPACHO_ROL_ID: '49',
  DESPACHO_APLICACION_ID: '5',

  // USERS_API_KEY (salida hacia el as400-api) y SECAPI_SERVICE_KEY NO van acá:
  // este archivo está versionado, así que un secreto puesto acá termina en el
  // repo. Van en /var/www/secapi/.env.production (lo lee Next) y en
  // /var/www/secapi/.env (lo lee el as400-api, cuyo cwd es este directorio).
  // Y ojo: definirlas acá aunque sea VACÍAS las silencia, porque el env de pm2
  // le gana a dotenv — que no pisa lo que ya está en process.env. Eso fue
  // exactamente lo que hizo fallar la primera corrida con SIN_USERS_API_KEY.

  // Middleware Debug (0 = off, 1 = on)
  DEBUG_MW: '0',

  // Route Salt
  ROUTE_SALT: 's',
};

module.exports = {
  apps: [
    {
      name: 'securitySuite',
      cwd: '/var/www/secapi',   // Path absoluto: evita que pm2 resuelva rutas
                                // relativas contra el dir de quien invoca.
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',  // Modo fork en lugar de cluster
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Variables de entorno
      env: envSecapi,

      // Logs
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Timeouts
      listen_timeout: 10000,
      kill_timeout: 5000,
      
      // Gestión de errores
      exp_backoff_restart_delay: 100,
    },

    {
      name: 'as400-api',
      cwd: '/var/www/secapi',   // Path absoluto: pm2 resuelve script y logs
                                // contra este dir, no contra $PWD de quien
                                // ejecuta `pm2 start`.
      script: 'as400-api/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'production',
        PORT: 5000,

        // JAVA_HOME: el paquete `java` (dep transitiva de node-jt400)
        // necesita esta env var para encontrar la JVM tanto al compilar
        // los bindings nativos como en runtime. pm2 no hereda /etc/environment.
        JAVA_HOME: '/usr/lib/jvm/java-17-openjdk-amd64',

        // AS400 / DB2
        AS400_HOST: '192.168.1.8',
        AS400_USER: 'qsecofr',
        AS400_PASSWORD: 'wwm868',
        AS400_LIBRARIES: 'GXICAGEO,QGPL',
        AS400_ENCRYPT_KEY: 'e57bfc8ea91ab3e2f1201b5b3612eea2',

        // LDAP / Active Directory
        LDAP_HOST: '192.168.1.7',
        LDAP_PORT: '389',
        LDAP_DOMAIN: 'glp',
        LDAP_BASE_DN: 'DC=glp,DC=riogas,DC=com,DC=uy',
        LDAP_GROUP_DESPACHO: '52',
      },

      error_file: './logs/as400-api-error.log',
      out_file: './logs/as400-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
    },

    {
      name: 'sync-admsec',
      cwd: '/var/www/secapi',   // Igual que los otros dos: pm2 resuelve el
                                // script, los logs y el .env contra este dir.

      // Va por pm2 y no por /etc/cron.d porque en producción no hay .env: pm2
      // es lo único que inyecta DATABASE_URL, AS400_API_URL y USERS_API_KEY.
      // `interpreter` y no `script: '.bin/tsx'`: el bin de tsx que instala pnpm
      // es un shell script POSIX, y pm2 en fork mode intenta cargar el `script`
      // con el loader de Node — revienta con un SyntaxError de módulo antes de
      // ejecutar nada. Así pm2 hace `tsx scripts/sync-admsec.ts`, que es lo que
      // corresponde.
      script: 'scripts/sync-admsec.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      cron_restart: '0 * * * *',
      autorestart: false,  // Es un job, no un servicio: termina siempre. Sin
                           // esto pm2 lo toma por caído y lo relanza en loop.

      env: {
        ...envSecapi,
        TZ: 'America/Montevideo',
        // En 'si' desde el 2026-09-02, con la corrida en seco revisada
        // (1.106 filas leídas, altas=1072, cambios=0, omitidos=20). Ojo que dev
        // y prod apuntan a la MISMA Postgres de producción: correr este script
        // desde el repo con esta variante escribe en el padrón real.
        SYNC_ADMSEC_ESCRIBE: 'si',
      },

      error_file: './logs/sync-admsec-error.log',
      out_file: './logs/sync-admsec-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
