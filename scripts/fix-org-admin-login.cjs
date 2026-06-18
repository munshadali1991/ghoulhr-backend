/* eslint-disable no-console */
/**
 * Repairs org admin employee login: sets password to admin@123 (if never logged in)
 * and clears lockout from failed attempts.
 *
 * Usage: node scripts/fix-org-admin-login.cjs [subdomain]
 */
const { Client } = require('pg');
const { randomBytes, scryptSync, timingSafeEqual } = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const DEFAULT_PASSWORD = 'admin@123';

function verifyPassword(candidate, storedHash) {
  try {
    const [salt, storedDerivedKey] = storedHash.split(':');
    if (!salt || !storedDerivedKey) return false;
    const derivedKey = scryptSync(candidate, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(derivedKey), Buffer.from(storedDerivedKey));
  } catch {
    return false;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

async function main() {
  const subdomainFilter = process.argv[2]?.trim().toLowerCase();

  const master = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await master.connect();

  let query = `SELECT id, subdomain, "adminEmail", "dbName"
     FROM organizations
     WHERE "deletedAt" IS NULL AND "adminEmail" IS NOT NULL`;
  const params = [];
  if (subdomainFilter) {
    query += ' AND subdomain = $1';
    params.push(subdomainFilter);
  }

  const orgs = await master.query(query, params);
  if (orgs.rowCount === 0) {
    console.log('No organizations with admin email found.');
    await master.end();
    return;
  }

  for (const org of orgs.rows) {
    const adminEmail = org.adminEmail.trim().toLowerCase();
    const dbName = org.dbName || org.subdomain;
    const tenant = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: dbName,
    });

    try {
      await tenant.connect();
      const emps = await tenant.query(
        `SELECT id, email, "lastLoginAt", password, "failedLoginAttempts", "lockedUntil"
         FROM employees WHERE LOWER(email) = $1`,
        [adminEmail],
      );

      if (emps.rowCount === 0) {
        console.log(`[${org.subdomain}] No employee for ${adminEmail}`);
        await tenant.end();
        continue;
      }

      const emp = emps.rows[0];
      if (emp.lastLoginAt) {
        console.log(`[${org.subdomain}] ${adminEmail} already logged in — skipped password reset`);
        await tenant.end();
        continue;
      }

      const matches = verifyPassword(DEFAULT_PASSWORD, emp.password);
      if (!matches) {
        await tenant.query(
          `UPDATE employees
           SET password = $1, "mustChangePassword" = true,
               "failedLoginAttempts" = 0, "lockedUntil" = NULL
           WHERE id = $2`,
          [hashPassword(DEFAULT_PASSWORD), emp.id],
        );
        console.log(`[${org.subdomain}] Reset password to ${DEFAULT_PASSWORD} for ${adminEmail}`);
      } else if (emp.failedLoginAttempts > 0 || emp.lockedUntil) {
        await tenant.query(
          `UPDATE employees SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = $1`,
          [emp.id],
        );
        console.log(`[${org.subdomain}] Unlocked ${adminEmail}`);
      } else {
        console.log(`[${org.subdomain}] ${adminEmail} credentials already OK`);
      }
      await tenant.end();
    } catch (err) {
      console.error(`[${org.subdomain}] Error:`, err.message);
    }
  }

  await master.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
