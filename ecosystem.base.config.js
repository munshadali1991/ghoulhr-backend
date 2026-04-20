module.exports = {
  apps: [
    {
      name: 'ghoulhr-superadmin',
      script: './dist/src/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'local',
        PORT: process.env.SUPERADMIN_PORT || 3000,
        TENANT_LOCK_SUBDOMAIN: '',
      },
    },
    {
      name: 'ghoulhr-domain-proxy',
      script: './proxy/domain-proxy.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'local',
        PROXY_PORT: process.env.PROXY_PORT || 8080,
        SUPERADMIN_PORT: process.env.SUPERADMIN_PORT || 3000,
      },
    },
  ],
};
