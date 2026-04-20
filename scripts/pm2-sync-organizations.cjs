/* eslint-disable no-console */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const ROOT = path.resolve(__dirname, '..');
const NEST_ENTRY = path.join(ROOT, 'dist', 'src', 'main.js');
// PM2 only parses JS ecosystem files when the path contains `.config.js` (see pm2 Common.isConfigFile).
const OUTPUT_FILE = path.join(ROOT, 'ecosystem.organizations.generated.config.js');
const SUPERADMIN_PORT = Number(process.env.SUPERADMIN_PORT || 3000);
const PROXY_PORT = Number(process.env.PROXY_PORT || 8080);

function buildApp(name, env = {}) {
  return {
    name,
    // Nest build emits entry under dist/src/ (see tsconfig outDir + sourceRoot)
    script: './dist/src/main.js',
    cwd: ROOT,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'local',
      ...env,
    },
  };
}

async function loadOrganizations() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    const result = await client.query(
      `SELECT subdomain, org_port
       FROM organizations
       WHERE status = 'ACTIVE'
         AND org_port IS NOT NULL
         AND "deletedAt" IS NULL
       ORDER BY subdomain ASC`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function writeEcosystem(apps) {
  const content = `module.exports = ${JSON.stringify({ apps }, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
}

async function run() {
  if (!fs.existsSync(NEST_ENTRY)) {
    console.error(
      `[pm2-sync] Missing ${NEST_ENTRY}. Run "npm run build" in ghoulhr-backend first.`,
    );
    process.exit(1);
  }

  const rows = await loadOrganizations();
  const apps = [];

  apps.push(
    buildApp('ghoulhr-superadmin', {
      PORT: SUPERADMIN_PORT,
      TENANT_LOCK_SUBDOMAIN: '',
    }),
  );

  for (const row of rows) {
    const subdomain = String(row.subdomain).trim().toLowerCase();
    const orgPort = Number(row.org_port);
    if (!subdomain || !Number.isInteger(orgPort) || orgPort <= 0) {
      continue;
    }
    apps.push(
      buildApp(`ghoulhr-org-${subdomain}`, {
        PORT: orgPort,
        TENANT_LOCK_SUBDOMAIN: subdomain,
      }),
    );
  }

  apps.push({
    name: 'ghoulhr-domain-proxy',
    script: './proxy/domain-proxy.cjs',
    cwd: ROOT,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'local',
      PROXY_PORT: PROXY_PORT,
      SUPERADMIN_PORT: SUPERADMIN_PORT,
    },
  });

  writeEcosystem(apps);
  console.log(`[pm2-sync] generated ${OUTPUT_FILE}`);
  console.log(`[pm2-sync] apps: ${apps.map((a) => a.name).join(', ')}`);

  const pm2Bin = path.join(ROOT, 'node_modules', '.bin', 'pm2');
  const pm2Cmd = fs.existsSync(pm2Bin) ? `"${pm2Bin}"` : 'pm2';
  execSync(`${pm2Cmd} startOrReload "${OUTPUT_FILE}" --update-env`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
  execSync(`${pm2Cmd} save`, { stdio: 'inherit', cwd: ROOT });
}

run().catch((error) => {
  console.error('[pm2-sync] failed:', error);
  process.exit(1);
});
