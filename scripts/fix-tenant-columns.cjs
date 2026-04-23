/**
 * Script to fix the organization_settings table column names in tenant databases
 * Run this to rename snake_case columns to camelCase
 */

const { Client } = require('pg');
require('dotenv').config();

async function fixTenantDatabase(dbName) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS,
    database: dbName,
  });

  try {
    await client.connect();
    console.log(`\n🔧 Fixing tenant database: ${dbName}`);

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'organization_settings'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log(`⚠️  Table organization_settings does not exist in ${dbName}`);
      return;
    }

    // Rename columns
    await client.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN created_at TO "createdAt"
    `);
    console.log('✅ Renamed created_at → createdAt');

    await client.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN updated_at TO "updatedAt"
    `);
    console.log('✅ Renamed updated_at → updatedAt');

    await client.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN deleted_at TO "deletedAt"
    `);
    console.log('✅ Renamed deleted_at → deletedAt');

    console.log(`\n✨ Successfully fixed ${dbName}`);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log(`ℹ️  Columns already renamed or don't exist in ${dbName}`);
    } else {
      console.error(`❌ Error fixing ${dbName}:`, error.message);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  // Get all tenant databases from the master database
  const masterClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'ghoulhr',
  });

  try {
    await masterClient.connect();
    console.log('📋 Fetching tenant databases...');

    const result = await masterClient.query(`
      SELECT "dbName", subdomain, status 
      FROM organizations 
      WHERE "dbName" IS NOT NULL 
        AND status = 'ACTIVE'
    `);

    if (result.rows.length === 0) {
      console.log('No active tenant databases found');
      return;
    }

    console.log(`Found ${result.rows.length} tenant database(s):\n`);
    result.rows.forEach(row => {
      console.log(`  - ${row.subdomain}: ${row.dbName}`);
    });

    // Fix each tenant database
    for (const org of result.rows) {
      await fixTenantDatabase(org.dbName);
    }

    console.log('\n✅ All tenant databases fixed!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await masterClient.end();
  }
}

main();
