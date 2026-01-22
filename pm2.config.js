module.exports = {
  apps: [
    {
      name: 'securitySuite',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: './',
      instances: 1,
      exec_mode: 'cluster',
      
      // Variables de entorno
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_TELEMETRY_DISABLED: 1,
        NEXT_PUBLIC_APLICACION_ID: 1,
        NEXT_PUBLIC_MENU_API_URL: '/api/Menu',
        NEXT_PUBLIC_PERMISOS_API_URL: '/api/Permisos',
        // Agrega más variables según necesites desde docker-compose.yml
      },

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      
      // Rotación de logs
      log_type: 'json',
      max_memory_restart: '1G',
      
      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Monitoreo
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next'],
      
      // Timeouts
      listen_timeout: 10000,
      kill_timeout: 5000,
      
      // Configuración de cluster
      instance_var: 'INSTANCE_ID',
      
      // Gestión de errores
      exp_backoff_restart_delay: 100,
    },
  ],
};
