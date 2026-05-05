import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateEmployeeTableForAuth1714000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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

    // Convert dateOfBirth and dateOfJoining from VARCHAR to DATE
    await queryRunner.query(`
      ALTER TABLE employees
      ALTER COLUMN "dateOfBirth" TYPE DATE USING "dateOfBirth"::DATE,
      ALTER COLUMN "dateOfJoining" TYPE DATE USING "dateOfJoining"::DATE
    `);

    // Drop globalUserId column (no longer needed)
    await queryRunner.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS "globalUserId"
    `);

    // Drop employeeId column (replaced by employeeCode)
    await queryRunner.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS "employeeId"
    `);

    // Update role enum values
    await queryRunner.query(`
      ALTER TABLE employees
      ALTER COLUMN "role" TYPE VARCHAR(50)
    `);

    await queryRunner.query(`
      UPDATE employees SET "role" = 'ORG_ADMIN' WHERE "role" = 'ADMIN'
    `);

    // Indexes (IF NOT EXISTS: migration may re-run if partially applied or DB was patched manually)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_EMPLOYEE_CODE_UNIQUE" ON "employees" ("employeeCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_EMAIL" ON "employees" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_ROLE" ON "employees" ("role")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMPLOYEE_STATUS" ON "employees" ("status")
    `);

    // Set default password for existing employees (they'll need to reset)
    await queryRunner.query(`
      UPDATE employees
      SET "password" = 'TEMP_PASSWORD_REQUIRES_RESET'
      WHERE "password" = '' OR "password" IS NULL
    `);

    // Set createdBy to a default value for existing records
    await queryRunner.query(`
      UPDATE employees
      SET "createdBy" = '00000000-0000-0000-0000-000000000000'
      WHERE "createdBy" = '00000000-0000-0000-0000-000000000000'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EMPLOYEE_CODE_UNIQUE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EMPLOYEE_EMAIL"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EMPLOYEE_ROLE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EMPLOYEE_STATUS"`);

    // Add back globalUserId and employeeId
    await queryRunner.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS "globalUserId" UUID,
      ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(50)
    `);

    // Convert dates back to VARCHAR
    await queryRunner.query(`
      ALTER TABLE employees
      ALTER COLUMN "dateOfBirth" TYPE VARCHAR(50),
      ALTER COLUMN "dateOfJoining" TYPE VARCHAR(50)
    `);

    // Drop new columns
    await queryRunner.query(`
      ALTER TABLE employees
      DROP COLUMN IF EXISTS "employeeCode",
      DROP COLUMN IF EXISTS "password",
      DROP COLUMN IF EXISTS "status",
      DROP COLUMN IF EXISTS "mustChangePassword",
      DROP COLUMN IF EXISTS "passwordChangedAt",
      DROP COLUMN IF EXISTS "lastLoginAt",
      DROP COLUMN IF EXISTS "failedLoginAttempts",
      DROP COLUMN IF EXISTS "lockedUntil",
      DROP COLUMN IF EXISTS "dateOfExit",
      DROP COLUMN IF EXISTS "probationEndDate",
      DROP COLUMN IF EXISTS "createdBy",
      DROP COLUMN IF EXISTS "updatedBy"
    `);
  }
}
