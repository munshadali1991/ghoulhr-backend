const { DataSource } = require('typeorm');
require('dotenv').config({ path: '.env' });

async function runMigration() {
  // Connect to the tenant database
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'buggy', // Your tenant database name
  });

  try {
    await dataSource.initialize();
    console.log('Connected to tenant database: buggy');

    // Run the migration manually
    const queryRunner = dataSource.createQueryRunner();

    console.log('Starting migration...');

    // Add new columns
    await queryRunner.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS "employeeCode" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "password" VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_ACTIVATION',
      ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "dateOfExit" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "probationEndDate" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "createdBy" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
      ADD COLUMN IF NOT EXISTS "updatedBy" UUID
    `);
    console.log('✓ Added new columns');

    // Convert dateOfBirth and dateOfJoining from VARCHAR to DATE
    await queryRunner.query(`
      ALTER TABLE employees
      ALTER COLUMN "dateOfBirth" TYPE DATE USING "dateOfBirth"::DATE,
      ALTER COLUMN "dateOfJoining" TYPE DATE USING "dateOfJoining"::DATE
    `);
    console.log('✓ Converted date columns to DATE type');

    // Drop globalUserId column
    await queryRunner.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS "globalUserId"
    `);
    console.log('✓ Dropped globalUserId column');

    // Drop employeeId column
    await queryRunner.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS "employeeId"
    `);
    console.log('✓ Dropped employeeId column');

    // Update PostgreSQL enum type to include new values
    await queryRunner.query(`
      ALTER TYPE employees_role_enum ADD VALUE IF NOT EXISTS 'ORG_ADMIN'
    `);
    await queryRunner.query(`
      ALTER TYPE employees_role_enum ADD VALUE IF NOT EXISTS 'MANAGER'
    `);
    await queryRunner.query(`
      ALTER TYPE employees_role_enum ADD VALUE IF NOT EXISTS 'EMPLOYEE'
    `);
    console.log('✓ Updated role enum type');

    // Update role enum values
    await queryRunner.query(`
      UPDATE employees SET "role" = 'ORG_ADMIN' WHERE "role" = 'ADMIN'
    `);
    console.log('✓ Updated role values (ADMIN → ORG_ADMIN)');

    // Note: status column is VARCHAR, no enum update needed

    // Create indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_EMPLOYEE_CODE_UNIQUE"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_EMPLOYEE_CODE_UNIQUE" ON employees ("employeeCode")
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_EMPLOYEE_EMAIL"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_EMAIL" ON employees ("email")
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_EMPLOYEE_ROLE"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_ROLE" ON employees ("role")
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_EMPLOYEE_STATUS"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_STATUS" ON employees ("status")
    `);
    console.log('✓ Created indexes');

    console.log('\n✅ Migration completed successfully!');
    
    await queryRunner.release();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

runMigration().catch(console.error);
