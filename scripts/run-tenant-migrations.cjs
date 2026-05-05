/* eslint-disable no-console */
/**
 * Run pending TypeORM migrations against a tenant database.
 *
 * Prerequisite: `npm run build` so `dist/src/migrations/tenant/*.js` exists.
 *
 * Usage:
 *   node scripts/run-tenant-migrations.cjs <subdomain-or-dbName>
 *
 * Example:
 *   node scripts/run-tenant-migrations.cjs acme
 *
 * Reads master DB from DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME (.env),
 * loads organizations row for that subdomain (or matching dbName), then
 * connects to the tenant database and runs dataSource.runMigrations().
 */
const path = require('path');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

async function loadOrganization(client, key) {
  const r = await client.query(
    `SELECT "dbName", "dbHost", "dbUser", "dbPassword", subdomain, name, status
     FROM organizations
     WHERE (LOWER(subdomain) = LOWER($1) OR LOWER("dbName") = LOWER($1))
       AND "deletedAt" IS NULL
     LIMIT 1`,
    [key],
  );
  if (r.rowCount === 0) return null;
  return r.rows[0];
}

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error('Usage: node scripts/run-tenant-migrations.cjs <subdomain-or-dbName>');
    console.error('Example: node scripts/run-tenant-migrations.cjs acme');
    process.exit(1);
  }

  const host = requireEnv('DB_HOST');
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = requireEnv('DB_USER');
  const pass = requireEnv('DB_PASS');
  const masterDb = requireEnv('DB_NAME');

  const master = new Client({
    host,
    port,
    user,
    password: pass,
    database: masterDb,
  });
  await master.connect();
  const org = await loadOrganization(master, key);
  await master.end();

  if (!org) {
    console.error(`No organization found for subdomain/dbName: "${key}" (including soft-deleted is excluded).`);
    process.exit(1);
  }

  if (org.status && String(org.status).toUpperCase() !== 'ACTIVE') {
    console.warn(`Warning: organization status is "${org.status}", not ACTIVE. Continuing anyway.`);
  }

  const tenantDb = org.dbName;
  if (!tenantDb || !String(tenantDb).trim()) {
    console.error('Organization has no dbName set.');
    process.exit(1);
  }

  const tenantHost = org.dbHost || host;
  const tenantUser = org.dbUser || user;
  const tenantPassword = org.dbPassword != null && String(org.dbPassword).trim() !== '' ? org.dbPassword : pass;

  const migrationsGlob = path.join(process.cwd(), 'dist', 'src', 'migrations', 'tenant', '*.js');

  const ds = new DataSource({
    type: 'postgres',
    host: tenantHost,
    port,
    username: tenantUser,
    password: tenantPassword,
    database: tenantDb,
    synchronize: false,
    logging: true,
    entities: [],
    migrations: [migrationsGlob],
  });

  console.log(`Tenant: ${org.name} (${org.subdomain}) → database "${tenantDb}" @ ${tenantHost}:${port}`);

  await ds.initialize();
  const pending = await ds.showMigrations();
  console.log(pending ? 'There are pending migrations; running…' : 'No pending migrations (schema may already be up to date).');
  const executed = await ds.runMigrations();
  for (const m of executed) {
    console.log(`Applied: ${m.name}`);
  }
  await ds.destroy();
  console.log('Finished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
