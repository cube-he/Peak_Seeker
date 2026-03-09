module.exports = {
  apps: [
    {
      name: 'vh-server',
      cwd: './apps/server',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      error_file: './logs/vh-server-error.log',
      out_file: './logs/vh-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'vh-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3004',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      error_file: './logs/vh-web-error.log',
      out_file: './logs/vh-web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'vh-ocr',
      cwd: './services/ocr-service',
      script: 'venv/bin/python',
      args: 'main.py',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        OCR_SERVICE_PORT: 8100
      },
      error_file: './logs/vh-ocr-error.log',
      out_file: './logs/vh-ocr-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
