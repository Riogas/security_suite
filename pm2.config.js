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
      env: {
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

        // Middleware Debug (0 = off, 1 = on)
        DEBUG_MW: '0',

        // Route Salt
        ROUTE_SALT: 's',
      },

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
  ],
};
