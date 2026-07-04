import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Departments/designations were created with GLOBAL unique constraints on
 * name/code. Because writes are organization-scoped (settings.service
 * updateDepartments/updateDesignations read/delete only the current org's rows
 * then re-insert), any name/code that already exists under a different or NULL
 * organizationId raises a global unique violation and surfaces as a raw HTTP 500.
 *
 * This migration replaces the global constraints with per-organization partial
 * unique indexes so uniqueness is enforced within an organization only. NULL
 * organizationId rows remain distinct in Postgres, so leftover legacy rows no
 * longer block new per-org inserts.
 */
export class DepartmentsDesignationsPerOrgUnique1802000000000
  implements MigrationInterface
{
  name = 'DepartmentsDesignationsPerOrgUnique1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "UQ_departments_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "UQ_departments_code"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_departments_org_name"
      ON "departments" ("organizationId", "name")
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_departments_org_code"
      ON "departments" ("organizationId", "code")
      WHERE "code" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "designations" DROP CONSTRAINT IF EXISTS "UQ_designations_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" DROP CONSTRAINT IF EXISTS "UQ_designations_code"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_designations_org_name"
      ON "designations" ("organizationId", "name")
      WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_designations_org_code"
      ON "designations" ("organizationId", "code")
      WHERE "code" IS NOT NULL AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_designations_org_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_designations_org_name"`);
    await queryRunner.query(
      `ALTER TABLE "designations" ADD CONSTRAINT "UQ_designations_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" ADD CONSTRAINT "UQ_designations_code" UNIQUE ("code")`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_departments_org_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_departments_org_name"`);
    await queryRunner.query(
      `ALTER TABLE "departments" ADD CONSTRAINT "UQ_departments_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" ADD CONSTRAINT "UQ_departments_code" UNIQUE ("code")`,
    );
  }
}
