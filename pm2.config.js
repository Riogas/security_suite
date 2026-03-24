module.exports = {
  apps: [
    {
      name: 'securitySuite',
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
  ],
};
