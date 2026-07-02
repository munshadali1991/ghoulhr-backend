const dotenv = require('dotenv');
const { pickStorageEnv, pickEmailEnv } = require('./scripts/pm2-env-shared.cjs');

dotenv.config({ path: `${__dirname}/.env` });

const sharedNestEnv = {
  NODE_ENV: process.env.NODE_ENV || 'local',
  ...pickStorageEnv(),
  ...pickEmailEnv(),
};

module.exports = {
  apps: [
    {
      name: 'ghoulhr-backend-staging',
      script: './dist/src/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        ...sharedNestEnv,
        PORT: process.env.PORT || 3100,
        APP_DOMAIN: process.env.APP_DOMAIN || 'peopleaiq.com',
        WEB_APP_ORIGINS:
          process.env.WEB_APP_ORIGINS ||
          'https://peopleaiq.com,https://www.peopleaiq.com,https://*.peopleaiq.com',
        COOKIE_SECURE: process.env.COOKIE_SECURE || 'true',
        TRUST_PROXY: process.env.TRUST_PROXY || 'true',
        DB_NAME: process.env.DB_NAME || 'ghoulhr_staging',
      },
    },
  ],
};
